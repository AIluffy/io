# Error Severity and Response Flow

This defines incident levels and expected response timelines for release issues.

## Severity Levels

## `SEV1` Critical

- Definition: data corruption, incorrect state replay/history, broad runtime crash, or release-blocking production outage.
- Response SLO: acknowledge within 15 minutes.
- Response SLO: mitigation within 60 minutes.
- Response SLO: fix or rollback decision within 4 hours.
- Actions: open incident channel.
- Actions: assign incident commander + comms owner.
- Actions: stop new releases until resolution.

## `SEV2` Major

- Definition: significant feature degradation with viable workaround (single adapter broken, SSR hydration mismatch in a major framework path).
- Response SLO: acknowledge within 60 minutes.
- Response SLO: mitigation within 4 hours.
- Response SLO: fix within 1 business day.
- Actions: hotfix candidate required.
- Actions: add regression test before merge.

## `SEV3` Minor

- Definition: limited impact issue (docs mismatch, non-critical perf regression, edge-case bug).
- Response SLO: acknowledge within 1 business day.
- Response SLO: fix in next planned patch/minor.
- Actions: track in backlog with owner and target milestone.

## Triage Flow

1. Reproduce and classify severity (`SEV1/2/3`).
2. Record impact scope:
   affected package(s), framework(s), versions, user-visible symptoms.
3. Decide mitigation path:
   rollback, feature flag, patch release, or monitored defer.
4. Update status every 30 minutes for `SEV1`, every 2 hours for `SEV2`.
5. Close only after:
   fix merged, regression test added, docs/runbook updated.

## Postmortem Requirements (`SEV1/SEV2`)

- Timeline of detection, escalation, mitigation, and resolution.
- Root cause and triggering change.
- Why guardrails failed (tests/matrix/checklist gaps).
- Action items with owner + due date.
- Action item category: test hardening.
- Action item category: checklist/matrix update.
- Action item category: docs/migration note updates.
