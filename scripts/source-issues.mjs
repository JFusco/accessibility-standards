import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const { mode, documents } = JSON.parse(await readFile(process.argv[2], 'utf8'));
const repo = process.env.GITHUB_REPOSITORY;
const api = (args, payload) => execFileSync('gh', ['api', ...args, ...(payload ? ['--input', '-'] : [])], {
  input: payload && JSON.stringify(payload), encoding: 'utf8',
});
const pages = JSON.parse(api(['--paginate', '--slurp', `repos/${repo}/issues?state=all&per_page=100`]));
// This workflow creates tracking issues with the repository's GITHUB_TOKEN.
const issues = pages.flat().filter(issue => !issue.pull_request
  && issue.user?.type === 'Bot' && issue.user.login === 'github-actions[bot]');
const withoutScanLink = body => body.replace(/\n\[Scan evidence\]\([^)]+\)\.\n/, '\n');
for (const row of documents.filter(row => row.status !== 'current')) {
  const failure = row.status === 'unavailable';
  const key = createHash('sha256').update(JSON.stringify([row.url, failure ? 'retrieval' : row.sha256, failure ? [] : row.missing_anchors])).digest('hex');
  const marker = `<!-- official-source:${key} -->`;
  const previous = issues.find(issue => issue.body?.includes(marker));
  const title = `[Task] ${failure ? 'Restore source retrieval' : 'Review official accessibility source'} · ${row.url}`;
  const locators = Object.entries(row.locators).map(([fragment, ids]) => `- ${row.url}${fragment ? '#' + fragment : ''} — ${ids.join(', ')}`).join('\n');
  const body = `## Summary\n\n${row.status} observation for ${row.url}.\n\n## Context\n\nThe scan compares normalized document text with the last reviewed baseline.\n\n## Details\n\nReviewed digest: ${row.baseline ?? 'pending initial review'}\nObserved digest: ${row.sha256 ?? 'unavailable'}\nRetrieval error: ${row.error ?? 'none'}\nMissing anchors: ${row.missing_anchors?.join(', ') || 'none recorded'}\n\n${locators}\n\n## Expected Outcome\n\n**Acceptance Criteria**\n\n- Inspect the official locator and affected records.\n- Record a verified change or no-impact decision before advancing the baseline. For a retrieval failure, verify recovery first.\n\n## Additional Notes\n\n[Scan evidence](https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}).\n\n${marker}`;
  if (previous) {
    const issue = `repos/${repo}/issues/${previous.number}`;
    if (failure && previous.state === 'closed') {
      api(['--method', 'PATCH', issue], { state: 'open', body });
    } else if (previous.state === 'open' && (failure
      ? !previous.body.includes(`\nRetrieval error: ${row.error}\n`)
      : mode === 'full' && withoutScanLink(previous.body) !== withoutScanLink(body))) {
      api(['--method', 'PATCH', issue], { body });
    }
    continue;
  }
  api(['--method','POST',`repos/${repo}/issues`], { title, body, labels: ['documentation'] });
}
