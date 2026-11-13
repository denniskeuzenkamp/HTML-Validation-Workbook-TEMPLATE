/* ============================================================
   Validation Workbook Engine — core state, helpers, file readers
   Shared across every use case. Do not fork per use case.
   ============================================================ */

/* ---------- workbook state ---------- */
const S = { docs: [], reqs: [], ov: {}, match: {}, ai: {}, chunks: [], nb: false };
let role = 'Evidence';

/* ---------- use-case package (injected per build) ---------- */
const PKG = window.__USECASE__;
if (!PKG) throw new Error('No use-case package injected: window.__USECASE__ is missing.');

/* Compile the string patterns that build.py wrote into the package. */
const DATES = /\b20\d\d-\d\d-\d\d\b|\b\d{1,2}[ -](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ -]20\d\d\b/ig;
(function hydrate() {
  const V = PKG.evidenceVocab;
  V.design = new RegExp(V.design, 'i');
  V.operating = new RegExp(V.operating, 'i');
  V.designDetail = new RegExp(V.designDetail, 'ig');
  V.categories = V.categories.map(([re, label]) => [new RegExp(re, 'i'), label]);
  PKG.raciRules = PKG.raciRules.map(([re, raci]) => [new RegExp(re, 'i'), raci]);
  PKG.stopwords = new Set(PKG.stopwords);
  PKG.requirementCut.obligationRegex = new RegExp(PKG.requirementCut.obligationPattern, 'i');
})();

const TABS = [
  ['upload', 'Upload'],
  ['register', 'Source Register'],
  ['valid', 'Validation Sheet'],
  ['settings', 'AI Setting'],
  ['method', 'Method & IIA']
];

/* ---------- small helpers ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function tag(v) { return '<span class="tag ' + (TM[v] || 'pe') + '">' + esc(v) + '</span>'; }
function dl(name, txt, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type }));
  a.download = name;
  a.click();
}
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16); }

/* ---------- file readers ---------- */
async function inflate(u8, fmt) {
  const ds = new DecompressionStream(fmt);
  const w = ds.writable.getWriter(); w.write(u8); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function readDocx(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  let e = u.length - 22;
  while (e > 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  let n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true);
  for (let i = 0; i < n; i++) {
    const m = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true),
      nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true),
      cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.slice(p + 46, p + 46 + nl));
    if (name === 'word/document.xml') {
      const ln = dv.getUint16(lo + 26, true), lx = dv.getUint16(lo + 28, true);
      const data = u.slice(lo + 30 + ln + lx, lo + 30 + ln + lx + cs);
      const x = new TextDecoder().decode(m === 0 ? data : await inflate(data, 'deflate-raw'));
      return x.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    }
    p += 46 + nl + xl + cl;
  }
  return '';
}
async function readPdf(buf) {
  const u = new Uint8Array(buf);
  const s = new TextDecoder('latin1').decode(u);
  let out = '';
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const st = m.index + m[0].length, en = s.indexOf('endstream', st);
    if (en < 0) break;
    let d = u.slice(st, en);
    let txt;
    try { txt = new TextDecoder('latin1').decode(await inflate(d, 'deflate')); }
    catch (e) { txt = new TextDecoder('latin1').decode(d); }
    if (!/BT[\s\S]*ET/.test(txt)) { re.lastIndex = en; continue; }
    const bts = txt.match(/BT[\s\S]*?ET/g) || [];
    for (const b of bts) {
      const parts = b.match(/\[(?:[^\]\\]|\\.)*\]\s*TJ|\((?:[^)\\]|\\.)*\)\s*(?:Tj|'|")|T\*|T[dD]\s|ET/g) || [];
      for (const q of parts) {
        if (/^T[*dD]/.test(q) || q === 'ET') { out += ' '; continue; }
        const strs = q.match(/\((?:[^)\\]|\\.)*\)/g) || [];
        out += strs.map(z => z.slice(1, -1).replace(/\\([()\\])/g, '$1').replace(/\\n/g, ' ').replace(/\\(\d{3})/g, (a, o) => String.fromCharCode(parseInt(o, 8)))).join('');
      }
      out += '\n';
    }
    re.lastIndex = en;
  }
  return out.replace(/ {2,}/g, ' ');
}
async function add(files, r) {
  for (const f of files) {
    let t = '';
    try {
      if (/\.docx$/i.test(f.name)) t = await readDocx(await f.arrayBuffer());
      else if (/\.pdf$/i.test(f.name)) t = await readPdf(await f.arrayBuffer());
      else if (/\.(doc|xls|xlsx|ppt|pptx)$/i.test(f.name)) t = '';
      else t = await f.text();
    } catch (e) { console.error(e); }
    t = (t || '').trim();
    addDoc(f.name, r, t, f.size, f.lastModified, t.length < 20);
  }
  render();
}
function addPaste(r) {
  const n = prompt('Name for this document (e.g. ICT_Security_Policy.txt)');
  if (!n) return;
  const t = document.getElementById('paste' + r).value;
  if (t.trim().length < 20) return alert('Paste some text first');
  addDoc(n, r, t, t.length, Date.now(), false);
  document.getElementById('paste' + r).value = '';
  render();
}

/* ---------- evidence eligibility (rules come from the use-case package) ---------- */
function eligibility(name, t) {
  const V = PKG.evidenceVocab;
  const head = name + ' ' + t.slice(0, 500);
  const nd = (t.match(DATES) || []).length;
  const des = V.design.test(name) || (V.design.test(head) && nd < 3);
  const op = V.operating.test(name) || nd >= 3;
  const det = (t.match(V.designDetail) || []).length;
  const TD = des;
  const DE = des && det >= 6 && t.length > 600;
  const OE = op && !(V.design.test(name) && nd < 3);
  let cat = V.defaultCategory;
  for (const [re, label] of V.categories) { if (re.test(name)) { cat = label; break; } }
  return { TD, DE, OE, cat };
}

function addDoc(name, r, t, size, mod, unread) {
  const id = (r == 'Normative' ? 'N' : 'E') + String(S.docs.filter(d => d.role == r).length + 1).padStart(2, '0');
  const el = r == 'Normative'
    ? { TD: false, DE: false, OE: false, cat: 'Normative requirements' }
    : eligibility(name, t || '');
  const d = {
    id, name, role: r, text: t, size,
    mod: mod ? new Date(mod).toISOString().slice(0, 10) : '',
    hash: hash(t || name), unread,
    cat: el.cat, el: { TD: el.TD, DE: el.DE, OE: el.OE },
    added: new Date().toISOString().slice(0, 16).replace('T', ' ')
  };
  S.docs.push(d);
  if (r == 'Normative' && t) extractNorm(d);
  return d;
}
