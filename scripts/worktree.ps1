# scripts/worktree.ps1 — Wrapper PowerShell para scripts/worktree.py
param (
    [Parameter(Mandatory=$true, Position=0)]
    [ValidateSet("create", "remove", "list")]
    [string]$Action,

    [Parameter(Position=1)]
    [string]$TaskId = "",

    [string]$Base = "main",
    [switch]$DeleteBranch,
    [string]$Path = ""
)

$scriptPath = Join-Path $PSScriptRoot "worktree.py"

$pyArgs = @($scriptPath, $Action)
if ($TaskId -ne "") {
    $pyArgs += $TaskId
}
if ($Action -eq "create") {
    $pyArgs += "--base"
    $pyArgs += $Base
    if ($Path -ne "") {
        $pyArgs += "--path"
        $pyArgs += $Path
    }
}
if ($Action -eq "remove") {
    if ($DeleteBranch) {
        $pyArgs += "--delete-branch"
    }
    if ($Path -ne "") {
        $pyArgs += "--path"
        $pyArgs += $Path
    }
}

python @pyArgs
