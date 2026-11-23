# Operating guide

## Standards review

Source records live in `src/`. WCAG requirements, HTML and ARIA author requirements, informative APG guidance, and local quality policies retain their stated authority. Resolve patterns by their accessibility IDs. The UI Design Brain adapter checks the package version and actual catalog-manifest digest before interpreting a canonical UI slug.

The scheduled Actions workflow checks the six official indexes daily and all cited documents and fragments weekly. Run `python3 scripts/source-scan.py --mode full --output /tmp/standards-scan.json` for a local observation. The initial comparison baseline covers 101 retrieved documents and their referenced fragments. A matching document digest establishes content stability only. For a changed document, inspect the official locator and affected IDs, record a change or no-impact decision in the issue, and update the accepted digest in the same reviewed PR. Keep the prior digest on retrieval failure.

## Delivery

Install the pinned pnpm version, run `pnpm install --frozen-lockfile`, and use `pnpm verify:ci` for source validation, tests, the packed consumer, and wiki integrity. The Office coordinates issue pickup, independent review, exact-head verification, merge and closeout through the private Accessibility Standards board. Its daily checkpoint is scheduled for 4 p.m. America/New_York. Project-specific holds apply.

Pin Courier proposes dependency and GitHub Actions updates. Dependabot provides alert-driven repairs. The Office is the sole dependency merge owner and uses its existing Ready pickup for Dependabot. The release workflow analyzes conventional commits, skips maintenance commits marked `[skip release]`, and publishes qualifying changes through npm trusted publishing. A successful publication triggers a registry-readiness check and notifies Pin Courier. Verify the npm tarball, provenance, tag, and GitHub Release before retrying any interrupted publication. Replay a failed courier notification independently.
