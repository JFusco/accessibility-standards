import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const releaseConfig = require('../../.releaserc.cjs');
const { analyzeCommits } = require('../../scripts/semantic-release-analyzer.cjs');

const logger = { log() {} };
const analyzer = releaseConfig.plugins.find(
  entry => Array.isArray(entry) && entry[0].endsWith('semantic-release-analyzer.cjs'),
);


test('analyzes a conventional breaking header as a major release', async () => {
  assert.ok(analyzer, 'commit analyzer configuration is present');
  const [, options] = analyzer;
  const releaseType = await analyzeCommits(options, {
    commits: [{ message: 'feat(standards)!: revise authority contract' }],
    logger,
  });

  assert.equal(releaseType, 'major');
});

test('tooling commits do not publish the package', async () => {
  const [, options] = analyzer;
  const releaseType = await analyzeCommits(options, {
    commits: [{ message: 'chore(deps): [skip release] update dependencies' }],
    logger,
  });
  assert.equal(releaseType, null);
});
