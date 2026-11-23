import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), 'accessibility-consumer-'));
const run = (cmd, argv, cwd) => execFileSync(cmd, argv, { cwd, encoding: 'utf8', env: { ...process.env, npm_config_cache: join(temp, 'npm-cache'), npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' } });
try {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const packageId = `${pkg.name}@${pkg.version}`;
  const [{filename}] = JSON.parse(run('npm', ['pack','--json','--ignore-scripts','--pack-destination',temp], root));
  await writeFile(join(temp,'package.json'), '{"name":"unrelated-consumer","private":true}');
  run('npm',['install','--ignore-scripts',join(temp,filename)],temp);
  const cli = (...args) => run('node',[join(temp,'node_modules/accessibility-standards/bin/accessibility-standards.mjs'),...args],temp);
  await writeFile(join(temp,'AGENTS.md'),'# Existing consumer instructions\n');
  cli('init');
  const first = await readFile(join(temp,'AGENTS.md'),'utf8');
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
  cli('sync'); cli('check');
  assert.equal(run('node',['--input-type=module','-e',"import {resolveContract} from 'accessibility-standards'; console.log((await resolveContract('pattern.dialog')).record.id)"],temp).trim(),'pattern.dialog');
  console.log('PASS clean offline npm installation, init twice, indexed lookup, JS export, sync and check');
} finally { await rm(temp,{recursive:true,force:true}); }
