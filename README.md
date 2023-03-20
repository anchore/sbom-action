# GitHub Action for SBOM Generation

[![GitHub release](https://img.shields.io/github/release/anchore/sbom-action.svg)](https://github.com/anchore/sbom-action/releases/latest)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/anchore/sbom-action/blob/main/LICENSE)
[![Slack Invite](https://img.shields.io/badge/Slack-Join-blue?logo=slack)](https://anchore.com/slack)

A GitHub Action for creating a software bill of materials (SBOM)
using [Syft](https://github.com/anchore/syft).

## Basic Usage

```yaml
- uses: anchore/sbom-action@v0
```

By default, this action will execute a Syft scan in the workspace directory
and upload a workflow artifact SBOM in SPDX format. It will also detect
if being run during a [GitHub release](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
and upload the SBOM as a release asset.

## Example Usage

### Scan a container image

To scan a container image, use the `image` parameter:

```yaml
- uses: anchore/sbom-action@v0
  with:
    image: ghcr.io/example/image_name:tag
```

The image will be fetched using the Docker daemon if available,
which will use any authentication available to the daemon.

If the Docker daemon is not available, the action will retrieve the image
directly from the container registry.

It is also possible to directly connect to the container registry with the
`registry-username` and `registry-password` parameters. This will always bypass the
Docker daemon:

```yaml
- uses: anchore/sbom-action@v0
  with:
    image: my-registry.com/my/image
    registry-username: mr_awesome
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
```

### Scan a specific directory

Use the `path` parameter, relative to the repository root:

```yaml
- uses: anchore/sbom-action@v0
  with:
    path: ./build/
```

### Scan a specific file

Use the `file` parameter, relative to the repository root:

```yaml
- uses: anchore/sbom-action@v0
  with:
    file: ./build/file
```

### Publishing SBOMs with releases

The `sbom-action` will detect being run during a
[GitHub release](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
and automatically upload all SBOMs as release assets. However,
it may be desirable to upload SBOMs generated with other tools or using Syft
outside this action. To do this, use the `anchore/sbom-action/publish-sbom` sub-action
and specify a regular expression with the `sbom-artifact-match`
parameter:

```yaml
- uses: anchore/sbom-action/publish-sbom@v0
  with:
    sbom-artifact-match: ".*\\.spdx$"
```

### Naming the SBOM output

By default, this action will upload an artifact named
`<repo>-<job-name>[-<step-id|step-number>].<extension>`, for
example:

```yaml
build-sbom:
  steps:
    - uses: anchore/sbom-action@v0
    - uses: anchore/sbom-action@v0
    - uses: anchore/sbom-action@v0
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
- uses: anchore/sbom-action@v0
  with:
    artifact-name: sbom.spdx
```

## Configuration

### anchore/sbom-action

The main [SBOM action](action.yml), responsible for generating SBOMs
and uploading them as workflow artifacts and release assets.

| Parameter                   | Description                                                                                                                                             | Default                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `path`                      | A path on the filesystem to scan. This is mutually exclusive to `file` and `image`.                                                                     | \<current directory>             |
| `file`                      | A file on the filesystem to scan. This is mutually exclusive to `path` and `image`.                                                                     |                                  |
| `image`                     | A container image to scan. This is mutually exclusive to `path` and `file`. See [Scan a container image](#scan-a-container-image) for more information. |                                  |
| `registry-username`         | The registry username to use when authenticating to an external registry                                                                                |                                  |
| `registry-password`         | The registry password to use when authenticating to an external registry                                                                                |                                  |
| `artifact-name`             | The name to use for the generated SBOM artifact. See: [Naming the SBOM output](#naming-the-sbom-output)                                                 | `sbom-<job>-<step-id>.spdx.json` |
| `output-file`               | The location to output a resulting SBOM                                                                                                                 |                                  |
| `format`                    | The SBOM format to export. One of: `spdx`, `spdx-json`, `cyclonedx`, `cyclonedx-json`                                                                   | `spdx-json`                      |
| `dependency-snapshot`       | Whether to upload the SBOM to the GitHub Dependency submission API                                                                                      | `false`                          |
| `upload-artifact`           | Upload artifact to workflow                                                                                                                             | `true`                           |
| `upload-artifact-retention` | Retention policy in days for uploaded artifact to workflow.                                                                                             |                                  |
| `upload-release-assets`     | Upload release assets                                                                                                                                   | `true`                           |
| `syft-version`              | The version of Syft to use                                                                                                                              |                                  |
| `github-token`              | Authorized secret GitHub Personal Access Token.                                                                                                         | `github.token`                   |

### anchore/sbom-action/publish-sbom

A sub-action to [upload multiple SBOMs](publish-sbom/action.yml) to GitHub releases.

| Parameter             | Description                       | Default             |
| --------------------- | --------------------------------- | ------------------- |
| `sbom-artifact-match` | A pattern to find SBOM artifacts. | `.*\\.spdx\\.json$` |

### anchore/sbom-action/download-syft

A sub-action to [download Syft](download-syft/action.yml).

| Parameter      | Description                     | Default |
| -------------- | ------------------------------- | ------- |
| `syft-version` | The version of Syft to download |         |

Output parameters:

| Parameter | Description                                                        |
| --------- | ------------------------------------------------------------------ |
| `cmd`     | a reference to the [Syft](https://github.com/anchore/syft) binary. |

`cmd` can be referenced in a workflow like other output parameters:
`${{ steps.<step-id>.outputs.cmd }}`

## Windows

Windows is currently supported via Windows Subsystem for Linux (WSL). It is
required to set up a WSL distribution prior to invoking the `sbom-action`, for
example, you can add the small Alpine image:

```yaml
- uses: Vampire/setup-wsl@v2
  with:
    distribution: Alpine
```

## Diagnostics

This action makes extensive use of GitHub Action debug logging,
which can be enabled as [described here](https://github.com/actions/toolkit/blob/master/docs/action-debugging.md)
by setting a secret in your repository of `ACTIONS_STEP_DEBUG` to `true`.
