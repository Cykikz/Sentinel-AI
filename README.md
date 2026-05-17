# SentinelAI

Autonomous repository intelligence runtime for the IBM Bob Hackathon 2026.

## Structure

```txt
sentinelai/
  packages/
    backend/     # agents, Bob integration, SQLite memory, future Express/SSE server
    frontend/    # future Next.js dashboard
  cli/           # global sentinel CLI package
  demo/          # vulnerable demo repository
```

## Current Status

Implemented through Phase 14:

- Phase 0: TypeScript monorepo foundation + Bob Shell connectivity.
- Phase 1: Local SQLite memory system.
- Phase 2: SCOUT agent repository graph builder.
- Phase 3: GHOST HUNTER, PRISM, ARCHITECT core agents.
- Phase 4: DOMINO, VERIFIER, FIXER, NARRATOR support agents.
- Phase 5: Caveman compression pipeline and token-savings metrics.
- Phase 6: Modular CLI commands for init, scan, health, rules, config, report, hooks, and commit-check.
- Phase 7: Live Next.js dashboard with backend SSE, agent board, health trend, findings, and fix preview.
- Phase 8: Bulletproof local demo mode, planted vulnerable demo repo, and deterministic demo checklist.
- Phase 9: Submission/package polish with demo guide, Bob session checklist, Docker files, and local build scripts.
- Phase 10: Mode 1 silent watcher that refreshes repository graph memory after local file changes.
- Phase 11: Confidence scoring engine with per-finding confidence and security/architecture/hygiene health breakdowns.
- Phase 12: Git history analyzer with contributor risk/fix memory and `sentinel history`.
- Phase 13: Local query intelligence powering richer `trace`, `impact`, and `explain` commands.
- Phase 14: Judge-ready hardening with one-command final checklist and release verification.

Dashboard runs locally through `sentinel dashboard`. Silent watcher runs through `sentinel watch`.

## Commands

```bash
npm run typecheck
npm run build
npm run test:bob:demo
npm run test:memory
npm run test:scout
npm run test:agents
npm run test:confidence
npm run test:compression
npm run test:git
npm run test:queries
npm run test:support
npm run test:watcher
npm run judge:check
node dist/cli/src/index.js scan --agent scout --target demo
node dist/cli/src/index.js scan --deep --target demo
node dist/cli/src/index.js watch --once --target demo
node dist/cli/src/index.js history --target .
node dist/cli/src/index.js trace password --target demo
node dist/cli/src/index.js impact src/auth.js --target demo
node dist/cli/src/index.js explain src/api.js --target demo
node dist/cli/src/index.js health --target demo
npm run typecheck:frontend
npm run demo:check
npm run release:check
```

## Demo

See [DEMO.md](DEMO.md).

```bash
node dist/cli/src/index.js dashboard --target demo
node dist/cli/src/index.js scan --deep --demo --target demo
```

## Submission

See [SUBMISSION.md](SUBMISSION.md) and [BOB_SESSIONS.md](BOB_SESSIONS.md).
