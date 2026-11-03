# Neulgyeot technical roadmap

## v0.1 — Public prototype (done)
- [x] Brand migration into the Neulgyeot repository.
- [x] Responsive prototype UI with clearly labeled synthetic records.
- [x] Explainable demo change signals and individual-baseline comparisons.
- [ ] Verify Vercel production deployment and connect it from KREWX.

## v0.2 — Neulgyeot Hospital EMR workspace (current, synthetic data)
- [x] Product split decided: this repository is **Neulgyeot Hospital**; **Neulgyeot Municipality** is a separate product.
- [x] Clinical three-column workstation (patient list, EMR summary, monitoring/review); old mixed facility/community filter removed.
- [x] Ward census, notes, medication-record summary, review notices, in-memory audit events.
- [x] Discharge & municipal referral workflow with assessment, consent/legal-basis gate, minimum-necessary JSON contract, **mock** adapter and status timeline.
- [x] Family Care Reports with scoped sharing, rule-based drafts with sources, approval, print preview, **mock** delivery, revocation.
- [x] Unit tests (`npm test`) for referral validation, mock adapter and family-report rules.
- [ ] Browser E2E tests in CI (Playwright) and accessibility audit (axe).
- [ ] Workflow validation with hospital social workers, nurses and discharge coordinators.
- [ ] Production municipal integration — **not started**; requires approved municipal API specification, partner authorization, legal and security review. See [Municipal referral integration](MUNICIPAL_REFERRAL_INTEGRATION.md).

## Separate product — Neulgyeot Municipality (not in this repository)
- Referral intake, case assessment, individual support plans, service matching, provider response tracking, monitoring and closure, regional resource directory.
- Independent deployment, data store, organization boundary and permission model.
- Receives only authorized referral payloads and returns limited status callbacks.
- See [Community-care and AI strategy](COMMUNITY_CARE_AND_AI_STRATEGY.md) for background.

## Separate product — 늘곁 패밀리 (not started)
- Guardian app that shows only staff-approved reports for the authorized account; supports withdrawal and revocation.

## v0.3 — Baseline and change detection
- Define typed observation schemas with unit, timestamp, source, and confidence.
- Implement transparent baseline calculations over a defined rolling window.
- Add minimum-observation requirements and missing-data handling.
- Evaluate simple deviation thresholds and multi-day persistence using synthetic fixtures.
- Produce evidence objects that can explain each signal.
- Add unit tests for baseline math, missing observations, and false-alert edge cases.

## v0.4 — API and persistence (Hospital)
- Implement a FastAPI service with versioned endpoints.
- Move to PostgreSQL rather than relying on a serverless filesystem.
- Add migrations, data-retention policies, tenant boundaries, and structured audit logs.
- Add authentication and role-based access before any non-synthetic data is considered.
- Make imports idempotent and validate every input row.
- Move the referral adapter server-side (OAuth 2.0 client credentials, TLS 1.3, idempotency keys, trace IDs, retries, audit events, status callbacks). Never store tokens in the browser.

## v0.5 — Care-note assistance
- Explore extraction of structured facts from free-text care notes.
- Require evidence-grounded outputs and deterministic fallbacks.
- Do not send personal data to an external model until privacy controls and contracts are reviewed.
- Test Korean-language summaries with anonymized or synthetic data only.

## v0.6 — Institution knowledge support
- Prototype retrieval over facility procedures and local resource catalogues.
- Cite retrieved document passages in generated answers.
- Separate general answers from institution-specific rules.
- Evaluate incorrect or unsupported answers before widening access.

## v1.0 — Controlled pilot candidate
- Complete security, privacy, accessibility, and operational reviews.
- Conduct workflow interviews with care professionals.
- Validate usefulness, workload impact, and alert quality with an approved pilot protocol.
- Review legal and regulatory classification before any claims that imply clinical use.
- Launch only after data governance, incident response, support, and retention policies exist.

## Architecture direction

- Frontend: Next.js / React / TypeScript
- API: Python / FastAPI
- Persistence: PostgreSQL
- Analytics: Pandas / scikit-learn initially; model complexity only when justified by evidence
- Later extensions: LLM/RAG, local LLM, wearable/IoT, organization-specific deployment

Do not add infrastructure, models, or paid services before they are needed by the validated prototype.
