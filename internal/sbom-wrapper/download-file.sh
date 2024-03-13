#!/bin/bash

set -euo pipefail

# Download the file from the assets.
version=$(echo "$UNTRUSTED_TAG" | cut -f3 -d '/')
gh release download "$version" -p "$UNTRUSTED_ASSET" --clobber