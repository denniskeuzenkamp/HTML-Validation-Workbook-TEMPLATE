/* ============================================================
   Validation Workbook Engine — Source Register and Validation Sheet
   ============================================================ */

const TM = {
  'Identified': 'ok', 'Appropriate': 'ok', 'Operated': 'ok',
  'Partially identified': 'pa', 'Partially appropriate': 'pa', 'Operated with exceptions': 'pa',
  'Candidate identified': 'pa', 'Candidate – auditor to test': 'pa', 'Requires AI / auditor': 'pe',
  'Not identified': 'no', 'Inappropriate': 'no', 'Did not operate': 'no', 'Not evidenced': 'no',
  'Not assessable': 'na', 'Pending': 'pe',
  'Not assessable – no eligible design evidence': 'na', 'Not assessable – no operating evidence': 'na'
};

function ovSel(r, k) {
  const cur = (S.ov[r.id] || {})[k] || '';
  return '<br><select onchange="(S.ov[\'' + r.id + '\']=S.ov[\'' + r.id + '\']||{})[\'' + k + '\']=this.value||undefined;render()">' +
    '<option value="">override: auto</option>' + VOC[k].map(x => '<option ' + (cur == x ? 'selected' : '') + '>' + x + '</option>').join('') + '</select>';
}

/* three separate result tables: TD, DE and OE are never merged */
function resultTable(key, title) {
  const head = '<tr><th>Requirement</th><th>Verdict</th><th>Reasoning</th></tr>';
  const body = S.reqs.map(r => {
    const v = view(r), z = v.ai && v.ai.res[key];
    const verdict = tag(v[key]) + ovSel(r, key);
    const why = z
      ? esc(z.why) + (z.quote
          ? '<br><i>\u201c' + esc(z.quote) + '\u201d</i> ' + (z.qok
              ? '<span style="color:#1c6b36">✓ quote verified</span>'
              : '<span style="color:#8c1d1d">⚠ quote not found</span>')
          : '')
      : '<span class="note">Not assessed by AI. Absence of a match is not compliance.</span>';
    return '<tr><td>' + r.id + '<br><span class="note">' + esc(r.ref) + '</span></td>' +
      '<td class="w">' + verdict + '</td><td class="w">' + why + '</td></tr>';
  }).join('');
  return '<h3>' + title + '</h3><table>' + head + (body ||
    '<tr><td colspan=3>Upload a normative document first, or load the use-case normative package in the Upload tab.</td></tr>') + '</table>';
}




function render() {
  document.getElementById('status').innerHTML =
    '<b>' + S.docs.filter(d => d.role == 'Normative').length + '</b> normative docs · <b>' +
    S.docs.filter(d => d.role == 'Evidence').length + '</b> evidence docs · <b>' + S.reqs.length + '</b> requirements · <b>' +
    S.reqs.filter(r => r.clsBy == 'LLM').length + '</b> with LLM requirement classes · <b>' +
    S.reqs.filter(r => r.clsBy == PKG.classesOrigin).length + '</b> from the normative package · <b>' +
    Object.keys(S.ai).length + '</b> AI-validated' +
    (S.docs.some(d => d.unread) ? '<br><span class="note">⚠ Some files could not be read as text (PDF/Word) and are registered but not assessed.</span>' : '');

  const yn = (d, k) => d.role == 'Normative' ? '–' :
    '<select onchange="S.docs.find(x=>x.id==\'' + d.id + '\').el.' + k + '=this.value==\'Yes\';S.ai={};render()">' +
    '<option ' + (d.el[k] ? 'selected' : '') + '>Yes</option><option ' + (d.el[k] ? '' : 'selected') + '>No</option></select>';

  document.getElementById('regT').innerHTML =
    '<table><tr><th>ID</th><th>Document name</th><th>Document type</th><th>Source category</th><th>Upload date</th><th>Relevance</th><th>Linked requirement</th><th>Linked requirement class</th><th>TD</th><th>DE</th><th>OE</th><th>Size</th><th>Hash</th><th>Status</th></tr>' +
    S.docs.map(d => '<tr><td>' + d.id + '</td><td>' + esc(d.name) + '</td><td>' + (d.role == 'Normative' ? 'Normative document' : 'Evidence document') + '</td><td>' + esc(d.cat) + '</td><td>' + d.added + (d.mod ? '<br><span class="note">modified ' + d.mod + '</span>' : '') + '</td><td>' + (d.role == 'Normative' ? 'Criteria (' + S.reqs.filter(r => r.src == d.id).length + ' req.)' : esc(d.rel || 'Not matched yet')) + '</td><td>' + (d.role == 'Normative' ? '–' : esc((d.link || []).join(', ') || '–')) + '</td><td>' + (d.role == 'Normative' ? '–' : esc((d.linkCls || []).join(', ') || '–')) + '</td><td>' + yn(d, 'TD') + '</td><td>' + yn(d, 'DE') + '</td><td>' + yn(d, 'OE') + '</td><td>' + d.size + '</td><td>' + d.hash + '</td><td>' + (d.unread ? 'Not readable' : 'Read (' + d.text.length + ' chars)') + '</td></tr>').join('') +
    '</table>';

  const rows = S.reqs.map(r => {
    const v = view(r), ai = v.ai;
    const ms = (S.match[r.id] || []);
    const best = ms.length ? ms[0].score : null;
    const mt = ms.length
      ? ms.slice(0, 6).map(x => x.chunk + ' → ' + (CL.find(z => z[0] === x.cls) || [0, x.cls])[1] + ' (' + x.score.toFixed(3) + ')').join('<br>')
      : '<span class="note">' + (Object.keys(S.match).length ? 'no candidate above threshold' : 'not matched yet') + '</span>';
    const rat = ai && ai.match ? esc(ai.match) : '<span class="note">Candidate matches by embedding similarity only; not proof. Run AI validation for relevance assessment.</span>';
    const cell = k => {
      const z = ai && ai.res[k];
      return tag(v[k]) + ovSel(r, k) + (z
        ? '<br><span class="note">' + esc(z.why) + '</span>' +
          (z.quote ? '<br><i>\u201c' + esc(z.quote) + '\u201d</i> ' + (z.qok ? '<span style="color:#1c6b36">✓ quote verified</span>' : '<span style="color:#8c1d1d">⚠ quote not found</span>') : '')
        : '');
    };
    const gaps = ai ? esc(ai.gaps) : '<span class="note">Not assessed by AI. Absence of a match is not compliance.</span>';
    const flag = ai ? ai.review : 'Yes';
    return '<tr><td>' + r.id + '<br><span class="note">' + esc(r.ref) + '</span></td>' +
      '<td class="w">' + esc(r.text.slice(0, 900)) + (r.text.length > 900 ? '…' : '') + '</td>' +
      '<td>' + esc(r.summary) + '</td>' +
      '<td class="w">' + esc(r.cls.design) + '<br><span class="note">' + esc(r.clsBy) + '</span></td>' +
      '<td class="w">' + esc(r.cls.monitor) + '</td>' +
      '<td class="w">' + esc(r.cls.evidence) + '</td>' +
      '<td class="w">' + esc(r.cls.owner) + '</td>' +
      '<td>' + mt + '</td>' +
      '<td>' + (best == null ? '–' : best.toFixed(3) + '<br><span class="note">candidate, not proof</span>') + '</td>' +
      '<td class="w">' + rat + '</td>' +
      '<td class="w">' + cell('td') + '</td><td class="w">' + cell('de') + '</td><td class="w">' + cell('oe') + '</td>' +
      '<td class="w">' + gaps + '</td><td>' + (ai ? ai.conf : '–') + '</td>' +
      '<td>' + tag(flag == 'Yes' ? 'Requires AI / auditor' : 'Identified') + '</td>' +
      '<td class="w">' + esc(ai ? ai.fu : '') + '</td>' +
      '<td><input style="width:98%" value="' + esc(r.note || '') + '" onchange="S.reqs.find(x=>x.id==\'' + r.id + '\').note=this.value;render()" placeholder="auditor note"></td></tr>';
  }).join('');

  document.getElementById('valT').innerHTML =
    resultTable('td', 'Table 1 — Test of Design') +
    resultTable('de', 'Table 2 — Design Effectiveness') +
    resultTable('oe', 'Table 3 — Operating Effectiveness');

  const bar = document.getElementById('valBar');
  if (bar) {
    const c = costPreview();
    document.getElementById('valBarNote').innerHTML =
      '<b>' + S.reqs.length + '</b> requirements · <b>' + c.chunks + '</b> evidence chunks · approx <b>' + c.calls +
      '</b> API calls, ≈<b>' + c.approxInTokens.toLocaleString() + '</b> input and ≈<b>' + c.approxOutTokens.toLocaleString() +
      '</b> output tokens per full run' + (S.run.log.length ? '<br><span class="note">' + esc(S.run.log.slice(-2).join(' · ')) + '</span>' : '');
  }
}
