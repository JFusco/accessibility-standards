import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function readJsonYaml(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function filesUnder(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : path.endsWith('.yml') ? [path] : [];
  }));
  return nested.flat();
}

async function loadSchemas(root) {
  const schemasRoot = join(root, 'schemas');
  const names = (await readdir(schemasRoot))
    .filter((name) => name.endsWith('.schema.json'))
    .sort();
  return Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    JSON.parse(await readFile(join(schemasRoot, name), 'utf8')),
  ])));
}

export async function loadStandards(root = packageRoot) {
  const semantics = [];
  for (const file of await filesUnder(join(root, 'src', 'semantics'))) {
    const parsed = await readJsonYaml(file);
    semantics.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  const patterns = [];
  for (const file of await filesUnder(join(root, 'src', 'patterns'))) patterns.push(await readJsonYaml(file));
  const foundations = [];
  for (const file of await filesUnder(join(root, 'src', 'foundations'))) foundations.push(await readJsonYaml(file));
  const policies = [];
  for (const file of await filesUnder(join(root, 'src', 'policies'))) policies.push(await readJsonYaml(file));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const contract = await readJsonYaml(join(root, 'src', 'contract.yml'));
  const profiles = { standalone: { name: 'standalone', version: pkg.version } };
  return {
    package: pkg,
    contract: { ...contract, package_version: pkg.version },
    sources: await readJsonYaml(join(root, 'src', 'sources.yml')),
    wcagCoverage: await readJsonYaml(join(root, 'src', 'coverage', 'wcag-2.2.yml')),
    apgCoverage: await readJsonYaml(join(root, 'src', 'coverage', 'aria-apg.yml')),
    facts: await readJsonYaml(join(root, 'src', 'applicability', 'facts.yml')),
    matrix: await readJsonYaml(join(root, 'src', 'applicability', 'matrix.yml')),
    uiDesignBrainBindings: await readJsonYaml(join(root, 'src', 'applicability', 'ui-design-brain-bindings.yml')),
    evidence: await readJsonYaml(join(root, 'src', 'evidence', 'proof-routing.yml')),
    schemas: await loadSchemas(root),
    profiles,
    foundations, semantics, patterns, policies
  };
}
