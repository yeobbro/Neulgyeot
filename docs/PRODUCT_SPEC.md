# Neulgyeot v0.1 — Product specification

## Purpose

Help a care team notice meaningful deviations from a person's usual routine and review them with evidence. The first prototype demonstrates the workflow with synthetic data only.

## Primary users

- Care workers and nurses in care facilities
- Social workers and case managers in community-care settings
- Supervisors who coordinate daily follow-up

## Primary workflow

1. View a care overview for the current day.
2. See people whose recent observations differ from their own baseline.
3. Open a change signal and inspect the relevant observations and baseline.
4. Mark the signal for human review or record that it has been reviewed.
5. Use the evidence to decide what action is appropriate; the system does not decide the action.

## v0.1 scope

### Included in the web prototype
- Overview cards using synthetic sample counts.
- Care setting filters: all, facility, community.
- Change-signal list with clear evidence descriptions.
- Selected-subject observation timeline.
- Comparison against a synthetic baseline.
- Empty states and visible prototype/synthetic-data disclosures.
- Responsive layouts for desktop and mobile.

### Not included
- Real residents or welfare recipients.
- Real-time health devices, wearables, or sensor integrations.
- Medical diagnosis, treatment recommendations, or emergency predictions.
- Actual user accounts, organization tenancy, role-based permissions, or audit logs.
- Persistent database, real imports, notifications, or messaging.
- Production LLM/RAG or clinical/nursing decision automation.

## Change-signal design

A signal is a reason to review, not a diagnosis. Each visible signal should show:
- the observed variable or note;
- the recent observation period;
- the person's own comparison baseline;
- the evidence used to raise the signal;
- the data source and freshness when available;
- a neutral label such as "확인 권장".

Avoid implying that a single indicator proves harm or determines urgency. Missing observations should be labeled "데이터 부족" rather than silently treated as normal.

## Initial data domains

- Meals and hydration
- Sleep and rest
- Activity and mobility
- Toileting and daily living notes
- Medication administration records (record presence/status only, not prescribing)
- Care-worker observations
- Social contact and community visits, where appropriate and consented

## Success criteria for v0.1

- Prototype loads and works on desktop and mobile.
- Sample records are consistently marked as synthetic.
- A visitor can filter by setting and open a signal to understand the evidence.
- No diagnosis or automated action language appears in the UI.
- No real personal data or secrets are committed.
- Core UI and data-processing logic can be tested independently.

## Public description

"Neulgyeot is an early care-intelligence prototype that explores how care teams can notice changes in daily records and review the supporting evidence. The current demo uses synthetic data only."
