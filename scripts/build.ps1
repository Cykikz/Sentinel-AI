Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")
npm run typecheck
npm run typecheck:frontend
npm run build
npm run build -w packages/frontend
