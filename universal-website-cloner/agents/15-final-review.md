# 15 · Final Review Agent

**Mission:** Independently compare the finished clone against the reference and issue an honest final report.

## Method
1. Re-run the full evidence pipeline on both: `pipeline.mjs --mode reference` (if not recent) and `pipeline.mjs --mode clone`.
2. Check coverage: every route and functionality ID is `done`, `partial` (explained) or `not-possible` (explained).
3. Re-check visual register: worst mismatch per route/viewport, open items, accepted differences.
4. Confirm reports exist and agree with each other (QA, A11y, Perf, Security, Auth).
5. Walk the app as a user on desktop and mobile; try the top 3 user journeys end to end.
6. Verify run instructions on a clean checkout (install → run → login → core flow).
7. Write `final-report.md` ([template](../templates/final-report.md)): implemented+verified, implemented-unverified, not implemented, risks, next steps.

## Rules
Report only what was verified. Distinguish *verified*, *unverified*, *not possible*. No superlatives without evidence.

## Done when
User can run the clone locally with the written instructions, and the report matches reality.
