import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageRoot } from './load.mjs';

export async function resolveContract(id) {
  if (typeof id !== 'string' || !/^(foundation|semantics|pattern|policy|applicability)\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)) {
    throw new Error(`Invalid accessibility contract ID: ${id}`);
  }
  const read = async key => JSON.parse(await readFile(join(packageRoot, 'dist', 'contracts', `${key}.json`), 'utf8'));
  let selected;
  try { selected = await read(id); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Unknown accessibility contract: ${id}`);
    throw error;
  }
  const dependencies = [];
  for (const key of selected.record.requires ?? []) dependencies.push((await read(key)).record);
  return { ...selected, dependencies };
}

const start = '<!-- accessibility-standards:start -->';
const end = '<!-- accessibility-standards:end -->';
const guidance = [
  start, '## Accessibility contracts', '',
  'Use the installed accessibility-standards package when designing, implementing, or reviewing a rendered interface.',
  'Run the local `accessibility-standards index` command to find an ID. Run `accessibility-standards resolve pattern.dialog` (substitute the relevant ID) to read its requirements, semantic dependencies, and evidence routes.',
  'Use the project package runner, e.g. `pnpm exec` or `npm exec --offline --`. Tools can import `accessibility-standards/index.json` or `resolveContract` from `accessibility-standards`.',
  end,
].join('\n');

export async function initConsumer(directory = process.cwd()) {
  const path = join(directory, 'AGENTS.md');
  const file = await open(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o644);
  try {
    if (!(await file.stat()).isFile()) throw new Error('AGENTS.md must be a regular file');
    const original = await file.readFile('utf8');
    const before = original.indexOf(start);
    const after = original.indexOf(end);
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    const block = guidance.replaceAll('\n', newline);
    let next;
    if (before < 0 && after < 0) {
      const separator = !original || original.endsWith(newline + newline) ? '' : original.endsWith(newline) ? newline : newline + newline;
      next = original + separator + block + newline;
    } else {
      if (before < 0 || after < before || original.lastIndexOf(start) !== before || original.lastIndexOf(end) !== after) throw new Error('Ambiguous accessibility-standards markers in AGENTS.md');
      next = original.slice(0, before) + block + original.slice(after + end.length);
    }
    if (next === original) return false;
    const bytes = Buffer.from(next);
    let offset = 0;
    while (offset < bytes.length) offset += (await file.write(bytes, offset, bytes.length - offset, offset)).bytesWritten;
    await file.truncate(bytes.length);
    return true;
  } finally { await file.close(); }
}
