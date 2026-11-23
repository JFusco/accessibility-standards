import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { digest } from './digest.mjs';
import { packageRoot, readJsonYaml } from './load.mjs';
import { resolveUiPatternBindings } from './compile-applicability.mjs';

export async function resolveUiPatterns(values, { directory = process.cwd() } = {}) {
  const binding = await readJsonYaml(join(packageRoot, 'src/applicability/ui-design-brain-bindings.yml'));
  const { source } = binding;
  const require = createRequire(join(resolve(directory), 'package.json'));
  const pkgPath = require.resolve('ui-design-brain/package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  const raw = await readFile(join(dirname(pkgPath), source.manifest_path), 'utf8');
  if (pkg.name !== source.package || pkg.version !== source.package_version || digest(raw) !== source.manifest_file_sha256) {
    throw new Error(`Expected the pinned ${source.package}@${source.package_version} catalog and digest`);
  }
  const manifest = JSON.parse(raw);
  if (manifest.manifestDigest !== source.manifest_digest || manifest.sourceDigest !== source.source_digest) throw new Error('UI catalog provenance mismatch');
  const facts = await readJsonYaml(join(packageRoot, 'src/applicability/facts.yml'));
  return resolveUiPatternBindings(binding, facts, values);
}
