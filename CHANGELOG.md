# Changelog

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
