import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildProjectionManifest } from '../../lib/build-manifest.mjs';
import { buildDistribution } from '../../lib/build.mjs';
import { digest } from '../../lib/digest.mjs';
import { loadStandards, packageRoot } from '../../lib/load.mjs';
import { buildArtifacts } from '../../lib/render.mjs';

async function schemaValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const root = join(packageRoot, 'schemas');
  for (const name of (await readdir(root)).filter((entry) => entry.endsWith('.schema.json')).sort()) {
    ajv.addSchema(JSON.parse(await readFile(join(root, name), 'utf8')));
  }
  return ajv;
}

function assertValid(ajv, schema, value, label) {
  const validate = ajv.getSchema(schema);
  assert.ok(validate, `missing compiled schema ${schema}`);
  assert.equal(validate(value), true, `${label}: ${ajv.errorsText(validate.errors)}`);
}

function assertInvalid(ajv, schema, value, label) {
  const validate = ajv.getSchema(schema);
  assert.ok(validate, `missing compiled schema ${schema}`);
  assert.equal(validate(value), false, `${label} unexpectedly passed ${schema}`);
}

test('every source and consumer contract validates against its published JSON schema', async () => {
  const ajv = await schemaValidator();
  const data = await loadStandards();
  assertValid(ajv, 'contract.schema.json', data.contract, 'contract');
  for (const semantic of data.semantics) assertValid(ajv, 'semantic.schema.json', semantic, semantic.id);
  for (const pattern of data.patterns) assertValid(ajv, 'pattern.schema.json', pattern, pattern.id);
  const emptySemantic = structuredClone(data.semantics[0]);
  emptySemantic.requirement = '   ';
  assertInvalid(ajv, 'semantic.schema.json', emptySemantic, 'blank semantic requirement');
  const extraSemantic = structuredClone(data.semantics[0]);
  extraSemantic.unexpected = true;
  assertInvalid(ajv, 'semantic.schema.json', extraSemantic, 'semantic extra field');
  const malformedPattern = structuredClone(data.patterns[0]);
  malformedPattern.scope = 42;
  malformedPattern.activation = {};
  assertInvalid(ajv, 'pattern.schema.json', malformedPattern, 'malformed pattern fields');
  const inventedCriterion = structuredClone(data.semantics[0]);
  inventedCriterion.standards_refs[0] = {
    authority: 'wcag-2.2', identifier: '9.9.9', url: 'https://www.w3.org/TR/WCAG22/#invented', normative: true, level: 'A'
  };
  assertInvalid(ajv, 'semantic.schema.json', inventedCriterion, 'invented WCAG criterion');
  assertValid(ajv, 'wcag-coverage.schema.json', data.wcagCoverage, 'WCAG coverage');
  assertValid(ajv, 'apg-coverage.schema.json', data.apgCoverage, 'WAI-ARIA APG coverage');
  const incompleteApgCoverage = structuredClone(data.apgCoverage);
  incompleteApgCoverage.patterns.pop();
  assertInvalid(ajv, 'apg-coverage.schema.json', incompleteApgCoverage, 'incomplete APG pattern coverage');
  const wrongApgPatternId = structuredClone(data.apgCoverage);
  wrongApgPatternId.patterns[0].id = 'accordion-alternative';
  assertInvalid(ajv, 'apg-coverage.schema.json', wrongApgPatternId, 'wrong canonical APG pattern ID');
  const reorderedApgPatterns = structuredClone(data.apgCoverage);
  [reorderedApgPatterns.patterns[0], reorderedApgPatterns.patterns[1]] = [reorderedApgPatterns.patterns[1], reorderedApgPatterns.patterns[0]];
  assertInvalid(ajv, 'apg-coverage.schema.json', reorderedApgPatterns, 'reordered APG patterns');
  const invalidApgCoverageModel = structuredClone(data.apgCoverage);
  invalidApgCoverageModel.patterns[0].coverage = 'deferred';
  assertInvalid(ajv, 'apg-coverage.schema.json', invalidApgCoverageModel, 'invalid APG coverage model');
  const wrongApgCoverageClass = structuredClone(data.apgCoverage);
  wrongApgCoverageClass.patterns[0].coverage = 'baseline-semantics';
  assertInvalid(ajv, 'apg-coverage.schema.json', wrongApgCoverageClass, 'wrong canonical APG coverage class');
  const wrongApgPracticeId = structuredClone(data.apgCoverage);
  wrongApgPracticeId.practices[0].id = 'landmark-navigation';
  assertInvalid(ajv, 'apg-coverage.schema.json', wrongApgPracticeId, 'wrong canonical APG practice ID');
  const reorderedApgPractices = structuredClone(data.apgCoverage);
  [reorderedApgPractices.practices[0], reorderedApgPractices.practices[1]] = [reorderedApgPractices.practices[1], reorderedApgPractices.practices[0]];
  assertInvalid(ajv, 'apg-coverage.schema.json', reorderedApgPractices, 'reordered APG practices');

  const futureDeferredPattern = structuredClone(data.wcagCoverage);
  futureDeferredPattern.deferred_patterns.push({ id: 'future-pattern', reason: 'Added by a future APG release.' });
  assertValid(ajv, 'wcag-coverage.schema.json', futureDeferredPattern, 'unknown future APG deferral');
  for (const id of ['breadcrumb', 'button', 'table']) {
    const currentDeferredPattern = structuredClone(data.wcagCoverage);
    currentDeferredPattern.deferred_patterns.push({ id, reason: 'Already covered by schema 4.' });
    assertInvalid(ajv, 'wcag-coverage.schema.json', currentDeferredPattern, `current canonical APG deferral ${id}`);
  }

  const ariaInHtmlReference = {
    authority: 'aria-in-html',
    identifier: 'author-conformance',
    url: 'https://www.w3.org/TR/html-aria/',
    normative: true,
  };
  assertValid(ajv, 'standards-reference.schema.json', ariaInHtmlReference, 'ARIA in HTML author-conformance reference');
  const wrongAriaInHtmlIdentifier = { ...ariaInHtmlReference, identifier: 'roles' };
  assertInvalid(ajv, 'standards-reference.schema.json', wrongAriaInHtmlIdentifier, 'wrong ARIA in HTML identifier');
  const wrongAriaInHtmlUrl = { ...ariaInHtmlReference, url: 'https://www.w3.org/TR/html-aria/#docconformance' };
  assertInvalid(ajv, 'standards-reference.schema.json', wrongAriaInHtmlUrl, 'noncanonical ARIA in HTML URL');
  const leveledAriaInHtmlReference = { ...ariaInHtmlReference, level: 'A' };
  assertInvalid(ajv, 'standards-reference.schema.json', leveledAriaInHtmlReference, 'ARIA in HTML reference with WCAG level');

  const htmlInertReference = {
    authority: 'html',
    identifier: 'inert',
    url: 'https://html.spec.whatwg.org/multipage/interaction.html#the-inert-attribute',
    normative: true,
  };
  assertValid(ajv, 'standards-reference.schema.json', htmlInertReference, 'HTML inert reference');
  assertInvalid(ajv, 'standards-reference.schema.json', { ...htmlInertReference, identifier: 'hidden' }, 'wrong HTML identifier');
  assertInvalid(ajv, 'standards-reference.schema.json', { ...htmlInertReference, url: 'https://html.spec.whatwg.org/multipage/interaction.html#inert' }, 'noncanonical HTML inert URL');
  assertInvalid(ajv, 'standards-reference.schema.json', { ...htmlInertReference, level: 'A' }, 'HTML inert reference with WCAG level');
  assertInvalid(ajv, 'standards-reference.schema.json', { ...htmlInertReference, normative: false }, 'nonnormative HTML inert reference');

  const waiAriaReferences = [...new Map(
    [...data.foundations, ...data.semantics, ...data.patterns, ...data.policies]
      .flatMap(({ standards_refs = [] }) => standards_refs)
      .filter(({ authority }) => authority === 'wai-aria-1.2')
      .map((reference) => [`${reference.identifier}\u0000${reference.url}`, reference]),
  ).values()].sort((left, right) => left.identifier.localeCompare(right.identifier));
  assert.equal(waiAriaReferences.length, 34, 'the source must use exactly the 34 pinned WAI-ARIA 1.2 identifier/URL pairs');
  for (const reference of waiAriaReferences) {
    assert.equal(reference.url, `https://www.w3.org/TR/wai-aria-1.2/#${reference.identifier}`);
    assertValid(ajv, 'standards-reference.schema.json', reference, `WAI-ARIA 1.2 ${reference.identifier} reference`);
  }

  const busyReference = waiAriaReferences.find(({ identifier }) => identifier === 'aria-busy');
  const busySemantic = data.semantics.find(({ id }) => id === 'semantics.busy-state');
  const assertInvalidWaiAriaReference = (reference, label) => {
    assertInvalid(ajv, 'standards-reference.schema.json', reference, label);
    const semantic = structuredClone(busySemantic);
    semantic.standards_refs[semantic.standards_refs.findIndex(({ authority }) => authority === 'wai-aria-1.2')] = reference;
    assertInvalid(ajv, 'semantic.schema.json', semantic, `${label} in source semantic`);
  };
  assertInvalidWaiAriaReference({
    ...busyReference,
    identifier: 'aria-invented',
    url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-invented',
  }, 'invented WAI-ARIA 1.2 identifier');
  assertInvalidWaiAriaReference({
    ...busyReference,
    url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-hidden',
  }, 'mismatched WAI-ARIA 1.2 identifier and URL');
  assertInvalidWaiAriaReference({ ...busyReference, level: 'A' }, 'WAI-ARIA 1.2 reference with WCAG level');
  assertValid(ajv, 'applicability-matrix.schema.json', data.matrix, 'applicability matrix');
  assertValid(ajv, 'ui-design-brain-bindings.schema.json', data.uiDesignBrainBindings, 'UI Design Brain bindings');
  const renamedUiSlug = structuredClone(data.uiDesignBrainBindings);
  renamedUiSlug.bindings[0].ui_pattern_id = 'accordion-renamed';
  assert.deepEqual(renamedUiSlug.source, data.uiDesignBrainBindings.source, 'renamed-slug schema negative must retain pinned provenance');
  assertInvalid(ajv, 'ui-design-brain-bindings.schema.json', renamedUiSlug, 'renamed canonical UI Design Brain slug');
  const reorderedUiSlugs = structuredClone(data.uiDesignBrainBindings);
  [reorderedUiSlugs.bindings[0], reorderedUiSlugs.bindings[1]] = [reorderedUiSlugs.bindings[1], reorderedUiSlugs.bindings[0]];
  assert.deepEqual(reorderedUiSlugs.source, data.uiDesignBrainBindings.source, 'reordered-slug schema negative must retain pinned provenance');
  assertInvalid(ajv, 'ui-design-brain-bindings.schema.json', reorderedUiSlugs, 'reordered canonical UI Design Brain slugs');
  for (const profile of Object.values(data.profiles)) assertValid(ajv, 'profile.schema.json', profile, profile.name);

  const config = { package: `accessibility-standards@${data.package.version}`, profile: 'standalone', routes: 'routes.json' };
  assertValid(ajv, 'consumer-config.schema.json', config, 'consumer');
  const artifacts = buildArtifacts(data, config.profile);
  const manifest = buildProjectionManifest({ data, profile: config.profile, config, routes: {}, artifacts });
  manifest.output_paths = Object.fromEntries([...artifacts.keys(), 'source'].map(key => [key, key]));
  manifest.manifest_digest = digest(manifest);
  assertValid(ajv, 'projection-manifest.schema.json', manifest, 'consumer projection');
  delete manifest.output_digests.coverageManifest;
  assertInvalid(ajv, 'projection-manifest.schema.json', manifest, 'missing output');
});
