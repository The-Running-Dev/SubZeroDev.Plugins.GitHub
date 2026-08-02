# GitHub response fixtures

The repository shape was recorded from GitHub's public REST API response for
`The-Running-Dev/SubZeroDev.Plugins.GitHub` on 2026-08-01 and reduced to the fields consumed by the
adapter. Identifiers and values are sanitized; variants preserve the recorded shape while changing
values to exercise conditions the source repository cannot simultaneously have.

The fixtures contain no authorization headers, tokens, private repository names, email addresses,
or other account-private data. Error bodies retain GitHub's public response shape but use generic
messages. The pagination files are recorded-shape page bodies assembled from the sanitized
repository fixtures so tests can exercise a sequence without a live account.
