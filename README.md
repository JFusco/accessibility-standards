# Accessibility Standards

Versioned accessibility contracts for teams and coding agents building web interfaces. Look up one pattern to get its behavior, semantic dependencies, sources, and required evidence.

## Use in a project

With Node 24.14 or newer, install the package as development tooling from your project root.

```sh
npm install --save-dev --save-exact accessibility-standards
npm exec --offline -- accessibility-standards init
npm exec --offline -- accessibility-standards resolve pattern.dialog
```

Commit the lockfile and the small managed entry in `AGENTS.md`. Running `init` again preserves existing instructions. With pnpm, use `pnpm add -DE accessibility-standards` and `pnpm exec accessibility-standards`. A site built in another language can keep npm solely for development tools.

Use `accessibility-standards index` to discover IDs. A dialog lookup includes the pattern and its focus placement, keyboard, naming, dismissal, and focus-return dependencies. JavaScript consumers can import `resolveContract` and read the same contract offline.

```js
import { resolveContract } from 'accessibility-standards';
const dialog = await resolveContract('pattern.dialog');
console.log(dialog.record.behavior, dialog.dependencies, dialog.provenance);
```

The package exports `./index.json`, `./contracts/<id>`, `./coverage`, and `./applicability` as JSON. It includes readable references and per-pattern Markdown under `dist/`. The catalog maps all 55 WCAG 2.2 Level A/AA success criteria, 30 APG patterns, and seven APG practices. Project conformance requires evidence from the actual interface. [W3C evaluation guidance](https://www.w3.org/WAI/test-evaluate/)

## Optional integrations

For checked-in files, create `accessibility-standards.config.json` with the installed pin and a project-owned destination, then create `routes.json` containing `{"version":1,"outputs":{}}`.

```json
{"package":"accessibility-standards@1.0.0","profile":"standalone","routes":"routes.json","outputRoot":"docs/accessibility"}
```

Run `accessibility-standards sync --if-needed` to regenerate and `accessibility-standards check` in CI to detect drift. Sync verifies ownership and preserves locally modified files.

Projects using UI Design Brain can also install `ui-design-brain@1.18.9` exactly and opt into the adapter. Pass canonical slugs. Inspect unresolved candidates before assigning a pattern.

```js
import { resolveUiPatterns } from 'accessibility-standards/ui-design-brain';
const selection = await resolveUiPatterns({ 'component.ui_pattern_ids': ['modal'] });
```

See the [operating guide](OPERATING.md), [context wiki](wiki/INDEX.md), and [source attribution](NOTICE.md).
