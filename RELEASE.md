# Release

A release publishes a `vX.Y.Z` git tag, a [GitHub release](https://github.com/anchore/sbom-action/releases) with a chronicle-generated changelog, and the committed `dist/index.cjs`. Aim for a 1–2 week cadence.

From a clean checkout of `main`:

```sh
make release
```

## Updating Syft

`make update-syft` repins `src/SyftVersion.ts` and rebuilds `dist/` — review the diff and open a PR. Requires `gh` auth.
