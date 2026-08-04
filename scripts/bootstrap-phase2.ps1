Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'

$ExpectedNode = 'v22.17.0'
$ExpectedPnpm = '11.20.0'

function Invoke-Pnpm {
  param([Parameter(Mandatory = $true)][string[]]$PnpmArgs)

  & corepack pnpm @PnpmArgs
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "pnpm $($PnpmArgs -join ' ') failed with exit code $exitCode"
  }
}

$currentNode = & node --version
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to execute Node.js.'
}

if ($currentNode -ne $ExpectedNode) {
  throw "Node $ExpectedNode is required. Current version: $currentNode"
}

$pnpmOutput = & corepack pnpm --version
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to execute the pinned pnpm version through Corepack.'
}

$currentPnpm = ($pnpmOutput | Select-Object -Last 1).Trim()
if ($currentPnpm -ne $ExpectedPnpm) {
  throw "pnpm $ExpectedPnpm is required. Current version: $currentPnpm"
}

Invoke-Pnpm -PnpmArgs @('install')
Invoke-Pnpm -PnpmArgs @('install', '--frozen-lockfile')
Invoke-Pnpm -PnpmArgs @('format:check')
Invoke-Pnpm -PnpmArgs @('lint')
Invoke-Pnpm -PnpmArgs @('boundaries')
Invoke-Pnpm -PnpmArgs @('typecheck')
Invoke-Pnpm -PnpmArgs @('test')
Invoke-Pnpm -PnpmArgs @('build')
Invoke-Pnpm -PnpmArgs @('phase2:verify')

Write-Host 'Phase 2 bootstrap and verification completed successfully.'
