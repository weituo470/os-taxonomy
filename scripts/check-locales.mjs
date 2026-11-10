#!/usr/bin/env node
/**
 * Check locale overlays, or refresh catalog file hashes after an edit.
 *
 *   node scripts/check-locales.mjs
 *   node scripts/check-locales.mjs --stamp-files
 *
 * --stamp-files rewrites data/locales/catalog.json byte lengths and SHA-256
 * values from the locale files on disk. It does not change source projection
 * hashes. A projection hash changes only when the translated file is rebuilt
 * against the current English text.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkLocalesFromDisk,
  clusterProjection,
  dependencyProjection,
  labelProjection,
  projectionSha256,
  stampCatalog,
  topicProjection,
} from './locale-overlay.mjs';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const catalogPath = resolve(dataDir, 'locales', 'catalog.json');
const read = (name) => JSON.parse(readFileSync(resolve(dataDir, name), 'utf8'));

if (process.argv.includes('--print-projections')) {
  const topics = read('topics.json');
  console.log(JSON.stringify({
    topics: projectionSha256(topicProjection(topics)),
    dependencies: projectionSha256(dependencyProjection(read('dependencies.json'))),
    clusters: projectionSha256(clusterProjection(read('clusters.json'))),
    labels: projectionSha256(labelProjection(topics)),
  }, null, 2));
  process.exit(0);
}

if (!existsSync(catalogPath)) {
  console.error('✗ locale catalog missing at data/locales/catalog.json');
  process.exit(1);
}

if (process.argv.includes('--stamp-files')) stampCatalog(dataDir);

const errors = checkLocalesFromDisk(dataDir);
if (errors.length) {
  console.error(`✗ ${errors.length} locale problem(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('✓ locale overlays match the English source text, IDs and catalog hashes.');
