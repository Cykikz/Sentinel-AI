# IBM Bob Session Export Checklist

Hackathon judges need exported IBM Bob sessions showing Bob was used meaningfully.

Create this folder before final submission:

```text
bob-session/
  session-01-scout.json
  session-02-prism.json
  session-03-compression.json
  session-04-bob-client.json
  session-05-architect.json
  session-06-memory.json
  session-07-dashboard.json
  session-08-git-hook.json
```

## Required Sessions

| Session | Evidence |
|---|---|
| 01 SCOUT | file walker, import graph, framework detection |
| 02 PRISM | sensitive variable tracing, unsafe sink detection |
| 03 Compression | Caveman reducer, token savings |
| 04 Bob Client | Bob Shell / watsonx config and doctor command |
| 05 ARCHITECT | plain-English rule evaluation |
| 06 Memory | SQLite schema and repository graph |
| 07 Dashboard | AgentCard, SSE hook, dashboard state |
| 08 Git Hook | init, hook install, commit-check |

## Export Steps

1. Open VS Code with IBM Bob extension.
2. Open Bob panel.
3. Export each relevant session.
4. Save files into `bob-session/`.
5. Do not include API keys or secrets.
