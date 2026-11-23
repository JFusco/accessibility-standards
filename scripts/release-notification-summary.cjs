'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const { name, version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const registry = process.env.REGISTRY_OUTCOME === 'success' ? process.env.REGISTRY_STATUS : 'error';
const accepted = process.env.NOTIFY_OUTCOME === 'success' && process.env.TOKEN_OUTCOME === 'success';
fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  `Published ${name}@${version}\n\nRevision: ${revision}\n\nRegistry: ${registry || 'error'}\n\nNotification: ${accepted ? 'accepted' : 'failed'}\n`);
if (registry !== 'ready') console.log('::warning::Registry availability is delayed or unknown. Scheduled scans provide fallback.');
if (!accepted) {
  console.error(`::error::Publication succeeded but notification failed. Reconcile publication and check out the published revision ${revision}. With an authorized dispatch token in GH_TOKEN, run GITHUB_REPOSITORY=JFusco/accessibility-standards node scripts/notify-pin-courier.cjs. Scheduled scans provide fallback.`);
  process.exitCode = 1;
}
