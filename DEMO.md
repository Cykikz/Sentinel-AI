# SentinelAI Demo Guide

This demo runs fully local. No source code leaves the machine.

## Start Dashboard

```bash
cd D:\BOB\sentinelai
node dist/cli/src/index.js dashboard --target demo
```

Open:

```text
http://localhost:3000
```

## Run Deterministic Demo Scan

In second terminal:

```bash
cd D:\BOB\sentinelai
node dist/cli/src/index.js scan --deep --demo --target demo
```

Expected:

```text
DEMO_MODE=true; live IBM Bob calls skipped.
SCOUT complete
GHOST HUNTER complete
PRISM complete: 6 sensitive data findings
ARCHITECT complete: 1 violations across 1 rules
DOMINO complete
VERIFIER complete
CONFIDENCE complete: avg 93%, health 0/100
FIXER complete
Compression: 1206 -> 302 tokens (75% saved, mode full)
NARRATOR complete
Scan complete: 12 findings, health 0/100
```

## What To Show

1. Dashboard: all 8 agents complete.
2. Health ring: `0/100` on vulnerable demo.
3. Findings list:
   - PRISM password leak in `demo/src/auth.js`
   - ARCHITECT rule violation in `demo/src/api.js`
   - GHOST HUNTER dead code in `demo/src/helpers.js`
   - orphaned file in `demo/src/utils.js`
4. Fix preview: FIXER dry-run result.
5. Report: `demo/sentinel-report.md`.
6. Token savings: `75% saved`.
7. Local intelligence:

```bash
node dist/cli/src/index.js trace password --target demo
node dist/cli/src/index.js impact src/auth.js --target demo
node dist/cli/src/index.js explain src/api.js --target demo
```

## Local Checklist

```bash
cd D:\BOB\sentinelai
npm run demo:check
npm run judge:check
```

Expected:

```text
Demo checklist: OK
Scan <id>: 12 findings, health 0/100
Judge checklist: OK
```

## Deferred Until Real Repo

Pre-commit hook test is intentionally deferred until SentinelAI is attached to a real Git repository.
No GitHub push or remote repo is required for this local demo.
