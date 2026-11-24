#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  readReleaseCommits,
  validateReleaseCommit,
  validateReleaseCommits,
} = require('./check-release-commit.cjs');

// A linked-worktree hook exports Git's repository context to its children.
// The fixture and the reads under test must resolve their repository from cwd.
const localGitVariables = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' });
for (const name of localGitVariables.trim().split(/\s+/u)) delete process.env[name];

assert.deepEqual(validateReleaseCommit({ subject: 'feat(catalog): add official field types', body: '' }), []);
assert.deepEqual(validateReleaseCommit({ subject: 'feat(schema)!: revise field identity', body: '' }), []);
assert.match(
  validateReleaseCommit({
    subject: 'ci: refresh release workflow',
    body: 'Combined changes\n\nBREAKING CHANGE: stale text from an earlier PR',
  })[0],
  /must not carry a BREAKING CHANGE body/,
);
assert.match(
  validateReleaseCommit({ subject: 'feat(schema) !: malformed', body: '' })[0],
  /conventional type/,
);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'accessibility-standards-release-preflight-'));
try {
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 'release@example.com');
  git('config', 'user.name', 'Release Fixture');
  git('commit', '--allow-empty', '-q', '-m', 'chore(release): published baseline');
  git('tag', 'v1.0.0');
  git('commit', '--allow-empty', '-q', '-m', 'feat(catalog): aggregated change', '-m', 'BREAKING CHANGE: stale footer');
  git('commit', '--allow-empty', '-q', '-m', 'fix(catalog): clean head');
  const releaseRange = readReleaseCommits(root);
  assert.equal(releaseRange.lastTag, 'v1.0.0');
  assert.equal(releaseRange.commits.length, 2);
  assert.match(validateReleaseCommits(releaseRange.commits)[0], /feat\(catalog\): aggregated change/);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

process.stdout.write('PASS release commit preflight self-tests.\n');
