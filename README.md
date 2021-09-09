# Anchore SBOM Action

A GitHub Action for creating software bill of materials (SBOM)
using [Syft](https://github.com/anchore/syft).

## Basic Usage

```yaml
- uses: anchore/sbom-action@v1
```

By default, this action will execute a Syft scan in the workspace directory
and upload a workflow artifact SBOM in SPDX format. It will also detect
if being run during a `release` and attach the SBOM
as a release asset.

## Example Usage

### Scan a docker image

Use the `image` parameter

```yaml
- uses: anchore/sbom-action@v1
  with:
    image: example/image_name
```

### Scan a specific directory

Use the `path` parameter, relative to the repository root

```yaml
- uses: anchore/sbom-action@v1
  with:
    path: ./build/
```

### Naming the SBOM output

By default, this action will upload an artifact named `sbom-<job-name>[-<step-number>].<format>`, for
example:

```yaml
build:
  steps:
    - uses: anchore/sbom-action@v1
    - uses: anchore/sbom-action@v1
```

Will create 2 artifacts:

```text
sbom-build.spdx
sbom-build-2.spdx
```

You may need to name these artifacts differently, simply
use the `output_file` parameter:

```yaml
- uses: anchore/sbom-action@v1
  with:
    output_file: sbom.spdx
```

### Development

Note this makes extensive use of Github Action debug logging,
which can be enabled as [described here](https://github.com/actions/toolkit/blob/master/docs/action-debugging.md)
by setting a secret in your repository of `ACTIONS_STEP_DEBUG` to `true`
