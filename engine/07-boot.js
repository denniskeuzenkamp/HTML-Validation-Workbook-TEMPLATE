/* ============================================================
   Validation Workbook Engine — Upload tab, Method tab, boot
   ============================================================ */

function loadReg() {
  if (S.docs.some(d => d.name.indexOf(PKG.normativePackage.fileTag) > -1) && !confirm('The normative package is already loaded. Load again?')) return;
  const t = PKG.normativePackage.requirements.map(a => 'Article ' + a.article + '\n' + a.title + '\n' + a.text).join('\n\n');
  addDoc(PKG.normativePackage.fileName, 'Normative', t, t.length, Date.now(), false);
  render();
}

function loadSample() {
  (PKG.sampleEvidence || []).forEach(d => addDoc(d.name, 'Evidence', d.text, d.text.length, Date.now(), false));
  render();
}

/* ---------- navigation ---------- */
const nav = document.getElementById('nav');
TABS.forEach(([id, n]) => {
  const b = document.createElement('button');
  b.textContent = n;
  b.onclick = () => {
    document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id == id));
    [...nav.children].forEach(x => x.classList.toggle('on', x === b));
    render();
  };
  if (id == 'upload') b.className = 'on';
  nav.appendChild(b);
});

function pick(r) {
  role = r;
  const f = document.getElementById('fi');
  f.onchange = () => { add(f.files, r); f.value = ''; };
  f.click();
}
document.querySelectorAll('.drop').forEach(d => {
  d.ondragover = e => { e.preventDefault(); d.classList.add('h'); };
  d.ondragleave = () => d.classList.remove('h');
  d.ondrop = e => { e.preventDefault(); d.classList.remove('h'); add(e.dataTransfer.files, d.dataset.role); };
});

/* ---------- run provenance ---------- */
S.run = { started: Date.now(), log: [] };

loadCfg();
render();
