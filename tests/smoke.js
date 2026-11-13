/* Smoke test: runs the built workbook script against a stub DOM in Node.
   Usage: node tests/smoke.js dist/dora-2024-1774_workbook.html
   Checks the rules the brief calls non-negotiable. No network, no API key. */
const fs = require('fs');
const file = process.argv[2] || 'dist/dora-2024-1774_workbook.html';
const html = fs.readFileSync(file, 'utf8');
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];

const els = {};
const stub = id => els[id] || (els[id] = {
  id, value: '', checked: true, textContent: '', innerHTML: '', children: [], classList: { add() {}, remove() {}, toggle() {} },
  appendChild(c) { this.children.push(c); }, click() {}, dataset: {}
});
global.document = { getElementById: stub, createElement: () => stub('_x' + Math.random()), querySelectorAll: () => [] };
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.window = global; global.confirm = () => true; global.alert = () => {}; global.prompt = () => 'x.txt';

let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };

(async () => {
  const run = new Function(js + `
    ;return {S,PKG,loadReg,loadSample,runMatch,enforce,view,evFor,eligibility,addDoc,costPreview,provenance,CL};`);
  const W = run();
  const { S, PKG } = W;

  W.loadReg();
  ok(S.reqs.length === 42, '42 requirements extracted from the normative package (got ' + S.reqs.length + ')');
  ok(S.reqs.every(r => r.clsBy === PKG.classesOrigin), 'all 42 carry package classes, none silently AI');
  ok(S.reqs.every(r => r.cls.design && r.cls.monitor && r.cls.evidence && r.cls.owner), 'all four requirement classes present on every requirement');

  W.loadSample();
  const ev = S.docs.filter(d => d.role === 'Evidence');
  ok(ev.length === 4, '4 sample evidence documents');
  const by = n => ev.find(d => d.name.includes(n));
  const log = by('Access_Review_Log'), pol = by('ICT_Security_Policy');
  ok(log.el.OE && !log.el.TD, 'operating log: OE eligible, NOT TD eligible');
  ok(pol.el.TD && !pol.el.OE, 'policy: TD eligible, NOT OE eligible');

  ok(await W.runMatch() === true, 'matching engine ran (local lexical)');
  ok(S.chunks.length > 0 && Object.keys(S.match).length > 0, 'chunks and candidate matches produced');

  /* enforce(): the non-negotiables */
  const rid = S.reqs[0].id;
  S.match[rid] = [{ cls: 'design', chunk: pol.id + '#1', doc: pol.id, score: .5 }];
  const forced = W.enforce({ id: rid, td: { result: 'Identified', quote: '', chunks: [] }, de: { result: 'Appropriate' }, oe: { result: 'Operated', quote: 'x', chunks: [pol.id + '#1'] } });
  ok(forced.res.oe.r === 'Not assessable', 'AI says OE=Operated from design-only evidence -> forced Not assessable');
  ok(forced.res.td.r !== 'Identified', 'TD=Identified without a verifiable quote -> downgraded');
  ok(forced.review === 'Yes', 'auditor review flag forced to Yes');
  S.match[rid] = [];
  const none = W.enforce({ id: rid, td: { result: 'Identified' }, de: { result: 'Appropriate' }, oe: { result: 'Operated' } });
  ok(none.res.td.r === 'Not identified' && none.res.de.r === 'Not assessable' && none.res.oe.r === 'Not assessable', 'no eligible evidence -> missing evidence is not compliance');

  const p = W.provenance();
  ok(p.useCase === 'dora-2024-1774' && p.engineVersion && p.useCaseVersion, 'export provenance carries engine and use-case versions');
  const v = W.view(S.reqs[0]);
  ok(['td', 'de', 'oe'].every(k => v[k]) && new Set([v.td, v.de, v.oe]).size >= 1, 'TD, DE and OE are separate results');

  console.log(failed ? '\n' + failed + ' FAILED' : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
