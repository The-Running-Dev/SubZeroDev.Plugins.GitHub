---
title: Running in Docker
description: Build the image, run the CLI read-only, and configure mounts and identity.
sidebar_position: 3
---

# Running in Docker

Build locally and inspect commands that require no mounts or network:

```bash
docker build -t subzerodev-github:local .
docker run --rm --network none subzerodev-github:local manifest
docker run --rm --network none subzerodev-github:local --help
```

The image runs as non-root UID `10001`. It reads configuration from
`/etc/subzerodev/plugin.config.json` and uses `/var/lib/subzerodev/cache` and
`/var/lib/subzerodev/output`. Mount configuration and a seeded cache read-only; only cache/output
mounts need write access for the commands that update them.

```bash
docker run --rm --read-only \
  --env GITHUB_TOKEN \
  --volume "$PWD/github.config.json:/etc/subzerodev/plugin.config.json:ro" \
  --volume "$PWD/.cache:/var/lib/subzerodev/cache" \
  --volume "$PWD/output:/var/lib/subzerodev/output" \
  subzerodev-github:local sync --json
```

Passing `--user "$(id -u):$(id -g)"` is supported when Linux bind-mount ownership requires the host
identity. The image declares no `VOLUME`, so this override does not create or hide anonymous volumes.

The runner offers the same workflow from PowerShell:

```powershell
$env:GITHUB_TOKEN = 'github_pat_replace_me'
./run.ps1 -Mode Docker -BuildImage sync --json
```

The container conformance check builds the image, runs the bare manifest without network, verifies
identity/version labels and non-root execution, exercises a read-only configuration and seeded cache,
compares repeated exports byte-for-byte, and scans runtime output and the saved image for a secret
canary.
