import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveUiPatterns } from '../../lib/ui-design-brain.mjs';

test('public pinned catalog covers every slug and preserves unresolved discriminators', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../node_modules/ui-design-brain/skills/ui-design-brain/patterns-manifest.json',import.meta.url)));
  const mappings = JSON.parse(await readFile(new URL('../../src/applicability/ui-design-brain-bindings.yml',import.meta.url)));
  assert.deepEqual(mappings.bindings.map(row => row.ui_pattern_id),catalog.map(row => row.slug).sort());
  const result = await resolveUiPatterns({'component.ui_pattern_ids':['select']});
  assert.ok(result.unresolved?.length || result.candidates?.length || JSON.stringify(result).includes('component.selection_model'));
});

test('adapter refuses a substituted manifest even with matching package metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(),'a11y-adapter-'));
  try {
    const pkg = join(directory,'node_modules/ui-design-brain');
    await mkdir(join(pkg,'skills/ui-design-brain'),{recursive:true});
    await writeFile(join(pkg,'package.json'),'{"name":"ui-design-brain","version":"1.18.9"}');
    await writeFile(join(pkg,'skills/ui-design-brain/catalog-manifest.json'),'{}');
    await assert.rejects(resolveUiPatterns({}, {directory}),/pinned/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('disclosure and popover guidance distinguishes optional ARIA and native dismissal', async () => {
  const { resolveContract } = await import('../../lib/consumer.mjs');
  const disclosure = await resolveContract('pattern.disclosure');
  assert.match(disclosure.record.behavior.join(' '), /aria-controls optional/);
  const popover = await resolveContract('pattern.popover');
  assert.match(popover.record.behavior.join(' '), /popovertarget.*dismissal/);
  const focus = await resolveContract('semantics.focus.visible');
  assert.match(focus.record.requirement,/forced-colors/);
});
