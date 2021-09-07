# Anchore SBOM Action

A GitHub Action for creating software bill of materials (SBOM) using Syft.

## Basic Usage

```yaml
- uses: anchore/sbom-action@v1
```

And that's it!

This will by default execute a Syft scan of the root directory
of the workspace and output a SBOM in SPDX format
report to the workflow log. It will also detect
if being run during a `release` and upload
a release asset of the SBOM named `sbom.spdx`.

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
