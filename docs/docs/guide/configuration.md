---
title: Configuration
description: Configure credentials, repository scope, collection, paths, budgets, and portfolio overrides.
sidebar_position: 2
---

# Configuration

Start from `examples/github.config.json`. Relative cache, output, and portfolio-override paths resolve
against the configuration file's directory, not the shell's working directory. Effective path
precedence is CLI where a command exposes an override, then environment, then file, then default.

`auth.tokenEnvironmentVariable` names the environment variable to read; it never stores a token.
`auth.allowGhCliTokenReuse` is off by default and applies only to native execution, where the plugin
can read the GitHub CLI credential file. Containers receive the configured token variable directly.

Repository filters decide what is collected and therefore what consumes API budget. Collection
profiles are `basic`, `standard`, and `detailed`. `SUBZERODEV_PLUGIN_CONFIG`,
`SUBZERODEV_PLUGIN_CACHE`, and `SUBZERODEV_PLUGIN_OUTPUT` provide container-friendly path overrides.

Portfolio overrides use a versioned JSON file keyed by the immutable string `providerId`. A `slug`
may accompany an entry for readability but is never used to match it.
