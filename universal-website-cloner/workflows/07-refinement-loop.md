# Refinement Loop (V10) with Resumable State (V12)

```
 QA/A11y/Perf/Security/Final-Review findings
        │  (each finding → owner + severity)
        ▼
 Orchestrator triage ──> owner agent fixes ──> re-run the exact failing check ──┐
        ▲                                                                       │
        └────────────────────────── repeat until exit criteria ◄────────────────┘
```

## Rules
1. Fix **by owner** (see agents/README.md). Don't let QA patch frontend files directly.
2. After each fix, re-run only the failing check first, then the broader pipeline to catch regressions.
3. Record each iteration: `node scripts/state.mjs note --site <slug> --agent <name> "fixed V-004: header height"`; unresolved items: add `--issue`.
4. Maximum 5 refinement iterations per issue class; if still failing, document and escalate to the user instead of looping forever.
5. Self-review prompts for the Final Review Agent:
   - "What did the reference do that I never observed?"
   - "Which claims in my report lack a command output?"
   - "What breaks at 320 px, with keyboard only, with an empty database, with a slow network?"

## Exit criteria
No open high/critical defects · worst visual mismatch documented · all reports current · build passes · gaps listed in `unavailable-behavior.md`.

## Hand-off between sessions or hosts
All state lives in `clone-workspace/<slug>/` (git-ignored but zip-able). A new agent runs `node scripts/state.mjs show --site <slug>` and `next`, reads `reports/`, and resumes — no chat history needed.
