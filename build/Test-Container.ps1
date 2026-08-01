#Requires -Version 7.0

[CmdletBinding()]
param(
    [string]$Image = 'subzerodev-github:conformance',
    [switch]$Build
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version

function Invoke-DockerCapture {
    param([Parameter(Mandatory)][string[]]$Arguments, [int[]]$AllowedExitCodes = @(0))
    $temporary = New-TemporaryFile
    $output = @()
    try {
        & docker @Arguments 2> $temporary.FullName | Tee-Object -Variable output | Out-Null
        $exitCode = $LASTEXITCODE
        $errorOutput = Get-Content $temporary.FullName -Raw -ErrorAction SilentlyContinue
        if ($exitCode -notin $AllowedExitCodes) {
            throw "docker $($Arguments -join ' ') exited $exitCode. $errorOutput"
        }
        return [pscustomobject]@{ ExitCode = $exitCode; Stdout = ($output -join "`n"); Stderr = $errorOutput }
    }
    finally {
        Remove-Item $temporary.FullName -Force
    }
}

Push-Location $root
try {
    & npm run build:manifest
    if ($LASTEXITCODE -ne 0) { throw 'Manifest generation and schema validation failed.' }

    if ($Build) {
        & docker build --build-arg "VERSION=$version" --build-arg "REVISION=local" --tag $Image .
        if ($LASTEXITCODE -ne 0) { throw 'Container build failed.' }
    }

    $manifestRun = Invoke-DockerCapture @('run', '--rm', '--network', 'none', $Image, 'manifest')
    $manifest = $manifestRun.Stdout | ConvertFrom-Json
    if ($manifest.id -ne 'subzerodev.github' -or $manifest.version -ne $version) {
        throw 'Bare-container manifest identity/version mismatch.'
    }
    $validatedManifest = (Get-Content (Join-Path $root 'dist/plugin.manifest.json') -Raw).TrimEnd()
    if ($manifestRun.Stdout.TrimEnd() -ne $validatedManifest) {
        throw 'Container manifest differs from the schema-validated build output.'
    }
    $labels = docker image inspect $Image --format '{{json .Config.Labels}}' | ConvertFrom-Json
    if ($labels.'com.subzerodev.plugin.id' -ne $manifest.id -or $labels.'org.opencontainers.image.version' -ne $version) {
        throw 'Image labels do not match the manifest.'
    }
    if ((Invoke-DockerCapture @('run', '--rm', '--network', 'none', $Image, '--help')).ExitCode -ne 0) { throw 'Help failed.' }
    $reportedVersion = (Invoke-DockerCapture @('run', '--rm', '--network', 'none', $Image, '--version')).Stdout.Trim()
    if ($reportedVersion -ne $version) { throw 'CLI version differs from package version.' }
    Invoke-DockerCapture @('run', '--rm', '--network', 'none', $Image, 'unknown') @(2) | Out-Null
    $uid = (Invoke-DockerCapture @('run', '--rm', '--entrypoint', 'id', $Image, '-u')).Stdout.Trim()
    if ($uid -eq '0' -or $uid -ne '10001') { throw "Unexpected default container UID $uid." }
    $explicitUid = (Invoke-DockerCapture @(
        'run', '--rm', '--user', '10001:10001', '--entrypoint', 'id', $Image, '-u'
    )).Stdout.Trim()
    if ($explicitUid -ne '10001') { throw "Explicit UID override produced $explicitUid." }

    $scratch = Join-Path ([System.IO.Path]::GetTempPath()) "subzerodev-container-$([guid]::NewGuid())"
    New-Item -ItemType Directory -Path $scratch | Out-Null
    try {
        $config = (Resolve-Path 'tests/fixtures/container/github.config.json').Path
        $seeded = (Resolve-Path 'tests/fixtures/cache/seeded').Path
        $first = Join-Path $scratch 'first'
        $second = Join-Path $scratch 'second'
        $hostOverride = Join-Path $scratch 'host-override'
        $canaryCache = Join-Path $scratch 'canary-cache'
        $canaryOutput = Join-Path $scratch 'canary-output'
        New-Item -ItemType Directory -Path $first, $second, $canaryCache, $canaryOutput | Out-Null
        $exportRuns = @(
            @{ Path = $first; UserArguments = @() },
            @{ Path = $second; UserArguments = @() }
        )
        if ($IsLinux) {
            New-Item -ItemType Directory -Path $hostOverride | Out-Null
            & chmod 0777 $first $second $hostOverride $canaryCache $canaryOutput
            if ($LASTEXITCODE -ne 0) { throw 'Could not make container output fixtures writable.' }
            $hostUid = (& id -u).Trim()
            $hostGid = (& id -g).Trim()
            if ($hostUid -eq '0') {
                $hostUid = '12345'
                $hostGid = '12345'
            }
            $exportRuns += @{
                Path = $hostOverride
                UserArguments = @('--user', "${hostUid}:${hostGid}")
            }
        }
        foreach ($run in $exportRuns) {
            $arguments = @(
                'run', '--rm'
            ) + $run.UserArguments + @(
                '--network', 'none', '--read-only',
                '--volume', "${config}:/etc/subzerodev/plugin.config.json:ro",
                '--volume', "${seeded}:/var/lib/subzerodev/cache:ro",
                '--volume', "$($run.Path):/var/lib/subzerodev/output",
                $Image, 'export', '--json'
            )
            Invoke-DockerCapture $arguments | Out-Null
        }
        $firstHashes = Get-ChildItem $first -File | Sort-Object Name | ForEach-Object { "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash) $($_.Name)" }
        $secondHashes = Get-ChildItem $second -File | Sort-Object Name | ForEach-Object { "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash) $($_.Name)" }
        if (Compare-Object $firstHashes $secondHashes) { throw 'Repeated container exports differ.' }
        if ($IsLinux) {
            $hostHashes = Get-ChildItem $hostOverride -File | Sort-Object Name | ForEach-Object { "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash) $($_.Name)" }
            if (Compare-Object $firstHashes $hostHashes) {
                throw 'Host-user override export differs or could not write its output.'
            }
        }

        $missingToken = Invoke-DockerCapture @(
            'run', '--rm', '--network', 'none', '--read-only',
            '--volume', "${config}:/etc/subzerodev/plugin.config.json:ro", $Image, 'validate', '--json'
        ) @(5)
        if (($missingToken.Stdout | ConvertFrom-Json).exitCode -ne 5) { throw 'Missing token did not exit 5.' }

        $canary = 'SUBZERODEV_SECRET_CANARY_7b2c91'
        $canaryRun = Invoke-DockerCapture @(
            'run', '--rm', '--network', 'none', '--read-only', '--env', "GITHUB_TOKEN=$canary",
            '--volume', "${config}:/etc/subzerodev/plugin.config.json:ro",
            '--volume', "${canaryCache}:/var/lib/subzerodev/cache",
            '--volume', "${canaryOutput}:/var/lib/subzerodev/output",
            $Image, 'validate', '--json'
        ) @(3)
        if (($canaryRun.Stdout + $canaryRun.Stderr) -match [regex]::Escape($canary)) { throw 'Canary leaked from runtime output.' }
        foreach ($file in Get-ChildItem $canaryCache, $canaryOutput -Recurse -File) {
            $contents = [System.Text.Encoding]::UTF8.GetString(
                [System.IO.File]::ReadAllBytes($file.FullName)
            )
            if ($contents.Contains($canary)) {
                throw "Canary leaked into mounted data at $($file.FullName)."
            }
        }
        $archive = Join-Path $scratch 'image.tar'
        & docker save --output $archive $Image
        if ($LASTEXITCODE -ne 0) { throw 'docker save failed.' }
        $bytes = [System.IO.File]::ReadAllBytes($archive)
        if ([System.Text.Encoding]::UTF8.GetString($bytes).Contains($canary)) { throw 'Canary leaked into image layers.' }
    }
    finally {
        Remove-Item $scratch -Recurse -Force
    }
}
finally {
    Pop-Location
}
