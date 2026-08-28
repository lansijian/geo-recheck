# GeoRecheck V0.4 completion audit

Last audited: 2026-08-28

This document checks the V0.4 request against repository files and executed validation evidence. It deliberately distinguishes implementation completion, offline verification, controlled synthetic validation, and live-provider acceptance.

## Status summary

- Product implementation: **implemented**
- Deterministic geometry validation: **passed in controlled synthetic cases**
- Offline AI contract and human-review validation: **passed**
- Browser Golden Path: **passed**
- StepFun model discovery/authentication: **passed** (`step-3.7-flash` is present in the account model list)
- StepFun live three-image completion: **blocked by provider quota** (HTTP 402)
- Overall V0.4 acceptance: **not complete until a live StepFun call passes**

No fixture, cached response, or synthetic finding is reported as a live model success.

## Fourteen required deliverables

| # | Requirement | Status | Authoritative evidence |
|---|---|---|---|
| 1 | V0.3 repository audit | PASS | `docs/V0_4_REPO_AUDIT.md` |
| 2 | New scene data | PASS | `data/curated_scene_library/manifest.json`; 12 curated CC BY 4.0 wall scenes plus one CC0 facade context |
| 3 | Five-case scene library | PASS | `data/demo_cases/case_01_stable` through `case_05_quality_fail`; every case contains context, previous close-up, current close-up, and metadata |
| 4 | Full-building/facade context | PASS | `data/curated_scene_library/site_overview_cc0.jpg`; homepage context image and three restrained callouts |
| 5 | StepFun service | IMPLEMENTED | `backend/app/services/stepfun_observer.py`; official `/v1/chat/completions`, Bearer auth, Base64 images, `detail=high`, timeout and provider error mapping |
| 6 | AI JSON schema | PASS offline | `backend/app/schemas/ai_review.py`; first-object extraction, Pydantic validation, prohibited-language validation, maximum one format retry |
| 7 | AI result UI | PASS offline/browser | `frontend/src/pages/ResultPage.tsx`; completed, loading, disabled and failed states |
| 8 | Human accept/reject | PASS offline/browser | API decision endpoint, SQLite item state, Playwright accept/reject flow |
| 9 | Final record | PASS offline/browser | `build_confirmed_record_text`; only accepted or edited findings enter the formal record |
| 10 | 60-second Golden Path | PASS browser | Full panorama -> close-up -> geometry -> AI panel -> human confirmation -> inspection record |
| 11 | AI demo validation | BLOCKED live | `artifacts/ai_validation_v04/results.csv` and `summary.json`: 5 cases x 3 runs reached the provider, but all 15 returned quota failure |
| 12 | Scene-page visual checklist | PASS browser | `frontend/src/pages/ScenarioPage.tsx`; six observation categories with the V0.4 wall/crack scope highlighted |
| 13 | README | PASS | V0.4 positioning, generic Windows setup, data attribution, safety boundary and current live limitation |
| 14 | Screenshots | PASS | README uses `docs/assets/v04-home.png`, `v04-result.png`, and `v04-record.png` |

## Acceptance gates

| Gate | Result | Evidence/qualification |
|---|---|---|
| Homepage first screen contains a complete building/field scene | PASS | V0.4 homepage screenshot and browser verification |
| Panorama -> close-up is visible within one minute | PASS | Playwright Golden Path |
| At least five Demo Cases | PASS | 5 case directories and 5 metadata files |
| At least twelve curated real/open scene images | PASS | 12 wall scenes; file-level provenance and SHA-256 manifest |
| Golden Path is not limited to source `328.jpg` | PASS | Multiple curated sources and five distinct case packages |
| Every scene has provenance | PASS | Library manifest plus per-case metadata |
| StepFun API true call succeeds | **FAIL / EXTERNAL BLOCKER** | Authentication/model discovery succeeds, but chat completion returns HTTP 402 quota |
| API key never enters Git | PASS | `.env.local` ignored; `.env`/`.env.local` absent from history; tracked references contain placeholders/config access only |
| Multi-image input | PASS implementation | Exactly three labelled images are sent in context/previous/current order |
| JSON validated | PASS offline | Parser, Pydantic and prohibited-language tests |
| AI does not generate millimetre values | PASS contract | Prompt, schema boundary, UI copy; geometry remains the only millimetre source |
| AI does not output risk levels/actions | PASS contract | System prompt and schema validators reject prohibited decision language |
| AI failure does not block geometry | PASS offline/browser | Provider-failure unit test preserves +4.8 mm and pending geometry; browser failed-review flow still generates a record |
| Every finding can be accepted/rejected | PASS offline/browser | API and Playwright decision flow |
| Final record contains only confirmed items | PASS offline/browser | Accepted/edited query filter and record assertions |
| OpenCV geometry result is present | PASS | Five-case validation: 5/5 quality-gate agreement; accepted-case max absolute error 0.158 mm |
| StepFun visible-change result is present | **NOT PROVEN LIVE** | Fixture proves rendering/contract only; it is not a live-provider result |
| AI finds an observation geometry cannot measure | **NOT PROVEN LIVE** | Seepage/peeling contract and fixture are verified, but live provider output is unavailable |
| Complete record is generated | PASS browser | Golden Path record test |
| Playwright passes | PASS | 10 tests passed |
| Golden Path x10 passes | PASS | Repeatability test completes ten consecutive flows |
| StepFun live smoke passes | **FAIL / EXTERNAL BLOCKER** | `artifacts/stepfun_v04/live_smoke.json` records `status=failed`, `error_code=quota`, and three images; no simulated replacement |

## Latest live-provider evidence

The implementation follows the official StepFun image-understanding and Chat Completion documentation:

- <https://platform.stepfun.com/docs/zh/guides/developer/image-chat>
- <https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create>

The local model-list response contains 30 models and includes `step-3.7-flash`. The latest three-image smoke call is recorded in `artifacts/stepfun_v04/live_smoke.json` with an explicit UTC check time. It reached the provider and returned quota failure. This proves that the configured key and model discovery path work, but it does not satisfy the required live-completion gate.

## Controlled-case geometry evidence

| Case | Expected | Measured result | Gate |
|---|---|---|---|
| `case_01_stable` | stable | +0.458 mm | accepted, expected |
| `case_02_widening` | widening | +5.153 mm | accepted, expected |
| `case_03_seepage` | widening plus controlled water-stain cue | +4.783 mm | accepted, expected |
| `case_04_spalling` | small displacement plus controlled spalling cue | +1.155 mm | accepted, expected |
| `case_05_quality_fail` | severe blur/marker loss | no millimetre output | rejected, expected |

These are controlled synthetic case results. They are not field-accuracy claims.

## Remaining action to pass V0.4 acceptance

Restore usable StepFun API quota for the configured account, then run:

```bat
set GEORECHECK_PYTHON=.venv\Scripts\python.exe
%GEORECHECK_PYTHON% scripts\test_stepfun_vision.py
set RUN_STEPFUN_LIVE_TEST=1
%GEORECHECK_PYTHON% scripts\run_ai_validation_v04.py
```

Acceptance requires the smoke artifact to report `status=passed` and the 5 x 3 validation to contain real completed runs with parse, expected-finding, unsupported-finding, and latency results.
