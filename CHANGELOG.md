# Changelog
## [Engine 0.3 / DORA package 1.1] – 2026-11-20

### Added
- Test of Design table (Table 1) now shows the evidence relied upon for each verdict: the evidence document name, the part reference within it, and the candidate score labelled as a ranking indicator only.
- A document cited by a result but not marked TD-eligible is shown struck through with the reason, rather than omitted.
- Where no TD-eligible evidence exists above the threshold, the row states it plainly rather than leaving the cell empty.

### Changed
- Table 1 carries a fifth column, `Evidence relied upon`. Tables 2, 3 and 4 are unchanged.
- `tests/smoke.js`: four checks added covering the evidence trail — relied-upon requires citation and eligibility; the score is a ranking indicator and never a percentage; evidence relied upon is shown without a strike-through; a cited ineligible document is marked ineligible and not omitted.

## [Engine 0.2 / DORA package 1.1] – 2026-11-14

### Changed
- Validation Sheet split into three separate tables — Test of Design, Design Effectiveness and Operating Effectiveness — each with requirement, verdict and reasoning columns. TD, DE and OE were previously columns inside a single table.
- The previous 18-column validation table is no longer rendered. The columns it carried (matched evidence, similarity score, match rationale, evidence gaps, confidence level, auditor review flag, recommended follow-up, auditor notes, requirement classes) are undecided — see issue #3.



## [Engine 0.1 / DORA package 1.1] – 2026-11-13

### Changed
- Single-file workbook split into a shared engine (`engine/*.js`) and a use-case package (`usecases/<id>/`).
- `build.py` renders one self-contained HTML per use case into `dist/`. Layout, tabs, colours and button placement are unchanged from the DORA 1.0 workbook.
- DORA content (42 Articles, requirement classes, prompts, Method text, evidence vocabulary, RACI rules) moved out of the script into the package.
- `DORA_Requirementclasses.csv` is now consumed: the 42 requirement classes load with the regulation, labelled as package drafts.

### Added
- Provenance block (engine version, use-case version, model, embedding, threshold, chunking) in every workpaper JSON; warning when opening a workpaper from another use case.
- Cost and token preview above the Run buttons.
- Truncation is now reported (`stop_reason = max_tokens`) instead of "Model did not return JSON".
- Per-requirement retry: one failed batch no longer loses the other requirements.
- Negative AI results without a verifiable quote are now noted in Evidence gaps.
- `tests/smoke.js`: checks the non-negotiable rules in Node.

### Not yet done
- Not tested in a browser with live API keys.
- Vector cache, resumable runs, auditor override trail, licence.
