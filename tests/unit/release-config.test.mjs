import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('wiki maintenance PR titles suppress a release when used as squash commit messages', async () => {
  const [, options] = analyzer;
  for (const [name, count] of [['wiki-sync', 2], ['wiki-issue-sync', 1]]) {
    const workflow = await readFile(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
    const titles = [...workflow.matchAll(/\btitle=(['"])(docs\(wiki\): [^\n]+?)\1/g)];
    assert.equal(titles.length, count);
    for (const [, , title] of titles) {
      const message = title.replace('$PR_NUMBER', '42');
      assert.equal(await analyzeCommits(options, { commits: [{ message }], logger }), null, message);
    }
  }
});
