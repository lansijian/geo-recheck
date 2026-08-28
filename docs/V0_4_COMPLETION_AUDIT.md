# GeoReCheck V0.4 completion audit

Last audited: 2026-08-28

This document checks the V0.4 request against repository files and executed evidence. It distinguishes local implementation, controlled synthetic validation, live-provider validation, browser acceptance, and still-pending field validation.

## Status summary

- Product implementation: **PASS**
- Deterministic geometry validation: **PASS in five controlled synthetic cases**
- Offline AI contract and human-review validation: **PASS**
- StepFun three-image smoke: **PASS**
- StepFun 5 cases x 3 live validation: **PASS with measured limitations**
- Browser Golden Path and 10x repeatability: **PASS**
- V0.4 Windows local-demo acceptance: **PASS**
- Physical marker/camera/field accuracy: **not claimed and still pending**

No fixture, cached response, or synthetic finding is reported as a live model success.

## Correct StepFun channel

The configured key belongs to Step Plan. Its OpenAI-compatible base URL is:

```text
https://api.stepfun.com/step_plan/v1
```

The ordinary Open API uses `https://api.stepfun.com/v1`; it is a separate billing channel. An earlier HTTP 402 from that ordinary endpoint was therefore not evidence that the user's Step Plan credits were exhausted. The repository now defaults to the Step Plan endpoint, keeps the base URL configurable, and documents both choices.

Official references:

- <https://platform.stepfun.com/docs/zh/step-plan/overview>
- <https://platform.stepfun.com/docs/zh/step-plan/quick-start>
- <https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create>

## Fourteen required deliverables

| # | Requirement | Status | Authoritative evidence |
|---|---|---|---|
| 1 | V0.3 repository audit | PASS | `docs/V0_4_REPO_AUDIT.md` |
| 2 | New scene data | PASS | `data/curated_scene_library/manifest.json`; 12 CC BY 4.0 wall scenes plus one CC0 facade context |
| 3 | Five-case scene library | PASS | `data/demo_cases/case_01_stable` through `case_05_quality_fail`; each has context, previous close-up, current close-up, metadata and provenance |
| 4 | Full-building/facade context | PASS | `data/curated_scene_library/site_overview_cc0.jpg`; homepage context image and three restrained callouts |
| 5 | StepFun service | PASS | `backend/app/services/stepfun_observer.py`; configurable base URL, Bearer auth, three labelled Base64 images, `detail=high`, timeout, status mapping and one format retry |
| 6 | AI JSON schema | PASS | `backend/app/schemas/ai_review.py`; first-object extraction, Pydantic validation and prohibited-language validation |
| 7 | AI result UI | PASS | `frontend/src/pages/ResultPage.tsx`; completed, loading, disabled and failed states |
| 8 | Human accept/reject | PASS | API decision endpoint, persisted item state and Playwright accept/reject flow |
| 9 | Final record | PASS | `build_confirmed_record_text`; only accepted or edited findings enter the formal record |
| 10 | 60-second Golden Path | PASS browser | Panorama -> close-up -> geometry -> AI panel -> human confirmation -> inspection record |
| 11 | AI demo validation | PASS live | `artifacts/ai_validation_v04/results.csv`, `responses.jsonl`, and `summary.json`; 5 cases x 3 real calls |
| 12 | Scene-page visual checklist | PASS browser | Six observation categories with the V0.4 wall/crack scope highlighted |
| 13 | README | PASS | Positioning, Windows setup, Step Plan/Open API distinction, attribution, safety boundary and verification commands |
| 14 | Screenshots | PASS | `docs/assets/v04-home.png`, `v04-result.png`, and `v04-record.png` |

## Live StepFun evidence

The three-image smoke artifact records:

- provider/model: `stepfun` / `step-3.7-flash`
- image count: 3
- status: passed
- JSON validation: passed on the first attempt
- latency: 52,891 ms

The formal 5 x 3 run records:

| Metric | Result |
|---|---:|
| Completed API calls | 15 / 15 |
| JSON parse success | 100% |
| Expected-finding hit rate | 86.7% (13 / 15) |
| Runs with an unsupported positive finding | 6.7% (1 / 15) |
| Unsupported positive finding count | 1 |
| Median latency | 42,728 ms |
| Provider failure codes | none |

Per-case results:

| Case | Expected AI result | Hits | Unsupported positives | Median latency |
|---|---|---:|---:|---:|
| `case_01_stable` | no additional visible change | 3 / 3 | 0 | 40,265 ms |
| `case_02_widening` | no additional AI finding; widening stays in geometry | 2 / 3 | 1 | 42,728 ms |
| `case_03_seepage` | `seepage_or_water_stain` | 2 / 3 | 0 | 47,544 ms |
| `case_04_spalling` | `spalling_or_peeling` | 3 / 3 | 0 | 44,987 ms |
| `case_05_quality_fail` | `coverage_missing` | 3 / 3 | 0 | 30,900 ms |

The remaining errors are visible in `responses.jsonl`: one seepage miss and one redundant positive description of geometry-only widening. These results are demo-case measurements, not a general model-accuracy claim.

## Acceptance gates

| Gate | Result | Evidence/qualification |
|---|---|---|
| Homepage first screen contains a complete building/field scene | PASS | V0.4 homepage screenshot and browser verification |
| Panorama -> close-up is visible within one minute | PASS | Playwright Golden Path |
| At least five Demo Cases | PASS | Five case directories and metadata files |
| At least twelve curated real/open scene images | PASS | 12 wall scenes plus one facade; file-level provenance and SHA-256 manifest |
| Golden Path is not limited to source `328.jpg` | PASS | Multiple curated sources and five distinct case packages |
| Every scene has provenance | PASS | Library manifest plus per-case metadata |
| StepFun API true call succeeds | PASS | `artifacts/stepfun_v04/live_smoke.json` |
| API key never enters Git | PASS | `.env.local` ignored; tracked files contain placeholders/config access only |
| Multi-image input | PASS | Exactly three labelled images are sent in context/previous/current order |
| JSON validated | PASS | Live 15/15 plus offline parser/Pydantic tests |
| AI does not generate millimetre values | PASS contract | Geometry is passed as external context; prompt and UI preserve source attribution |
| AI does not output risk levels/actions | PASS contract | Prompt and schema validators reject prohibited decision language |
| AI failure does not block geometry | PASS | Unit and browser failure-isolation paths retain geometry and record flow |
| Every finding can be accepted/rejected | PASS | API and Playwright decision flow |
| Final record contains only confirmed items | PASS | Accepted/edited query filter and record assertions |
| OpenCV geometry result is present | PASS | 5/5 quality-gate agreement; accepted-case max absolute error 0.158 mm |
| StepFun visible-change result is present | PASS live | Water-stain and spalling findings are present in live parsed responses |
| AI finds an observation geometry cannot measure | PASS live | Water-stain and spalling cases provide qualitative visual findings |
| Complete record is generated | PASS browser | Golden Path record test |
| Playwright passes | PASS | Full suite |
| Golden Path x10 passes | PASS | Ten consecutive browser flows |
| StepFun live smoke passes | PASS | Real Step Plan call, three images, no fixture substitution |

## Controlled-case geometry evidence

| Case | Expected | Measured result | Gate |
|---|---|---|---|
| `case_01_stable` | +0.3 mm | +0.458 mm | accepted, expected |
| `case_02_widening` | +5.0 mm | +5.153 mm | accepted, expected |
| `case_03_seepage` | +4.8 mm plus controlled water-stain cue | +4.786 mm | accepted, expected |
| `case_04_spalling` | +1.2 mm plus controlled spalling cue | +1.155 mm | accepted, expected |
| `case_05_quality_fail` | severe blur | no millimetre output | rejected, expected |

These are controlled synthetic results over openly sourced wall imagery. They are not field-accuracy claims and are not real Guizhou incident records.

## Remaining real-world work outside V0.4

- Verify physical marker dimensions and installation.
- Run calibrated-camera 0/2/5/10 mm physical displacement trials.
- Test outdoor light, distance, angle, weathering and long-term attachment.
- Run monitored shadow-mode trials with real field workers before any production claim.
