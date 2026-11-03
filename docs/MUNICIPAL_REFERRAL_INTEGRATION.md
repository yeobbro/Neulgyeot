# Discharge-care referral: Hospital → Municipality (API boundary)

> **DEMO 연계 — 실제 지자체 시스템과 연결되어 있지 않습니다.**
> The contract below is an *illustrative* contract, not a finalized government or municipal integration standard. Real integration waits for approved municipal API specifications, partner authorization, legal review and security review.

## Workflow in Neulgyeot Hospital

1. **퇴원 계획** — patient, planned discharge date, expected living arrangement, assigned social worker, coordination status (synchronized from the latest municipal status).
2. **사회복지 평가** — K-ADL (eating, mobility, toileting; prefilled from EMR, must be reviewed), cognition/communication status, fall-risk band, living arrangement, housing type, housing barriers, requested community services, optional social-worker note. Required/optional states, inline validation, draft save. Any edit invalidates the saved draft.
3. **제3자 제공 동의 · 법적 근거 검토** — recipient municipality and organization, purpose, data categories, retention period, consent date/time, recorder, consenter (patient or legal representative + authority check), document reference and verification status, separate sensitive-information consent when health categories are selected, consent form version, withdrawal status, hospital privacy review, municipal requirement check, legal-basis memo. Consent alone is **not** treated as authorizing every record transfer.
4. **전송 데이터** — typed, versioned JSON preview of only the approved categories, with structural and minimum-necessary validation and copy button.
5. **전송·이력** — send is disabled until all checks pass; mock adapter returns deterministic status events. Timeline shows transfer ID, recipient, submitted time, current status, status update time, reason and latest message.

Statuses: 작성 중 · 동의 확인 필요 · 전송 준비 (hospital draft) → 전송 완료 · 수신 확인 · 심사 중 · 보완 요청 · 승인 · 반려 · 연계 종료.

## Minimum-necessary payload

Code: `lib/integrations/municipal-referral/` (`types.ts`, `validation.ts`, `defaults.ts`, `mock-adapter.ts`).

- `subject.contact` is always `null`; contact is confirmed through the municipality's own process.
- Only the principal diagnosis (never secondary diagnoses or full history), only three K-ADL items, only the fall-risk band (no score/notes), only medication name + frequency.
- No full EMR, nursing notes, vital signs or internal staff comments.
- `validateReferralEnvelope` rejects any populated section outside `consent.scope`, non-synthetic IDs, missing sensitive consent, bad formats.

```json
{
  "schemaVersion": "1.0",
  "transferId": "DEMO-TR-0002-01",
  "eventType": "discharge-care-referral",
  "source": { "facilityId": "DEMO-FACILITY-0001" },
  "destination": { "municipalityCode": "DEMO-MUNI-11002" },
  "subject": { "patientId": "SYN-P-0002", "name": "박정호", "birthDate": "1938-11-02", "contact": null },
  "discharge": { "plannedDate": "2026-11-20" },
  "clinicalSummary": { "kAdl": { "eating": "자립", "mobility": "부분 도움", "toileting": "부분 도움" } },
  "livingNeeds": { "livingArrangement": "독거", "housingType": "다세대·연립", "barriers": ["계단"], "requestedServices": ["방문 간호", "식사 지원"] },
  "consent": { "status": "DEMO_GRANTED", "version": "1.0", "recordedAt": "2026-11-03T10:30:00+09:00", "scope": ["identity", "discharge", "kAdl", "livingNeeds"], "sensitiveInformationConsent": "granted", "retention": "untilCaseClosure" }
}
```

## Production boundary (target)

**Hospital system** owns the EMR and clinical permissions, generates the minimum approved payload, and retains the authoritative record.
**Municipal system** independently manages case data and workflow, receives only authorized referral information, and returns limited status and follow-up messages.
**Integration layer** is not a shared database, never exposes unrestricted hospital records, tracks consent/legal basis, transfer ID, timestamps and audit events, and supports schema versioning and controlled retries.

The two products must have independent deployments, data stores, organization boundaries and permission models.

### Requirements for a real adapter

- Runs server-side only (never from the browser); no tokens in `localStorage`, no secrets in Git.
- OAuth 2.0 (client credentials) with narrowly scoped access; server-to-server authentication (e.g., mTLS where required).
- TLS 1.3.
- `Idempotency-Key` per submission (the mock already returns the same record for a repeated key).
- `schemaVersion` negotiation and a trace ID per request.
- Bounded retries with backoff; explicit error taxonomy; dead-letter handling.
- Audit events for create, consent change, send, response, withdrawal.
- Minimal status callbacks from the municipality (status + reason/message only).
- Withdrawal propagation semantics agreed with the municipality.

### Replacing the mock

`MunicipalReferralAdapter` (`submit`, `advance`, `resubmit`, `canAdvance`) is the seam. A production implementation would replace `advance` with webhook/callback ingestion on the server and expose results to the UI through the hospital's own API.
