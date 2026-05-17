Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")
npm run typecheck
npm run typecheck:frontend
npm run build
npm run build -w packages/frontend
npm run demo:check
npm run judge:check
npm pack --dry-run
