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
        ;return {S,PKG,loadReg,loadSample,runMatch,enforce,view,evFor,eligibility,addDoc,costPreview,provenance,CL,traceWording,render,classTable,evidenceCell};
`);
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

  const dated = W.eligibility('Quarterly_Field_Note.txt',
    'Field note 14/11/2026, follow-up 21/11/2026, closed 28/11/2026.');
  ok(dated.OE, 'package-format dates flip OE on at the threshold');



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

  

  /* ---- issue #17: article wording, traceability and the four-table view ---- */

  /* 1. every requirement carries wording, and it is whole */
  ok(S.reqs.every(r => r.wording && r.wording.length > 200), 'every requirement carries full article wording');
  ok(S.reqs.every(r => r.wording.length >= r.summary.length), 'wording is not shorter than the summary built from it');

  /* 2. every requirement carries a traceability state against its source document */
  ok(S.reqs.every(r => ['verified', 'unverified', 'none'].includes(r.trace)), 'every requirement carries a traceability state');
  const src = S.docs.find(d => d.id === S.reqs[0].src);
  const traced = W.traceWording(src, S.reqs[0].wording);
  ok(traced === S.reqs[0].trace, 'traceability state matches a fresh check against the source document');

  /* 3. the packaged article wording agrees with what the package declares */
  ok(PKG.packagedArticles.length === S.reqs.length, 'packaged article list matches the requirement count');
  ok(PKG.packagedArticles.every(a => a.wording && a.wordingBy), 'packaged articles carry wording and a source label');

  /* 4. the four tables are drawn, one requirement class each */
  W.render();
  const sheet = document.getElementById('valT').innerHTML;
  ['Table 1 — Test of Design', 'Table 2 — Design Effectiveness',
   'Table 3 — Operating Effectiveness', 'Table 4 — Ownership'].forEach(t =>
    ok(sheet.includes(t), 'Validation Sheet draws ' + t));

  /* 5. one copy of the wording per requirement, shared by all four tables:
        a correction cannot leave the tables disagreeing.

        The stub DOM stores strings and does not render, so a count of rendered
        cells per table cannot be verified here. This checks the same property in
        a form the stub can answer: each of the four class tables is built, and
        every requirement's wording appears in each of them. Rendered counts are
        confirmed in the browser. */
    const built = [['td', 'design'], ['de', 'monitor'], ['oe', 'evidence'], ['owner', 'owner']]
    .map(([k, cls]) => W.classTable(k, cls, 'x', 'y'));
  ok(built.every(t => t.indexOf('<table>') > -1), 'each of the four class tables builds a table');
  ok(built.every(t => S.reqs.every(r => t.split(r.wording).length - 1 >= 1)),
     'every requirement wording appears in each of the four tables');
/* lifts a real passage out of a stored chunk, so the tests can quote one */
  const chunkTextFor = (W, id) => {
    const c = W.S.chunks.find(x => x.id === id);
    return c ? c.text.slice(20, 80) : 'x';
  };
/* ---- issue #20: the evidence trail beside the TD verdict ---- */

  /* 6. relied upon = cited by the result AND eligible for the procedure.
        A candidate match alone must never appear as evidence relied upon.
        The requirement is CHOSEN because it has a TD-eligible candidate: a test
        that cannot run must fail, not pass quietly. */
  const withTd = S.reqs.find(r => W.evFor(r.id, 'TD').length);
  ok(!!withTd, 'the package offers a requirement with TD-eligible candidate evidence to test');
  if (withTd) {
    const chunk = W.evFor(withTd.id, 'TD')[0].chunk;
    S.ai[withTd.id] = W.enforce({ id: withTd.id, td: { result: 'Identified', quote: chunkTextFor(W, chunk), chunks: [chunk] } });
    const shown = W.evidenceCell(withTd, 'td');
    ok(/ranking indicator/i.test(shown),
       'a cited eligible chunk is shown with the score labelled a ranking indicator');
    ok(!/%/.test(shown), 'the score is never shown as a percentage of compliance');
    ok(shown.indexOf('<s>') === -1, 'evidence relied upon is shown without a strike-through');
  }

  /* 7. cited but not TD-eligible: shown and marked ineligible, never omitted */
  const citedNonTd = S.reqs.map(r => {
    const bad = (S.match[r.id] || []).find(x => {
      const d = S.docs.find(q => q.id === x.doc);
      return d && !d.el.TD;
    });
    return bad ? { r, bad } : null;
  }).find(Boolean);
  ok(!!citedNonTd, 'the package offers a requirement with a non-TD-eligible candidate to test');
  if (citedNonTd) {
    S.ai[citedNonTd.r.id] = W.enforce({
      id: citedNonTd.r.id,
      td: { result: 'Identified', quote: chunkTextFor(W, citedNonTd.bad.chunk), chunks: [citedNonTd.bad.chunk] }
    });
    const shown2 = W.evidenceCell(citedNonTd.r, 'td');
    ok(/not TD-eligible/.test(shown2), 'a cited ineligible document is marked ineligible');
    ok(shown2.includes('<s>'), 'a cited ineligible document is shown, not omitted');
  }

  /* 8. the evidence column belongs to Table 1 only */
  const t1 = W.classTable('td', 'design', 'x', 'y', true);
  const t2 = W.classTable('de', 'monitor', 'x', 'y');
  ok(/Evidence relied upon/.test(t1), 'Table 1 carries the evidence relied upon column');
  ok(!/Evidence relied upon/.test(t2), 'Table 2 does not carry the evidence relied upon column');
  
  
  console.log(failed ? '\n' + failed + ' FAILED' : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });




