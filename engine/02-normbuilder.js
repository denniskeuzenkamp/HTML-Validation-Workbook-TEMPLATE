/* ============================================================
   Validation Workbook Engine — Normbuilder Engine
   Converts normative documents into structured requirements and
   defines the four requirement classes with an LLM.
   ============================================================ */

/* ---------- normative extraction ---------- */
function extractNorm(d) {
  const R = PKG.requirementCut;

  /* Article-style cut: one requirement per article. */
  if (R.mode === 'article') {
    const parts = d.text.replace(/\r/g, '').split(R.splitRegex ? new RegExp(R.splitRegex, 'm') : /^Article\s+(\d+[a-z]?)\s*$/m);
    let n = 0;
    if (parts.length >= 7) {
      for (let i = 1; i < parts.length; i += 2) {
        const num = parts[i];
        const body = (parts[i + 1] || '').trim().split('\n');
        const title = (body.shift() || '').trim();
        const text = body.join(' ').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        n++;
        pushReq(d, R.refTemplate.replace('{n}', num).replace('{title}', title), text, n);
      }
      return;
    }
  }

  /* Sentence cut (fallback): obligations signalled by modal verbs. */
  const sents = d.text.replace(/\r/g, '').split(/\n+|(?<=[.;])\s+/).map(s => s.trim()).filter(s => s.length > 25);
  let cand = sents.filter(s => R.obligationRegex.test(s));
  if (!cand.length) cand = sents.filter(s => s.length > 40).slice(0, R.maxFallback || 60);
  let n = 0;
  cand.forEach(s => {
    n++;
    pushReq(d, d.name + ' §' + n, s.replace(/^[-•*\d.)\s]+/, ''), n);
  });
}

/* A requirement may carry its four classes from the use-case package (auditor-confirmed)
   or from the offline template (placeholder, replaced by the LLM Normbuilder). */
function pushReq(d, ref, text, n) {
  const base = ref.split(' – ')[0].trim();
  const packaged = PKG.classesByRef && PKG.classesByRef[base];
  const r = {
    id: d.id + '-R' + String(n).padStart(2, '0'),
    src: d.id, ref, text,
    summary: text.replace(/\s+/g, ' ').slice(0, 220) + (text.length > 220 ? '…' : '')
  };
  if (packaged) { r.cls = packaged; r.clsBy = PKG.classesOrigin || 'Use-case package'; }
  else { r.cls = tmplClasses(r); r.clsBy = 'Template draft'; }
  S.reqs.push(r);
}

/* ---------- template classes (offline placeholder) ---------- */
function tmplClasses(r) {
  const t = (r.ref + ' ' + r.text.slice(0, 300)).toLowerCase();
  const title = r.ref.replace(/^.*?–\s*/, '');
  let own = PKG.defaultRaci;
  for (const [re, o] of PKG.raciRules) { if (re.test(t)) { own = o; break; } }
  return {
    design: 'Template draft: an approved, documented control, policy or procedure addressing "' + title + '" (' + r.ref.split(' – ')[0] + ') that implements each obligation in the requirement text, with scope, defined steps, criteria and proportionality.',
    monitor: 'Template draft: defined indicators or periodic review, an exceptions log and escalation route showing that the control over "' + title + '" remains effective; review after material change.',
    evidence: 'Template draft. TD/DE: approved policy, procedure, RACI or risk-control matrix with design detail. OE: dated operating records from the review period (logs, tickets, reports, test results, approvals).',
    owner: 'R: ' + own[0] + ' · A: ' + own[1] + ' · C: ' + own[2] + ' · I: ' + own[3] + ' (template draft)'
  };
}

/* ---------- Normbuilder Engine (LLM) ---------- */
async function runNorm(force) {
  const m = document.getElementById('aiMsg'), say = t => { m.textContent = t; };
  if (!CFG.use || !CFG.key) { say('Enter an API key in AI Setting and switch AI on. Template draft classes are shown meanwhile.'); return false; }
  try {
    const todo = S.reqs.filter(r => force || (r.clsBy !== 'LLM' && r.clsBy !== PKG.classesOrigin));
    if (!todo.length) { say('Normbuilder: nothing to do – every requirement already has LLM or package classes. Use "Run Normbuilder only" to replace package classes with AI drafts.'); return true; }
    for (let i = 0; i < todo.length; i += 5) {
      const b = todo.slice(i, i + 5);
      say('Normbuilder: requirements ' + (i + 1) + '–' + (i + b.length) + ' of ' + todo.length + ' …');
      const out = parseJSON(await callClaude(pr('norm'), b.map(r => 'ID: ' + r.id + '\nSOURCE: ' + r.ref + '\nTEXT: ' + r.text.slice(0, 6000)).join('\n\n---\n\n')));
      (out.items || []).forEach(x => {
        const r = S.reqs.find(q => q.id === x.id);
        if (!r) return;
        r.summary = x.summary || r.summary;
        r.cls = { design: x.design || '', monitor: x.monitor || '', evidence: x.evidence || '', owner: x.owner || '' };
        r.clsBy = 'LLM';
        S.match = {};
      });
      render();
    }
    setStatus('Normbuilder completed for ' + todo.length + ' requirement(s) with model ' + cfg('model'));
    say('Normbuilder finished. Review the classes: they are AI drafts.');
    return true;
  } catch (e) {
    say('Normbuilder error: ' + e.message + (/Failed to fetch/.test(e.message) ? ' (network/CORS issue – check internet, key and extensions)' : ''));
    setStatus('Normbuilder failed: ' + e.message);
    return false;
  }
}

/* ---------- Matching Engine ---------- */
function chunkDoc(d) {
  const cs = Math.max(200, +cfg('cs') || 900), co = Math.min(cs - 50, +cfg('co') || 150);
  const t = d.text.replace(/\s+/g, ' ').trim();
  const out = [];
  let i = 0, n = 0;
  while (i < t.length) {
    let e = Math.min(t.length, i + cs);
    if (e < t.length) { const sp = t.lastIndexOf('. ', e); if (sp > i + cs * 0.6) e = sp + 1; }
    n++;
    out.push({ id: d.id + '#' + n, doc: d.id, i: n, text: t.slice(i, e) });
    if (e >= t.length) break;
    i = Math.max(e - co, i + 1);
  }
  return out;
}

function localVec(s) {
  const w = (s.toLowerCase().match(/[a-z]{3,}/g) || []).filter(x => !PKG.stopwords.has(x)).map(x => x.replace(/(ing|ed|es|s)$/, ''));
  const v = new Float32Array(1024);
  const add = (k, wt) => { let h = 5381; for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) >>> 0; v[h % 1024] += wt; };
  w.forEach((x, i) => { add(x, 1); if (i > 0) add(w[i - 1] + '_' + x, .5); });
  let n = 0;
  for (let i = 0; i < 1024; i++) { v[i] = v[i] > 0 ? 1 + Math.log(v[i]) : 0; n += v[i] * v[i]; }
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < 1024; i++) v[i] /= n;
  return v;
}

async function embed(texts) {
  if (cfg('eprov') !== 'api') return texts.map(localVec);
  const out = [];
  for (let i = 0; i < texts.length; i += 48) {
    const b = texts.slice(i, i + 48);
    const r = await fetch(cfg('eendpoint'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + CFG.ekey },
      body: JSON.stringify({ model: cfg('emodel'), input: b })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Embedding API ' + r.status + ': ' + ((j.error && (j.error.message || j.error)) || j.detail || 'request failed'));
    (j.data || []).forEach(x => out.push(Float32Array.from(x.embedding)));
  }
  if (out.length !== texts.length) throw new Error('Embedding API returned ' + out.length + ' vectors for ' + texts.length + ' texts');
  return out;
}

function cos(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

const CL = [['design', 'Control Design'], ['monitor', 'Monitoring the Effectiveness'], ['evidence', 'Demonstrate by Evidencing'], ['owner', 'Ownership']];

async function runMatch() {
  const m = document.getElementById('aiMsg'), say = t => { m.textContent = t; };
  const ev = S.docs.filter(d => d.role == 'Evidence' && !d.unread && d.text);
  if (!ev.length) { say('Upload evidence documents first.'); return false; }
  if (!S.reqs.length) { say('Load or upload a normative document first.'); return false; }
  try {
    say('Matching: chunking and embedding evidence …');
    S.chunks = [];
    ev.forEach(d => chunkDoc(d).forEach(c => S.chunks.push(c)));
    const cv = await embed(S.chunks.map(c => c.text));
    S.chunks.forEach((c, i) => c.v = cv[i]);

    say('Matching: embedding requirement classes …');
    const items = [];
    S.reqs.forEach(r => CL.forEach(([k, l]) => items.push({
      r, k, l,
      t: r.ref.replace(/^.*?–\s*/, '') + '. ' + l + ': ' + r.cls[k].replace(/^Template draft:?\s*/, '')
    })));
    const iv = await embed(items.map(x => x.t));
    const thr = +cfg('thr'), K = Math.max(1, +cfg('k') || 3);
    S.match = {};
    items.forEach((it, ix) => {
      const sc = S.chunks.map(c => ({ c, s: cos(iv[ix], c.v) })).filter(x => x.s >= thr).sort((a, b) => b.s - a.s).slice(0, K);
      (S.match[it.r.id] = S.match[it.r.id] || []);
      sc.forEach(x => S.match[it.r.id].push({ cls: it.k, chunk: x.c.id, doc: x.c.doc, score: x.s }));
    });
    Object.values(S.match).forEach(a => a.sort((x, y) => y.score - x.score));
    S.ai = {};
    linkRegister();
    setStatus('Matching completed: ' + S.chunks.length + ' chunk(s), ' + S.reqs.length + ' requirement(s), embedding=' + (cfg('eprov') == 'api' ? cfg('emodel') : 'local lexical fallback') + ', threshold ' + thr);
    say('Matching finished (' + (cfg('eprov') == 'api' ? 'embedding API' : 'local lexical vectors – not semantic') + '). Candidate matches only; they are not proof.');
    render();
    return true;
  } catch (e) {
    say('Matching error: ' + e.message);
    setStatus('Matching failed: ' + e.message);
    return false;
  }
}

function linkRegister() {
  S.docs.filter(d => d.role == 'Evidence').forEach(d => {
    const hits = []; const cl = {}; let best = 0;
    Object.entries(S.match).forEach(([rid, a]) => a.filter(x => x.doc === d.id).forEach(x => {
      hits.push([rid, x.score]); cl[x.cls] = (cl[x.cls] || 0) + 1; best = Math.max(best, x.score);
    }));
    const top = [...new Set(hits.sort((a, b) => b[1] - a[1]).map(h => h[0]))].slice(0, 4);
    d.link = top.map(id => (S.reqs.find(r => r.id === id) || { ref: id }).ref.split(' – ')[0]);
    d.linkCls = Object.entries(cl).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => (CL.find(z => z[0] === e[0]) || [0, e[0]])[1]);
    d.rel = !hits.length ? 'None above threshold' : (best >= +cfg('thr') * 2 ? 'High (candidate)' : best >= +cfg('thr') * 1.4 ? 'Medium (candidate)' : 'Low (candidate)');
  });
}
