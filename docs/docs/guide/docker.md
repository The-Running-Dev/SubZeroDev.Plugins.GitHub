---
title: Running in Docker
description: Build the image, run the CLI in a container, and understand the mounts and user.
sidebar_position: 2
---

# Running in Docker

## Build and run

```powershell
./run.ps1 -Mode Docker -BuildImage -CliArgument '--help'
```

Reuse an existing image by omitting `-BuildImage`, or select another tag with `-ImageName`.

## Authentication

For commands that need GitHub access, set the token in the current process and invoke the container.
The runner forwards the environment variable by name; it never places the token value in the Docker
command itself:

```powershell
$env:GITHUB_TOKEN = 'github_pat_replace_me'
./run.ps1 -Mode Docker -BuildImage sync
```

This is the shape the command will take. `sync` exits `3` until its build milestone lands — see
[`BUILD-PLAN.md`](https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/blob/main/BUILD-PLAN.md).

## Mounts

Docker mode mounts the host's `.cache/` and `output/` directories onto the plugin contract's
plugin-neutral cache and output paths, `/var/lib/subzerodev/cache` and `/var/lib/subzerodev/output` —
deliberately plugin-neutral names, so a host adapter needs no per-plugin knowledge of where to mount
anything. Override the host-side directories with `-CachePath` and `-OutputPath`.

> **Nothing in `src/` reads either path yet.** No configuration loader exists, so the contract's
> read-only configuration mount at `/etc/subzerodev/plugin.config.json` is not wired up either. The
> runner and the image declare the contract-correct invocation surface ahead of the code that
> consumes it — see [Where the implementation stands](../reference/contract-conformance.md).

## User and permissions

The image runs as UID 10001, so bind-mounted host directories owned by another user are not writable.
On Linux the runner passes the current host user by default. Override it with `-DockerUser`, or set
it explicitly when invoking Docker directly:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  --volume "$PWD/.cache:/var/lib/subzerodev/cache" \
  --volume "$PWD/output:/var/lib/subzerodev/output" \
  subzerodev-github:local validate
```

Docker Desktop on macOS and Windows maps ownership automatically, so no `--user` flag is needed
there.

## Direct Docker commands

The equivalent commands without the PowerShell wrapper:

```bash
docker build -t subzerodev-github:local .
docker run --rm subzerodev-github:local --help
docker run --rm \
  --env GITHUB_TOKEN \
  --volume "$PWD/.cache:/var/lib/subzerodev/cache" \
  --volume "$PWD/output:/var/lib/subzerodev/output" \
  subzerodev-github:local sync
```
