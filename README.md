# Anchore SBOM Action

A GitHub Action for creating a software bill of materials (SBOM)
using [Syft](https://github.com/anchore/syft).

## Basic Usage

```yaml
- uses: anchore/sbom-action@main
```

By default, this action will execute a Syft scan in the workspace directory
and upload a workflow artifact SBOM in SPDX format. It will also detect
if being run during a [GitHub release](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
and upload the SBOM as a release asset.

## Example Usage

### Scan a container image

To scan a container image using the docker daemon use the `image` parameter:

```yaml
- uses: anchore/sbom-action@main
  with:
    image: example/image_name
```

With a container registry:

```yaml
- uses: anchore/sbom-action@main
  with:
    image: ghcr.io/example/image_name:tag
```

### Scan a specific directory

Use the `path` parameter, relative to the repository root:

```yaml
- uses: anchore/sbom-action@main
  with:
    path: ./build/
```

### Upload SBOMs as release assets

The `sbom-action` will detect being run during a
[GitHub release](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
and automatically upload all SBOMs as release assets. However,
it may be desirable to upload SBOMs generated with other tools or using Syft
outside this action. To do this, use the `anchore/sbom-action/release-sbom` sub-action
and specify a regular expression with the `sbom-artifact-match`
parameter:

```yaml
- uses: anchore/sbom-action/release-sbom@main
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
and uploading them as workflow artifacts and release assets.

| Parameter       | Description                                                                                             | Default                     |
| --------------- | ------------------------------------------------------------------------------------------------------- | --------------------------- |
| `path`          | A path on the filesystem to scan. This is mutually exclusive to `image`.                                | \<current directory>        |
| `image`         | A container image to scan. This is mutually exclusive to `path`.                                        |
| `artifact-name` | The name to use for the generated SBOM artifact. See: [Naming the SBOM output](#naming-the-sbom-output) | `sbom-<job>-<step-id>.spdx` |
| `format`        | The SBOM format to export. One of: `spdx`, `spdx-json`, `cyclonedx`                                     | `spdx-json`                 |

### anchore/sbom-action/release-sbom

A sub-action to [upload multiple SBOMs](release-sbom/action.yml) to GitHub releases.

| Parameter             | Description                       | Default             |
| --------------------- | --------------------------------- | ------------------- |
| `sbom-artifact-match` | A pattern to find SBOM artifacts. | `.*\\.spdx\\.json$` |

### anchore/sbom-action/download-syft

A sub-action to [download Syft](download-syft/action.yml).

No input parameters.

Output parameters:

| Parameter | Description                                                        |
| --------- | ------------------------------------------------------------------ |
| `cmd`     | a reference to the [Syft](https://github.com/anchore/syft) binary. |

`cmd` can be referenced in a workflow like other output parameters:
`${{ steps.<step-id>.outputs.cmd }}`

## Diagnostics

This action makes extensive use of GitHub Action debug logging,
which can be enabled as [described here](https://github.com/actions/toolkit/blob/master/docs/action-debugging.md)
by setting a secret in your repository of `ACTIONS_STEP_DEBUG` to `true`.
