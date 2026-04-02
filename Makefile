.PHONY: update-syft-release
update-syft-release:
	@LATEST_VERSION=$$(gh release view --json name -q '.name' -R anchore/syft) && \
		echo "export const VERSION = \"$$LATEST_VERSION\";" > src/SyftVersion.ts && \
		npm ci
