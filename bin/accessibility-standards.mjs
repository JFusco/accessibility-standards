#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildDistribution } from '../lib/build.mjs';
import { initConsumer, resolveContract } from '../lib/consumer.mjs';
import { loadStandards, packageRoot } from '../lib/load.mjs';
import { projection } from '../lib/sync.mjs';
import { validateStandards } from '../lib/validate.mjs';

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'init') console.log(await initConsumer() ? 'Updated AGENTS.md' : 'AGENTS.md is current');
  else if (command === 'index') process.stdout.write(await readFile(join(packageRoot, 'dist/index.json')));
  else if (command === 'resolve') console.log(JSON.stringify(await resolveContract(args[0]), null, 2));
  else if (command === 'build') console.log(await buildDistribution());
  else if (command === 'validate') console.log(validateStandards(await loadStandards()));
  else if (command === 'sync' || command === 'check') {
    const flag = args.indexOf('--config');
    const configPath = flag === -1 ? 'accessibility-standards.config.json' : args[flag + 1];
    if (!configPath) throw new Error('--config requires a filename');
    console.log(await projection({ configPath, check: command === 'check', ifNeeded: args.includes('--if-needed') }));
  } else throw new Error('Usage: accessibility-standards <init|index|resolve ID|sync|check|build|validate>');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
