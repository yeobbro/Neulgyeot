# Data and safety principles

## Current demo
- Uses synthetic sample records only.
- Contains no real care-recipient names, contact details, diagnoses, or medical records.
- Does not persist user-entered personal data.
- Must not be used to make care, medical, welfare eligibility, or emergency decisions.

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
