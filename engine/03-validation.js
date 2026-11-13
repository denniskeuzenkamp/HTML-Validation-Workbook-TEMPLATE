/* ============================================================
   Validation Workbook Engine — AI validation and workbook rules
   TD, DE and OE are assessed separately and never merged.
   ============================================================ */

function evFor(rid, t) {
  return (S.match[rid] || []).filter(x => {
    const d = S.docs.find(q => q.id === x.doc);
    return d && d.el[t];
  });
}
function chunkText(id) { const c = S.chunks.find(x => x.id === id); return c ? c.text : ''; }

/* ---------- workbook rules applied to every AI result ---------- */
const POS = { td: ['Identified'], de: ['Appropriate'], oe: ['Operated'] };
const VOC = {
  td: ['Identified', 'Partially identified', 'Not identified', 'Not assessable'],
  de: ['Appropriate', 'Partially appropriate', 'Inappropriate', 'Not assessable'],
  oe: ['Operated', 'Operated with exceptions', 'Did not operate', 'Not assessable']
};
const normQ = s => String(s || '').toLowerCase().replace(/[\u201c\u201d\u2018\u2019"']/g, '').replace(/\s+/g, ' ').trim();

function enforce(x) {
  const a = {
    match: x.match_rationale || '', gaps: x.gaps || '',
    conf: ['High', 'Medium', 'Low'].includes(x.confidence) ? x.confidence : 'Low',
    review: x.review || 'Yes', fu: x.follow_up || '', res: {}
  };
  const notes = [];
  [['td', 'TD'], ['de', 'DE'], ['oe', 'OE']].forEach(([k, T]) => {
    const o = x[k] || {};
    let res = VOC[k].includes(o.result) ? o.result : 'Not assessable';
    let why = o.rationale || '';
    const ms = evFor(x.id, T);
    const allowed = new Set(ms.map(z => z.chunk));
    if (!ms.length) {
      if (res !== 'Not assessable' || k === 'td') {
        const was = res;
        res = k === 'td' ? 'Not identified' : 'Not assessable';
        why = 'Forced by workbook rule: no ' + T + '-eligible candidate evidence above the threshold. Missing evidence is not compliance.' + (was !== res ? ' (AI proposed: ' + was + ')' : '');
      } else why = 'No ' + T + '-eligible candidate evidence. ' + why;
      notes.push(T + ': no eligible evidence');
    } else if (res !== 'Not assessable') {
      const cited = (o.chunks || []).filter(c => allowed.has(c));
      const joined = normQ(ms.map(z => chunkText(z.chunk)).join(' '));
      const qOk = o.quote ? joined.includes(normQ(o.quote)) : false;
      if (!qOk || !cited.length) {
        if (res === POS[k][0]) {
          res = VOC[k][1];
          why += ' (downgraded: no verifiable quote from an eligible chunk)';
          notes.push(T + ': positive result downgraded');
        } else {
          notes.push(T + ': claim not supported by a verifiable quote');
        }
      }
      a.res[k] = { r: res, why, quote: o.quote || '', qok: qOk, chunks: o.chunks || [] };
      return;
    }
    a.res[k] = { r: res, why, quote: o.quote || '', qok: !!o.quote && normQ(ms.map(z => chunkText(z.chunk)).join(' ')).includes(normQ(o.quote)), chunks: o.chunks || [] };
  });
  if (notes.length) a.gaps = (a.gaps ? a.gaps + ' | ' : '') + 'Workbook checks: ' + notes.join('; ');
  if (Object.values(a.res).some(z => !['Identified', 'Appropriate', 'Operated'].includes(z.r)) || a.conf === 'Low') a.review = 'Yes';
  return a;
}

/* ---------- run the three engines in order ---------- */
async function runAI(force, only) {
  const m = document.getElementById('aiMsg'), say = t => { m.textContent = t; };
  if (!CFG.use) { say('AI is switched off in AI Setting – offline results (candidate indicators only) are shown.'); return; }
  if (!CFG.key) { say('Enter your API key in the AI Setting tab first.'); return; }
  if (!S.reqs.length) { say('Load or upload a normative document first.'); return; }
  if (!S.docs.some(d => d.role == 'Evidence' && !d.unread)) { say('Upload evidence documents first.'); return; }
  if (force) { S.ai = {}; S.match = {}; }

  if (!(await runNorm(false))) return;
  if (force || !Object.keys(S.match).length) { if (!(await runMatch())) return; }

  try {
    const srcHash = r => hash(r.text + JSON.stringify(r.cls));
    const docHash = hash(S.docs.map(d => d.id + d.hash + d.el.TD + d.el.DE + d.el.OE).join('|'));
    let todo = S.reqs.filter(r => !S.ai[r.id] || S.ai[r.id].incomplete);
    if (only && only.length) todo = todo.filter(r => only.includes(r.id));

    /* per-requirement resilience: one failure must not end the run */
    const failures = [];
    for (let i = 0; i < todo.length; i += PKG.validation.batchSize) {
      const b = todo.slice(i, i + PKG.validation.batchSize);
      say('AI validation: ' + (i + 1) + '–' + (i + b.length) + ' of ' + todo.length +
        (failures.length ? ' (' + failures.length + ' failed, retried individually)' : '') + ' …');
      const msg = buildMsg(b);

      try {
        const out = parseJSON(await callClaude(pr('val') + '\n\nMatching review guidance: ' + pr('match'), msg, +cfg('tok') || 6000));
        (out.items || []).forEach(x => {
          if (!x || !x.id) return;
          S.ai[x.id] = Object.assign(enforce(x), { srcHash: srcHash(S.reqs.find(q => q.id === x.id)), docHash, ts: Date.now() });
        });
        b.forEach(r => { if (!S.ai[r.id]) failures.push(r.id); });
      } catch (e) {
        failures.push(...b.map(r => r.id));
        S.run.log.push(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' – batch failed: ' + e.message);
      }
      render();
    }

    /* retry each failed requirement on its own, so one bad batch does not lose the rest */
    if (failures.length) {
      for (const rid of failures) {
        const r = S.reqs.find(q => q.id === rid);
        if (!r) continue;
        say('AI validation: retrying ' + r.ref + ' individually …');
        try {
          const out = parseJSON(await callClaude(pr('val') + '\n\nMatching review guidance: ' + pr('match'),
            buildMsg([r]), +cfg('tok') || 6000));
          (out.items || []).forEach(x => {
            if (!x || !x.id) return;
            S.ai[x.id] = Object.assign(enforce(x), { srcHash: srcHash(S.reqs.find(q => q.id === x.id)), docHash, ts: Date.now() });
          });
        } catch (e) {
          S.run.log.push(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' – ' + r.ref + ' failed: ' + e.message);
          S.ai[rid] = Object.assign({
            match: '', gaps: 'AI validation failed: ' + e.message + '. Not assessed.', conf: 'Low', review: 'Yes',
            fu: 'Re-run this requirement or assess it manually.', res: {
              td: { r: 'Not assessable', why: 'AI validation failed for this requirement.', qok: false },
              de: { r: 'Not assessable', why: 'AI validation failed for this requirement.', qok: false },
              oe: { r: 'Not assessable', why: 'AI validation failed for this requirement.', qok: false }
            }
          }, { srcHash: srcHash(r), docHash, ts: Date.now(), incomplete: true });
        }
        render();
      }
    }

    setStatus('AI validation completed for ' + todo.length + ' requirement(s) with model ' + cfg('model') + '; results indicative');
    say('Finished ' + new Date().toLocaleTimeString() + '. AI results are indicative: review and confirm or override every conclusion.');
  } catch (e) {
    setStatus('AI validation failed: ' + e.message);
    say('Error: ' + e.message + (/Failed to fetch/.test(e.message) ? ' (network/CORS issue – check internet, key and browser extensions)' : ''));
  }
}

/* build the message body for one or more requirements (used by single retries) */
function buildMsg(b) {
  return b.map(r => {
    const ms = (S.match[r.id] || []).slice(0, PKG.validation.maxCandidates);
    return 'REQUIREMENT ID: ' + r.id + '\nSOURCE: ' + r.ref + '\nTEXT: ' + r.text.slice(0, PKG.validation.requirementChars) +
      '\nCLASSES:\n- Control Design: ' + r.cls.design + '\n- Monitoring the Effectiveness: ' + r.cls.monitor +
      '\n- Demonstrate by Evidencing: ' + r.cls.evidence + '\n- Ownership: ' + r.cls.owner + '\n' +
      '\nCANDIDATE MATCHES (embedding):\n' + (ms.length
        ? ms.map(x => {
            const d = S.docs.find(q => q.id === x.doc);
            return '[' + x.chunk + '] class=' + (CL.find(z => z[0] === x.cls) || [0, x.cls])[1] +
              ' similarity=' + x.score.toFixed(3) + ' doc="' + d.name + '" eligibility TD=' + d.el.TD + ' DE=' + d.el.DE + ' OE=' + d.el.OE +
              '\n"""' + chunkText(x.chunk) + '"""';
          }).join('\n')
        : '(none above threshold – no evidence matched)');
  }).join('\n\n=====\n\n');
}

/* ---------- offline view (no AI) ---------- */
function offline(r) {
  const hasEv = S.docs.some(d => d.role == 'Evidence' && !d.unread);
  if (!hasEv || !Object.keys(S.match).length) return { td: 'Pending', de: 'Pending', oe: 'Pending' };
  return {
    td: evFor(r.id, 'TD').length ? 'Candidate identified' : 'Not evidenced',
    de: evFor(r.id, 'DE').length ? 'Requires AI / auditor' : 'Not assessable – no eligible design evidence',
    oe: evFor(r.id, 'OE').length ? 'Candidate – auditor to test' : 'Not assessable – no operating evidence'
  };
}
function view(r) {
  const ai = S.ai[r.id], o = S.ov[r.id] || {};
  const off = offline(r);
  const g = k => o[k] || (ai ? ai.res[k].r : off[k]);
  return { td: g('td'), de: g('de'), oe: g('oe'), ai };
}
