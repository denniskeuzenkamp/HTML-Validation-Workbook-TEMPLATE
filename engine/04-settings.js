/* ============================================================
   Validation Workbook Engine — configuration, API and prompts
   ============================================================ */

const LS = k => localStorage.getItem('aw_' + PKG.id + '_' + k);
function cfg(k) { const v = LS(k); return v === null ? (DC[k] !== undefined ? DC[k] : '') : v }
const CFG = {
  get key() { return LS('key') || '' },
  get ekey() { return LS('ekey') || '' },
  get use() { return cfg('use') !== '0' }
};

/* Defaults come from the use-case package; prompts are the package's own. */
const DC = Object.assign({ model: 'claude-sonnet-4-5', endpoint: 'https://api.anthropic.com/v1/messages', use: '1', tok: '6000', eprov: 'local', emodel: 'voyage-4', eendpoint: 'https://api.voyageai.com/v1/embeddings', thr: '0.15', cs: '900', co: '150', k: '3' }, PKG.settingDefaults || {});
const DP = PKG.prompts;
const IDS = { model: 'cfgModel', endpoint: 'cfgEndpoint', tok: 'cfgTok', eprov: 'cfgEProv', emodel: 'cfgEModel', eendpoint: 'cfgEEndpoint', thr: 'cfgThr', cs: 'cfgCS', co: 'cfgCO', k: 'cfgK' };

function pr(k) { return LS('p_' + k) || DP[k] }

function loadCfg() {
  for (const k in IDS) {
    const el = document.getElementById(IDS[k]);
    if (el) el.value = cfg(k);
  }
  document.getElementById('cfgUse').checked = CFG.use;
  document.getElementById('cfgKey').value = CFG.key;
  document.getElementById('cfgEKey').value = CFG.ekey;
  document.getElementById('cfgPN').value = pr('norm');
  document.getElementById('cfgPM').value = pr('match');
  document.getElementById('cfgPV').value = pr('val');
  document.getElementById('lastRun').textContent = LS('status') || 'never run';
}
function saveCfg() {
  for (const k in IDS) {
    const el = document.getElementById(IDS[k]);
    if (el) localStorage.setItem('aw_' + PKG.id + '_' + k, el.value.trim());
  }
  localStorage.setItem('aw_' + PKG.id + '_use', document.getElementById('cfgUse').checked ? '1' : '0');
  localStorage.setItem('aw_' + PKG.id + '_key', document.getElementById('cfgKey').value.trim());
  localStorage.setItem('aw_' + PKG.id + '_ekey', document.getElementById('cfgEKey').value.trim());
  localStorage.setItem('aw_' + PKG.id + '_p_norm', document.getElementById('cfgPN').value);
  localStorage.setItem('aw_' + PKG.id + '_p_match', document.getElementById('cfgPM').value);
  localStorage.setItem('aw_' + PKG.id + '_p_val', document.getElementById('cfgPV').value);
  document.getElementById('cfgMsg').textContent = 'Saved.';
}
function resetPrompts() {
  ['norm', 'match', 'val'].forEach(k => localStorage.removeItem('aw_' + PKG.id + '_p_' + k));
  loadCfg();
  document.getElementById('cfgMsg').textContent = 'Default prompts restored.';
}
function setStatus(t) {
  const s = new Date().toLocaleString() + ' – ' + t;
  localStorage.setItem('aw_' + PKG.id + '_status', s);
  document.getElementById('lastRun').textContent = s;
}

/* ---------- Claude Console API ---------- */
async function callClaude(system, user, maxTok) {
  const r = await fetch(cfg('endpoint'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': CFG.key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model: cfg('model'), max_tokens: maxTok || +cfg('tok') || 6000, system: system, messages: [{ role: 'user', content: user }] })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('API ' + r.status + ': ' + ((j.error && j.error.message) || 'request failed'));
  if (j.stop_reason === 'max_tokens') throw new Error('Response truncated: the model hit max tokens. Reduce the batch size or raise Max tokens.');
  return (j.content || []).map(c => c.text || '').join('');
}
function parseJSON(t) {
  const a = t.search(/[\[{]/);
  const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a < 0 || b < 0) throw new Error('Model did not return JSON');
  try { return JSON.parse(t.slice(a, b + 1)); }
  catch (e) { throw new Error('Model returned malformed JSON (' + e.message + ')'); }
}
async function testCfg() {
  saveCfg();
  const m = document.getElementById('cfgMsg');
  m.textContent = 'Testing …';
  try {
    const t = await callClaude('Reply with the single word OK.', 'ping', 20);
    m.textContent = 'Connection works. Model replied: ' + t.slice(0, 40);
  } catch (e) { m.textContent = 'Failed: ' + e.message; }
}

/* ---------- cost and token preview ---------- */
function costPreview() {
  const chars = S.docs.filter(d => d.role == 'Evidence' && d.text).reduce((s, d) => s + d.text.length, 0);
  const chunks = Math.ceil(chars / Math.max(200, +cfg('cs') || 900));
  const perReq = Math.min(+cfg('k') || 3, 4) * PKG.validation.maxCandidates * (Math.max(200, +cfg('cs') || 900));
  const normCalls = Math.ceil(S.reqs.length / 5);
  const valCalls = Math.ceil(S.reqs.length / PKG.validation.batchSize);
  const inChars = normCalls * 4000 + valCalls * (perReq + PKG.validation.requirementChars * PKG.validation.batchSize);
  return {
    chunks,
    calls: normCalls + valCalls + Math.ceil(chunks / 48),
    approxInTokens: Math.round(inChars / 4),
    approxOutTokens: Math.round(S.reqs.length * 700)
  };
}
