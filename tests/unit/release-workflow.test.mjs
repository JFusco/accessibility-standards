import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workflow = new URL('../../.github/workflows/release.yml', import.meta.url);
const releaseConfig = new URL('../../.releaserc.cjs', import.meta.url);
const packageFile = new URL('../../package.json', import.meta.url);
const packedConsumerVerifier = new URL('../../scripts/verify-packed-consumer.mjs', import.meta.url);
const root = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(import.meta.url);
const { releasePayload } = require('../../scripts/notify-pin-courier.cjs');
const scannerAuthor = { type: 'Bot', login: 'github-actions[bot]' };

async function ghFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'a11y-gh-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const log = join(directory, 'writes.jsonl');
  const env = {
    PATH: directory + delimiter + process.env.PATH,
    GITHUB_REPOSITORY: 'JFusco/accessibility-standards',
    GH_FIXTURE_LOG: log,
  };
  await writeFile(join(directory, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--paginate')) {
  process.stdout.write(process.env.GH_FIXTURE_ISSUES);
} else {
  const body = JSON.parse(fs.readFileSync(0, 'utf8'));
  fs.appendFileSync(process.env.GH_FIXTURE_LOG, JSON.stringify({ args, body }) + '\\n');
}
`, { mode: 0o700 });
  return {
    directory,
    env,
    async writes() {
      const lines = (await readFile(log, 'utf8')).trim();
      return lines ? lines.split('\n').map(line => JSON.parse(line)) : [];
    },
    reset: () => writeFile(log, ''),
  };
}

async function reconcile(t) {
  const fixture = await ghFixture(t);
  const scan = join(fixture.directory, 'scan.json');
  return async (mode, row, issues = [], runId = '1') => {
    await fixture.reset();
    await writeFile(scan, JSON.stringify({ mode, documents: [row] }));
    execFileSync(process.execPath, ['scripts/source-issues.mjs', scan], {
      cwd: root,
      env: { ...fixture.env, GH_FIXTURE_ISSUES: JSON.stringify([issues]), GITHUB_RUN_ID: runId },
    });
    return fixture.writes();
  };
}

test('release uses tokenless trusted publishing after complete package verification', async () => {
  const source = await readFile(workflow, 'utf8');
  assert.match(source, /id-token: write/);
  assert.match(source, /pnpm run verify:ci/);
  assert.match(source, /verify-packed-consumer\.mjs/);
  assert.match(source, /npm pack --dry-run --ignore-scripts/);
  assert.match(source, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(source, /NPM_TOKEN|NODE_AUTH_TOKEN|registry-url/);
});

test('release metadata matches the public GitHub repository and version policy', async () => {
  const config = await readFile(releaseConfig, 'utf8');
  const pkg = JSON.parse(await readFile(packageFile, 'utf8'));
  assert.match(pkg.scripts['verify:ci'], /^pnpm release:preflight && /);
  assert.equal(pkg.repository.url, 'git+https://github.com/JFusco/accessibility-standards.git');
  assert.deepEqual(pkg.publishConfig, { access: 'public', provenance: true });
  assert.match(config, /\{ breaking: true, release: 'major' \}/);
  assert.match(config, /\{ type: 'feat', release: 'minor' \}/);
  assert.match(config, /assets: \['CHANGELOG\.md', 'package\.json'/);
});

test('a recurring retrieval failure reopens its review issue once', async t => {
  const scan = await reconcile(t);
  const url = 'https://www.w3.org/TR/WCAG22/';
  const row = { url, status: 'unavailable', error: 'Timeout', locators: { '': ['semantics.keyboard'] } };
  const [{ body: initial }] = await scan('index', row);
  const issue = { number: 42, state: 'closed', user: scannerAuthor, body: initial.body };
  const [reopened, ...otherWrites] = await scan('index', row, [issue], '2');
  assert.deepEqual(otherWrites, []);
  assert.deepEqual(reopened.args, ['api', '--method', 'PATCH', 'repos/JFusco/accessibility-standards/issues/42', '--input', '-']);
  assert.equal(reopened.body.state, 'open');
  assert.match(reopened.body.body, /Retrieval error: Timeout/);
  assert.deepEqual(await scan('index', row, [{ ...issue, state: 'open', body: reopened.body.body }], '3'), []);
});

test('detailed scans enrich existing source issues and retain that detail on subsequent scans', async t => {
  const scan = await reconcile(t);
  const url = 'https://www.w3.org/TR/WCAG22/';
  const row = { url, status: 'changed', sha256: 'new-digest', baseline: 'old-digest', missing_anchors: [], locators: { '': ['semantics.keyboard'] } };
  const [{ body: initial }] = await scan('index', row);
  const issue = { number: 42, state: 'open', user: scannerAuthor, body: initial.body };
  const detailed = { ...row, locators: { ...row.locators, keyboard: ['semantics.keyboard'] } };
  const contributorIssue = { ...issue, number: 19, user: { type: 'User', login: 'contributor' } };
  const [created, ...extra] = await scan('full', detailed, [contributorIssue], '2');
  assert.deepEqual(extra, []);
  assert.deepEqual(created.args, ['api', '--method', 'POST', 'repos/JFusco/accessibility-standards/issues', '--input', '-']);
  const [update, ...otherWrites] = await scan('full', detailed, [contributorIssue, issue], '2');
  assert.deepEqual(otherWrites, []);
  assert.deepEqual(update.args, ['api', '--method', 'PATCH', 'repos/JFusco/accessibility-standards/issues/42', '--input', '-']);
  assert.ok(update.body.body.includes(`${url}#keyboard — semantics.keyboard`));
  const updated = { ...issue, body: update.body.body };
  assert.deepEqual(await scan('full', detailed, [updated], '3'), []);
  assert.deepEqual(await scan('index', row, [updated], '4'), []);
});

test('notification failure directs recovery through the release notifier', async t => {
  const fixture = await ghFixture(t);
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const summary = spawnSync(process.execPath, ['scripts/release-notification-summary.cjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...fixture.env, GITHUB_STEP_SUMMARY: join(fixture.directory, 'summary.md') },
  });
  assert.equal(summary.status, 1);
  assert.match(summary.stderr, new RegExp(`published revision ${revision}`));
  assert.match(summary.stderr, /GITHUB_REPOSITORY=JFusco\/accessibility-standards node scripts\/notify-pin-courier\.cjs/);
  assert.doesNotMatch(summary.stderr, /event_type=package-released/);

  execFileSync(process.execPath, ['scripts/notify-pin-courier.cjs'], { cwd: root, env: fixture.env });
  const { name, version } = JSON.parse(await readFile(packageFile, 'utf8'));
  assert.deepEqual(await fixture.writes(), [{
    args: ['api', '--method', 'POST', 'repos/JFusco/renovate-config/dispatches', '--input', '-'],
    body: releasePayload({ publisher: fixture.env.GITHUB_REPOSITORY, name, version, revision }),
  }]);
});
