#Requires -Version 7.0

<#
.SYNOPSIS
Validates or runs the SubZeroDev GitHub plugin locally or in Docker.

.EXAMPLE
./run.ps1 -Mode Test

.EXAMPLE
./run.ps1 -Mode Local -CliArgument '--help'

.EXAMPLE
./run.ps1 -Mode Docker -BuildImage -CliArgument '--help'

.EXAMPLE
$env:GITHUB_TOKEN = 'github_pat_...'
./run.ps1 -Mode Docker -BuildImage sync
#>

[CmdletBinding()]
param(
    [ValidateSet('Test', 'Local', 'Docker')]
    [string]$Mode = 'Local',

    [switch]$BuildImage,

    [switch]$SkipInstall,

    [string]$ImageName = 'subzerodev-github:local',

    [string]$DockerUser = '',

    [string]$CachePath = (Join-Path $PSScriptRoot '.cache'),

    [string]$OutputPath = (Join-Path $PSScriptRoot 'output'),

    [Parameter(ValueFromRemainingArguments)]
    [string[]]$CliArgument = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Command {
    param([Parameter(Mandatory)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$ArgumentList = @()
    )

    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
    }
}

function Initialize-Dependencies {
    if ($SkipInstall) {
        return
    }

    Invoke-CheckedCommand -FilePath 'npm' -ArgumentList @('ci')
}

Push-Location $PSScriptRoot
try {
    switch ($Mode) {
        'Test' {
            Assert-Command -Name 'node'
            Assert-Command -Name 'npm'
            Initialize-Dependencies
            Invoke-CheckedCommand -FilePath 'npm' -ArgumentList @('run', 'check')
            Invoke-CheckedCommand -FilePath 'node' -ArgumentList @('dist/cli.js', '--help')
        }

        'Local' {
            Assert-Command -Name 'node'
            Assert-Command -Name 'npm'
            Initialize-Dependencies
            Invoke-CheckedCommand -FilePath 'npm' -ArgumentList @('run', 'build')

            $arguments = if ($CliArgument.Count -gt 0) { $CliArgument } else { @('--help') }
            Invoke-CheckedCommand -FilePath 'node' -ArgumentList (@('dist/cli.js') + $arguments)
        }

        'Docker' {
            Assert-Command -Name 'docker'

            if ($BuildImage) {
                Invoke-CheckedCommand -FilePath 'docker' -ArgumentList @(
                    'build', '--tag', $ImageName, '.'
                )
            }

            foreach ($directory in @($CachePath, $OutputPath)) {
                if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
                    New-Item -ItemType Directory -Path $directory -Force | Out-Null
                }
            }

            $resolvedCache = (Resolve-Path -LiteralPath $CachePath).Path
            $resolvedOutput = (Resolve-Path -LiteralPath $OutputPath).Path
            # The image runs as UID 10001, so bind mounts owned by the host user are
            # unwritable on Linux unless the container runs as that user.
            $userArguments = @()
            if ($DockerUser) {
                $userArguments = @('--user', $DockerUser)
            }
            elseif ($IsLinux) {
                $userArguments = @('--user', "$(& id -u):$(& id -g)")
            }

            $arguments = if ($CliArgument.Count -gt 0) { $CliArgument } else { @('--help') }
            $dockerArguments = @(
                'run', '--rm'
            ) + $userArguments + @(
                '--env', 'GITHUB_TOKEN',
                '--env', 'SUBZERODEV_GITHUB_CACHE=/data/cache',
                '--env', 'SUBZERODEV_GITHUB_OUTPUT=/data/output',
                '--volume', "${resolvedCache}:/data/cache",
                '--volume', "${resolvedOutput}:/data/output",
                $ImageName
            ) + $arguments

            Invoke-CheckedCommand -FilePath 'docker' -ArgumentList $dockerArguments
        }
    }
}
finally {
    Pop-Location
}
