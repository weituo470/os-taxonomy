#!/usr/bin/env node
/**
 * Print one topic with a locale overlay applied. English IDs, standards and
 * graph fields stay in place. See docs/i18n.md for the consumer contract.
 *
 *   node scripts/localize.mjs zh-CN mt_N8CpN1EJrP
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTopicFromDisk } from './locale-overlay.mjs';

const [localeId, topicId] = process.argv.slice(2);
if (!localeId || !topicId) {
  console.error('Usage: node scripts/localize.mjs <locale> <topicId>');
  process.exit(1);
}

try {
  const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  console.log(JSON.stringify(applyTopicFromDisk(dataDir, localeId, topicId), null, 2));
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
