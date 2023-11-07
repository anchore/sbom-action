# Developing

Information to get started developing the `sbom-action`.

## Logging

If you would like to get more extensive debug logging, it is
possible to enable this as [described here](https://github.com/actions/toolkit/blob/master/docs/action-debugging.md)
by setting a secret in your repository of `ACTIONS_STEP_DEBUG` to `true`.

## Tests

To run tests locally, you will need a local docker instance and registry along with a few
known images from the fixtures. Just run:

```shell
docker run -d -p 5000:5000 --name registry registry:2
```

... and a set of images built:

```shell
for distro in alpine centos debian; do
  docker build -t "localhost:5000/match-coverage/${distro}:latest" "./tests/fixtures/image-$distro-match-coverage"
  docker push "localhost:5000/match-coverage/${distro}:latest"
done
```
