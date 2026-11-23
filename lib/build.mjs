import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canonicalize } from './digest.mjs';
import { loadStandards, packageRoot } from './load.mjs';
import { projectionProvenance } from './provenance.mjs';
import { buildArtifacts, defaultPath } from './render.mjs';
import { validateStandards } from './validate.mjs';

export async function buildDistribution(root = packageRoot) {
  const data = await loadStandards(root);
  validateStandards(data);
  const dist = join(root, 'dist');
  const provenance = projectionProvenance(data, 'standalone');
  async function write(path, content) {
    const target = join(dist, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const json = value => JSON.stringify(canonicalize(value), null, 2) + '\n';
  const records = [...data.foundations, ...data.semantics, ...data.patterns, ...data.policies, ...data.matrix.rows]
    .sort((a, b) => a.id.localeCompare(b.id));
  const index = [];
  for (const record of records) {
    const path = `contracts/${record.id}.json`;
    await write(path, json({ provenance, record }));
    index.push({ id: record.id, title: record.title ?? record.id, path });
  }
  for (const [key, content] of buildArtifacts(data, 'standalone')) {
    await write(defaultPath(key, 'standalone'), content);
  }
  await write('index.json', json({ provenance, records: index }));
  return { records: index.length };
}
