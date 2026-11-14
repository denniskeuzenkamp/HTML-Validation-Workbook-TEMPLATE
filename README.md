# Audit Workbook Engine

Validates evidence documents against normative documents, for internal audit working papers. One shared engine, one folder per use case, one self-contained HTML file per use case.

AI-assisted validation supports the auditor and does not replace auditor judgement. Embedding similarity is a candidate match, never proof.

## Layout

```
engine/            shared code (never forked per use case)
usecases/<id>/     usecase.json  manifest: sources, evidence vocabulary, RACI rules, validation knobs
                   prompts.json  Normbuilder, Matching and Validation prompts
                   method.html   Method & IIA tab
                   shell.html    page markup (layout benchmark)
                   articles.json normative requirements
                   classes.csv   four requirement classes per requirement
scripts/build.py   renders a use case into dist/<id>_workbook.html
tests/smoke.js     checks the non-negotiable rules
```

## Build and test

```bash
python3 scripts/build.py                 # all use cases
python3 scripts/build.py dora-2024-1774  # one
node tests/smoke.js dist/dora-2024-1774_workbook.html
```

Needs Python 3.9+ and Node 18+. No dependencies. Open the HTML in Chrome, Edge or Firefox.

## Add a use case

1. Copy `usecases/dora-2024-1774/` to `usecases/<new-id>/`.
2. Edit `usecase.json`: id, title, version, `normativeSources`, `requirementCut`, `evidenceVocab` (what counts as design versus operating evidence in this domain), `raciRules`.
3. Replace `articles.json` (fields `n`, `t`, `x`) and `classes.csv` (same columns; `Ref.` must read `Art. <n>`).
4. Rewrite `prompts.json` and `method.html` for the domain. The DORA prompts name DORA in prose.
5. Build and run the smoke test.

## Rules the engine enforces

- No OE result from design-only evidence; no TD or DE result from operating-only evidence.
- No eligible evidence means Not assessable (Not identified for TD). Missing evidence is not compliance.
- Positive results need a verbatim quote from an eligible chunk, otherwise they are downgraded.
- TD, DE and OE are never merged. Partial, not assessable, low-confidence results set the auditor review flag.
- The Validation Sheet presents TD, DE and OE as three separate tables, each with requirement, verdict and reasoning columns.


## Known limits

- Not tested in a browser with live keys. Test on non-sensitive material first.
- Local embeddings are lexical, not semantic. Some embedding APIs block browser calls (CORS).
- DORA text came from a PDF: verify against EUR-Lex. Verify IIA Standard numbering against the published text.
- One requirement per Article. Finer cuts need a different `requirementCut` or a prepared `requirements.json`.
- No licence chosen yet.
- The Validation Sheet shows only the three result tables. The other columns of the former validation table are not rendered; whether they return is undecided (issue #3).

