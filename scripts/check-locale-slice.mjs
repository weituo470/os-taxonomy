#!/usr/bin/env node
/**
 * Check one translation slice before it is merged into a locale file.
 *
 *   node scripts/check-locale-slice.mjs topics source.json translated.json
 *
 * kind is topics, dependencies or clusters. Both files are JSON arrays in
 * English source order. This does not stamp the catalog.
 */

import { readFileSync } from 'node:fs';
import { checkTranslationSlice } from './locale-overlay.mjs';

const [kind, sourcePath, translatedPath] = process.argv.slice(2);
if (!kind || !sourcePath || !translatedPath) {
  console.error('Usage: node scripts/check-locale-slice.mjs <topics|dependencies|clusters> <source.json> <translated.json>');
  process.exit(1);
}

const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const translated = JSON.parse(readFileSync(translatedPath, 'utf8'));
const errors = checkTranslationSlice(kind, source, translated);
if (errors.length) {
  console.error(`✗ ${errors.length} slice problem(s):`);
  for (const error of errors.slice(0, 40)) console.error(`  - ${error}`);
  if (errors.length > 40) console.error(`  - …and ${errors.length - 40} more`);
  process.exit(1);
}
console.log(`✓ ${kind} slice: ${translated.length} records`);
