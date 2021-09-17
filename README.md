# Anchore SBOM Action

A GitHub Action for creating a software bill of materials (SBOM)
using [Syft](https://github.com/anchore/syft).

## Basic Usage

```yaml
- uses: anchore/sbom-action@main
```

By default, this action will execute a Syft scan in the workspace directory
and upload a workflow artifact SBOM in SPDX format. It will also detect
if being run during a `release` and attach the SBOM
as a release asset.

## Example Usage

### Scan a docker image

Use the `image` parameter

```yaml
- uses: anchore/sbom-action@main
  with:
    image: example/image_name
```

### Scan a specific directory

Use the `path` parameter, relative to the repository root

```yaml
- uses: anchore/sbom-action@main
  with:
    path: ./build/
```

### Attach SBOMs to a release

The action will detect being run in a `release` and
automatically upload all SBOMs as release assets. However,
it may be desirable to upload SBOMs generated with other tools or using Syft
outside of this action. To do this, specify a regular expression using
the `sbom-artifact-match` pararmeter, for example:

```yaml
- uses: anchore/sbom-action/attach@main
  sbom-artifact-match: ".*\\.spdx$"
```

### Naming the SBOM output

By default, this action will upload an artifact named
`<repo>-<job-name>[-<step-id|step-number>].<extension>`, for
example:

```yaml
build-sbom:
  steps:
    - uses: anchore/sbom-action@main
    - uses: anchore/sbom-action@main
    - uses: anchore/sbom-action@main
      id: myid
```

Will create 3 artifacts:

```text
my-repo-build-sbom.spdx.json
my-repo-build-sbom-2.spdx.json
my-repo-build-sbom-myid.spdx.json
```

You may need to name these artifacts differently, simply
use the `artifact-name` parameter:

```yaml
- uses: anchore/sbom-action@main
  with:
    artifact-name: sbom.spdx
```

## Configuration

### anchore/sbom-action

The main [SBOM action](action.yml), responsible for generating SBOMs
and attaching them to your wofklow and releases.

| Parameter       | Description                                                                                             | Default                     |
| --------------- | ------------------------------------------------------------------------------------------------------- | --------------------------- |
| `path`          | A path on the filesystem to scan. This is mutually exclusive to `image`.                                | \<current directory>        |
| `image`         | A container image to scan. This is mutually exclusive to `path`.                                        |
| `artifact-name` | The name to use for the generated SBOM artifact. See: [Naming the SBOM output](#naming-the-sbom-output) | `sbom-<job>-<step-id>.spdx` |
| `format`        | The SBOM format to export. One of: `spdx`, `spdx-json`, `cyclonedx`                                     | `spdx-json`                 |

### anchore/sbom-action/download

A sub-action to [download Syft](download/action.yml).

No input parameters.

Output parameters:

| Parameter | Description                     |
| --------- | ------------------------------- |
| `cmd`     | a reference to the Syft binary. |

`cmd` can be referenced in a workflow like other output parameters:
`${{ steps.<step-id>.outputs.cmd }}`

### anchore/sbom-action/attach

A sub-action to [attach multiple SBOMs](attach/action.yml) to releases.

| Parameter             | Description                       | Default             |
| --------------------- | --------------------------------- | ------------------- |
| `sbom-artifact-match` | A pattern to find SBOM artifacts. | `.*\\.spdx\\.json$` |

## Diagnostics

This action makes extensive use of GitHub Action debug logging,
which can be enabled as [described here](https://github.com/actions/toolkit/blob/master/docs/action-debugging.md)
by setting a secret in your repository of `ACTIONS_STEP_DEBUG` to `true`.
