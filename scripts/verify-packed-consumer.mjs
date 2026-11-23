import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = process.cwd();
const require = createRequire(import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'accessibility-consumer-'));
const run = (cmd, argv, cwd) => execFileSync(cmd, argv, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    npm_config_cache: join(temp, 'npm-cache'),
    npm_config_offline: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
  },
});
try {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const packageId = `${pkg.name}@${pkg.version}`;
  const [{filename}] = JSON.parse(run('npm', ['pack','--json','--ignore-scripts','--pack-destination',temp], root));
  await writeFile(join(temp,'package.json'), '{"name":"unrelated-consumer","private":true}');
  run('npm',['install','--ignore-scripts',join(temp,filename)],temp);
  const cli = (...args) => run('node',[join(temp,'node_modules/accessibility-standards/bin/accessibility-standards.mjs'),...args],temp);
  const moduleOutput = source => run('node', ['--input-type=module', '-e', source], temp).trim();
  await writeFile(join(temp,'AGENTS.md'),'# Existing consumer instructions\n');
  cli('init');
  const first = await readFile(join(temp,'AGENTS.md'),'utf8');
  const start = '<!-- accessibility-standards:start -->';
  const end = '<!-- accessibility-standards:end -->';
  assert.equal(first.split(start).length, 2);
  assert.equal(first.split(end).length, 2);
  const startIndex = first.indexOf(start);
  const endIndex = first.indexOf(end);
  assert.ok(startIndex < endIndex);
  const guidance = first.slice(startIndex + start.length, endIndex);
  assert.ok(guidance.includes('accessibility-standards/index.json'));
  assert.ok(guidance.includes('accessibility-standards resolve pattern.dialog'));
  cli('init');
  assert.equal(await readFile(join(temp,'AGENTS.md'),'utf8'),first);
  assert.ok(first.startsWith('# Existing consumer instructions\n'));
  const contract = JSON.parse(cli('resolve','pattern.dialog'));
  assert.equal(contract.provenance.package,packageId);
  assert.equal(contract.dependencies.length,contract.record.requires.length);
  assert.ok(contract.dependencies.some(({id}) => id === 'semantics.focus.return'));
  assert.equal(JSON.parse(cli('index')).records.length,156);
  await writeFile(join(temp,'accessibility-standards.config.json'),JSON.stringify({package:packageId,profile:'standalone',routes:'routes.json',outputRoot:'generated'}));
  await writeFile(join(temp,'routes.json'),'{"version":1,"outputs":{}}');
  cli('sync');
  const coveragePath = join(temp, 'generated', 'coverage-manifest.json');
  const provenancePath = join(temp, 'generated', 'accessibility.source.json');
  const [coverageBytes, provenanceBytes] = await Promise.all([readFile(coveragePath), readFile(provenancePath)]);
  const coverage = JSON.parse(moduleOutput(`
    import coverage from 'accessibility-standards/coverage' with { type: 'json' };
    console.log(JSON.stringify(coverage));
  `));
  assert.deepEqual(JSON.parse(coverageBytes), coverage);
  assert.equal(coverage.wcag_2_2.criteria.length, 55);
  assert.equal(coverage.aria_apg.patterns.length, 30);
  assert.equal(coverage.aria_apg.practices.length, 7);
  const provenance = JSON.parse(provenanceBytes);
  assert.equal(provenance.package, packageId);
  assert.equal(coverage._provenance.package, packageId);
  assert.match(provenance.digests.source, /^[a-f0-9]{64}$/);
  assert.equal(coverage._provenance.source_digest, provenance.digests.source);
  cli('sync');
  assert.deepEqual(await readFile(coveragePath), coverageBytes);
  assert.deepEqual(await readFile(provenancePath), provenanceBytes);
  assert.match(cli('sync', '--if-needed'), /\bchanged: false\b/);
  cli('check');
  assert.equal(moduleOutput("import {resolveContract} from 'accessibility-standards'; console.log((await resolveContract('pattern.dialog')).record.id)"), 'pattern.dialog');

  const uiPackage = join(temp, 'node_modules/ui-design-brain');
  await cp(dirname(require.resolve('ui-design-brain/package.json')), uiPackage, { recursive: true });
  const adapter = `
    import { resolveUiPatterns } from 'accessibility-standards/ui-design-brain';
    const result = await resolveUiPatterns({ 'component.ui_pattern_ids': ['select'] });
    console.log(JSON.stringify(result.candidate_evaluations.map(
      ({ pattern_id, resolution_state, missing_facts }) => ({ pattern_id, resolution_state, missing_facts })
    )));
  `;
  assert.deepEqual(JSON.parse(moduleOutput(adapter)), [
    { pattern_id: 'pattern.combobox', resolution_state: 'needs_input', missing_facts: ['component.selection_model'] },
    { pattern_id: 'pattern.listbox', resolution_state: 'needs_input', missing_facts: ['component.selection_model'] },
  ]);
  await writeFile(join(uiPackage, 'skills/ui-design-brain/catalog-manifest.json'), '{}');
  assert.throws(() => moduleOutput(adapter), error =>
    error.status === 1 && /Expected the pinned ui-design-brain@.* catalog and digest/.test(error.stderr));
  console.log('PASS clean offline npm installation, managed init, indexed lookup, coverage and provenance, sync and check, pinned adapter and mismatch rejection');
} finally { await rm(temp,{recursive:true,force:true}); }
