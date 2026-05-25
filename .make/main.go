package main

import (
	"fmt"
	"os"
	"strings"

	. "github.com/anchore/go-make"
	"github.com/anchore/go-make/tasks/release"
)

func main() {
	Makefile(
		// npm-based build/test/lint wrappers
		Task{
			Name:        "bootstrap",
			Description: "install npm dependencies",
			Run:         func() { Run("npm ci") },
		},
		Task{
			Name:        "build",
			Description: "build the action distributable (dist/index.cjs)",
			Run:         func() { Run("npm run package") },
		},
		Task{
			Name:        "static-analysis",
			Description: "run typecheck, lint, and format check",
			Run: func() {
				Run("npm run build")
				Run("npm run lint")
				Run("npm run format-check")
			},
		},
		Task{
			Name:        "unit",
			Description: "run unit tests",
			Run:         func() { Run("npm test") },
		},

		// repins src/SyftVersion.ts to the latest published syft release and
		// rebuilds dist/. Intended to be run by a maintainer (or from a fork)
		// who can then commit the diff and open a PR by hand. Requires `gh`
		// to be authenticated (gh auth login).
		Task{
			Name:        "update-syft",
			Description: "bump src/SyftVersion.ts to the latest syft release and rebuild dist/",
			Run: func() {
				version := strings.TrimSpace(Run(`gh release view --json name -q '.name' -R anchore/syft`))
				if version == "" {
					panic("could not determine latest syft release")
				}
				content := fmt.Sprintf("export const VERSION = %q;\n", version)
				if err := os.WriteFile("src/SyftVersion.ts", []byte(content), 0o644); err != nil {
					panic(err)
				}
				fmt.Printf("pinned syft to %s; rebuilding dist/...\n", version)
				Run("npm ci")
				Run("npm run package")
				fmt.Printf("done. Review with `git diff src/SyftVersion.ts dist/` and commit.\n")
			},
		},

		// chronicle-based changelog, gh-cli triggered release.yaml dispatch,
		// and ci-release tag+release task (run from inside release.yaml).
		release.Tasks(),
	)
}
