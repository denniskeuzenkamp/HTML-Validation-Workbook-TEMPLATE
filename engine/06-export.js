/* ============================================================
   Validation Workbook Engine — persistence, export and provenance
   ============================================================ */

function csv() {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const h = ['Source reference', 'Requirement text', 'Summary', 'Control Design', 'Monitoring the Effectiveness',
    'Demonstrate by Evidencing', 'Ownership', 'Class origin', 'Matched evidence', 'Similarity', 'Match rationale',
    'TD', 'DE', 'OE', 'Evidence gaps', 'Confidence', 'Auditor review flag', 'Follow-up', 'Auditor notes'];
  const L = [h.join(',')].concat(S.reqs.map(r => {
    const v = view(r), ai = v.ai, ms = S.match[r.id] || [];
    return [r.ref, r.text, r.summary, r.cls.design, r.cls.monitor, r.cls.evidence, r.cls.owner, r.clsBy,
      ms.slice(0, 6).map(x => x.chunk + '>' + x.cls + '(' + x.score.toFixed(3) + ')').join('; '),
      ms.length ? ms[0].score.toFixed(3) : '',
      ai ? ai.match : '', v.td, v.de, v.oe, ai ? ai.gaps : '', ai ? ai.conf : '',
      ai ? ai.review : 'Yes', ai ? ai.fu : '', r.note].map(q).join(',');
  }));
  dl('validation_sheet.csv', '\ufeff' + L.join('\n'), 'text/csv');
}

/* Every export carries its provenance: which engine, which use-case package. */
function provenance() {
  return {
    engineVersion: PKG.engineVersion,
    useCase: PKG.id,
    useCaseTitle: PKG.title,
    useCaseVersion: PKG.version,
    normativeSources: (PKG.normativeSources || []).map(s => s.ref),
    exported: new Date().toISOString(),
    model: cfg('model'),
    embedding: cfg('eprov') == 'api' ? cfg('emodel') : 'local lexical fallback',
    threshold: cfg('thr'),
    chunking: cfg('cs') + '/' + cfg('co'),
    topK: cfg('k')
  };
}

function saveWP() {
  dl('workpaper_' + PKG.id + '.json', JSON.stringify({
    provenance: provenance(),
    docs: S.docs, reqs: S.reqs, ov: S.ov, match: S.match, ai: S.ai, run: S.run,
    note: 'API keys are never stored in this file. Provenance records the engine and use-case versions that produced these results.'
  }), 'application/json');
}

async function openWP(f) {
  const o = JSON.parse(await f.text());
  S.docs = o.docs || []; S.reqs = o.reqs || []; S.ov = o.ov || {};
  S.match = o.match || {}; S.ai = o.ai || {}; S.run = o.run || { log: [], started: null };
  S.chunks = [];
  if (o.provenance && o.provenance.useCase !== PKG.id) {
    alert('This workpaper was produced with use case "' + o.provenance.useCase + '" (v' + o.provenance.useCaseVersion +
      '), but this workbook is "' + PKG.id + '". Rows may not align. Continue only if you know why.');
  }
  render();
}
