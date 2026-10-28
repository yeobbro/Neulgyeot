# Neulgyeot technical roadmap

## v0.1 — Public prototype (current)
- [x] Brand migration into the Neulgyeot repository.
- [x] Responsive prototype UI with clearly labeled synthetic records.
- [x] Explainable demo change signals and individual-baseline comparisons.
- [ ] Verify Vercel production deployment and connect it from KREWX.
- [ ] Add smoke tests for filters and signal details.

## v0.2 — Baseline and change detection
- Define typed observation schemas with unit, timestamp, source, and confidence.
- Implement transparent baseline calculations over a defined rolling window.
- Add minimum-observation requirements and missing-data handling.
- Evaluate simple deviation thresholds and multi-day persistence using synthetic fixtures.
- Produce evidence objects that can explain each signal.
- Add unit tests for baseline math, missing observations, and false-alert edge cases.

## v0.3 — API and persistence
- Implement a FastAPI service with versioned endpoints.
- Move to PostgreSQL rather than relying on a serverless filesystem.
- Add migrations, data-retention policies, tenant boundaries, and structured audit logs.
- Add authentication and role-based access before any non-synthetic data is considered.
- Make imports idempotent and validate every input row.

## v0.4 — Care-note assistance
- Explore extraction of structured facts from free-text care notes.
- Require evidence-grounded outputs and deterministic fallbacks.
- Do not send personal data to an external model until privacy controls and contracts are reviewed.
- Test Korean-language summaries with anonymized or synthetic data only.

## v0.5 — Institution knowledge support
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
