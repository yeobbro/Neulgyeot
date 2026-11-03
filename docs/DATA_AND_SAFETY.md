# Data and safety principles

## Current demo
- Uses synthetic sample records only.
- Contains no real care-recipient names, contact details, diagnoses, or medical records.
- Does not persist user-entered personal data.
- Must not be used to make care, medical, welfare eligibility, or emergency decisions.
- Vital signs are fixed demo values labeled as manual-entry records; nothing implies a real-time device connection.
- Municipal referral and family-report delivery are mock adapters: no network calls, messages or notifications.
- Demo state (assessments, consents, transfers, reports, audit events) lives in memory and resets on reload.

## Hospital ↔ Municipality separation
- The Hospital product owns the EMR and clinical permissions; the Municipality product owns case management. They must not share a database.
- Referral payloads contain only the categories approved in the consent/review step; secondary diagnoses, full history, nursing notes, vitals and contact details are excluded.
- Consent is recorded with recipient, purpose, categories, retention, time, recorder, consenter, document reference, sensitive-information consent, version and withdrawal status. Consent alone is not assumed to authorize every record transfer; legal, hospital and municipal privacy review is required before real use.

## Family sharing
- Family relationship alone never grants access. Authority verification, patient consent (or legal representative authority) and an active sharing status are required.
- Diagnosis, medication and test results are excluded by default and require explicit configuration plus a recorded review.
- Report items distinguish record facts, rule-based aggregation and staff-written text; each lists its sources; staff approval precedes sharing.
- Sharing can be suspended or revoked; creation, approval, delivery, access and revocation are audit events.

## When real data is considered
- Establish an explicit purpose and data-minimization plan.
- Determine the legal basis, notices, consent requirements, processor relationships, retention period, deletion process, and access controls.
- Separate organizations and restrict staff access by role.
- Encrypt data in transit and at rest.
- Maintain audit logs for reads and changes to sensitive records.
- Remove direct identifiers from analytics and testing datasets.
- Review backup, incident response, export, and account termination behavior.
- Never commit credentials, production data, or identifiable records to Git.

## AI behavior
- Treat model output as a support signal, never a diagnosis.
- Show the underlying observations, time range, and comparison baseline.
- State when evidence is insufficient or stale.
- Keep a human review step before real-world action.
- Do not rank a person's social value, worthiness, or eligibility based on behavioral signals.
- Avoid fear-inducing labels; prefer neutral descriptions such as "관찰 변화" and "확인 권장".

## Product claims
Until validated in a governed setting, describe Neulgyeot as a prototype exploring care-record change detection and prioritization support. Do not claim improved health outcomes, diagnostic accuracy, emergency prevention, or regulatory clearance.
