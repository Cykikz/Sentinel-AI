Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")
npm install
npm run build
npm run build -w packages/frontend
npm run demo:check
