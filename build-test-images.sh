#!/usr/bin/env bash

set -euxo pipefail

export PLATFORM="linux/amd64"

docker run -d -p 5000:5000 --name registry registry:2

for distro in alpine centos debian; do
  docker build --platform="${PLATFORM}" -t "localhost:5000/match-coverage/${distro}:latest" "./tests/fixtures/image-$distro-match-coverage"
  docker push "localhost:5000/match-coverage/${distro}:latest"
done

