# SubZeroDev GitHub Plugin

CLI-first GitHub integration plugin that transforms GitHub repository data into
provider-independent, versioned project models.

The plugin lives in this repository but does not depend on the workstation
toolkit or a future automation runtime.

## Development

Requires Node.js 24 or later.

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
node dist/cli.js --help
```

### PowerShell runner

The cross-platform [`run.ps1`](run.ps1) script provides the supported local and
Docker workflows. Run it from PowerShell 7 or later.

Install dependencies, run every check, build, and smoke-test the CLI:

```powershell
./run.ps1 -Mode Test
```

Build and run the local CLI. Positional arguments are passed to the CLI. Use
`-CliArgument` when an argument begins with a hyphen:

```powershell
./run.ps1 -Mode Local -CliArgument '--help'
./run.ps1 -Mode Local -SkipInstall -CliArgument '--version'
```

> **The five commands are not implemented yet.** `sync`, `list`, `stats`,
> `export`, and `validate` currently print a message and exit `3`, and `run.ps1`
> surfaces that as a failed command. That is the scaffold reporting honestly, not
> a broken install. Only `--help` and `--version` do real work today.

Build the Docker image and run the CLI:

```powershell
./run.ps1 -Mode Docker -BuildImage -CliArgument '--help'
```

For authenticated commands, set the token in the current process and invoke the
container. The script forwards the environment variable by name; it does not
place the token value in the Docker command:

```powershell
$env:GITHUB_TOKEN = 'github_pat_replace_me'
./run.ps1 -Mode Docker -BuildImage sync
```

This is the shape the command will take. `sync` exits `3` until Milestone 3.5
implements it.

Docker mode mounts `.cache/` at `/data/cache` and `output/` at `/data/output`.
Override them with `-CachePath` and `-OutputPath`. Reuse an existing image by
omitting `-BuildImage`, or select another tag with `-ImageName`.

The image runs as UID 10001, so bind-mounted host directories owned by another
user are not writable. On Linux the runner therefore passes the current host
user by default. Override it with `-DockerUser`, or set it explicitly when
invoking Docker directly:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  --volume "$PWD/.cache:/data/cache" \
  --volume "$PWD/output:/data/output" \
  subzerodev-github:local validate
```

Docker Desktop on macOS and Windows maps ownership automatically, so no
`--user` flag is needed there.

### Direct Docker commands

The equivalent commands without the PowerShell wrapper are:

```bash
docker build -t subzerodev-github:local .
docker run --rm subzerodev-github:local --help
docker run --rm \
  --env GITHUB_TOKEN \
  --volume "$PWD/.cache:/data/cache" \
  --volume "$PWD/output:/data/output" \
  subzerodev-github:local sync
```

## CLI

```bash
subzerodev-github sync      # not implemented
subzerodev-github list      # not implemented
subzerodev-github stats     # not implemented
subzerodev-github export    # not implemented
subzerodev-github validate  # not implemented
```

Command behavior is implemented milestone by milestone. The current scaffold
establishes the runner and a stable command surface; each command prints a
message and exits `3` until its milestone lands.

Exit codes are fixed now so callers can rely on them:

| Code | Meaning                               |
| ---- | ------------------------------------- |
| `0`  | Success                               |
| `2`  | Usage or validation error             |
| `3`  | Operational failure                   |
| `4`  | Partial synchronization               |
| `5`  | Authentication or authorization error |
| `6`  | Rate-limited before completion        |

`1` is unused, so an uncaught exception stays distinguishable from a handled
failure.

## Documents

- [Specification](../../SubZeroDev-Ecosystem-Specifications/SubZeroDev.Plugins.GitHub/12-github-plugin.md) — what Phase One is
- [Plugin contract](../../SubZeroDev-Ecosystem-Specifications/SubZeroDev.PluginContract/04-plugin-contract.md) — the generic design this conforms to
- [Build plan](../../SubZeroDev-Ecosystem-Specifications/SubZeroDev.Plugins.GitHub/BUILD-PLAN.md) — the order it is built in
- [Plan review](../../SubZeroDev-Ecosystem-Specifications/SubZeroDev.Plugins.GitHub/reference/IMPLEMENTATION_PLAN_REVIEW.md) — why it reads the way it does
- [ADR-001](../../SubZeroDev-Ecosystem-Specifications/SubZeroDev.Plugins.GitHub/adr/ADR-001-hosting-and-versioning.md) — hosting and versioning
- [ADR-002](../../SubZeroDev-Ecosystem-Specifications/SubZeroDev.Plugins.GitHub/adr/ADR-002-phase-one-boundaries.md) — Phase One boundaries
