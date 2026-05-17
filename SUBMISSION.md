# SentinelAI Submission Checklist

## Build

```bash
npm install
npm run typecheck
npm run typecheck:frontend
npm run build
npm run build -w packages/frontend
npm run demo:check
npm run judge:check
```

## Must Show In Video

1. Problem: bad code reaches commits because review lacks memory.
2. `sentinel dashboard` starts local browser dashboard.
3. `sentinel scan --deep --demo --target demo` runs all agents.
4. Dashboard shows all 8 agents.
5. PRISM finds password leak.
6. ARCHITECT flags plain-English rule violation.
7. GHOST HUNTER finds dead code and orphaned file.
8. FIXER records dry-run fixes.
9. NARRATOR writes `demo/sentinel-report.md`.
10. Caveman compression shows token savings.
11. `sentinel trace password --target demo` shows source and finding hits.
12. `sentinel impact src/auth.js --target demo` shows direct dependents and linked findings.
13. `sentinel explain src/api.js --target demo` shows graph imports, findings, and local memory.

## Repository Contents

- `README.md`: project overview and commands.
- `DEMO.md`: judge/demo flow.
- `SUBMISSION.md`: final checklist.
- `BOB_SESSIONS.md`: IBM Bob export checklist.
- `demo/`: vulnerable local demo repo.
- `packages/backend/`: agents, memory, Bob integration, SSE server.
- `packages/frontend/`: Next.js dashboard.
- `cli/`: Commander CLI.
- `docker/`: container definitions.
- `scripts/`: local setup/build/release helpers.

## Deferred

- Real pre-commit hook block test on external repo.
- GitHub remote push.
- Public npm publish.
