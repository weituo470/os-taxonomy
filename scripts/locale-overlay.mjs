#!/usr/bin/env node
/**
 * Locale overlays for Marble-authored text.
 *
 * English files in data/ stay the canonical graph. A locale directory carries
 * translations of user-facing prose only, joined by existing IDs and cluster
 * keys. Curriculum-standard wording is not part of a locale. See docs/i18n.md.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSchema } from './check-schema.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCALE_CONTENT_FILES = ['topics.json', 'dependencies.json', 'clusters.json'];
export const LOCALE_FILES = [...LOCALE_CONTENT_FILES, 'messages.json'];
export const EXCLUDED_LOCALE_SOURCES = [
  'curriculum-standards.json',
  'teaching-research.json',
  'archived-teaching-research.json',
  'curriculum-alignments.json',
];
export const REQUIRED_LABELS = [
  'languageName',
  'sourceLanguageName',
  'switchLanguage',
  'draftNotice',
  'curriculumMap',
  'topics',
  'prerequisites',
  'evidence',
  'assessmentPrompt',
  'clusterSummary',
  'subject',
  'domain',
  'reason',
  'hardPrerequisite',
  'softPrerequisite',
  'ageRange',
];
const REVIEW_PAIRS = {
  'community-draft': 'needs-native-speaker-review',
  reviewed: 'native-speaker-reviewed',
};
const KEPT_TOKENS = [
  'ScratchJr', 'micro:bit', 'Bee-Bot', 'COVID-19', 'CRISPR', 'Scratch', 'LEGO',
  'mRNA', 'NGSS', 'CCSS', 'COVID', 'KS1', 'KS2', 'KS3', 'HTML', 'JSON', 'DNA',
  'RNA', 'PDF', 'URL', 'CSS', 'USB', 'GPS', 'HIV', 'BBC', 'LED', 'pH', 'AI',
  'UK', 'US', 'EU', 'IB',
];
const SYMBOLS = ['%', '°', '×', '÷', '²', '³', '√', 'π', '≤', '≥', '≈', '£', '$', '€'];
const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF]/;
const TRADITIONAL = new Set('國學語們說們這體東門車長書開關裡後發對時會與為從還經過應點線題讀寫義習歷曆無電馬魚鳥龍隻麼幹裏髮臺廣產業擊護報價質辦節達選運遠適醫錯鍵錄陽際雙雜難頁頂顏顯風飯館驗齒齡個漢萬億聽見貝頭問間現實當總樣種動兩兒條買賣雲網圖數計論話請謝誰邊來飛齊專廠壓變號嗎員週響團園圍圓聖場壞塊聲殼處備復夠夾奪奮獎奧婦媽孫寧寶寵審憲宮寬賓寢尋導壽將爾塵嘗堯屍盡層屬屢歲島嶺峽觀規視覽覺觸認訓議記講許設訪證評識詞譯試詩誠該詳誤課調談謠謙謹負財責賢敗貨貧購費資賞賽贊讚趙趕趨躍踐蹤軀軌轉輪軟輕載較輛輸辭辯遼遷邁連遲遜遞邏遺遙鄧郵鄰鄭醬釀釋針釘釣鐘鍾鋼錢鐵鈴鉛銅鋁銀鑄鎖鏈銷鍋鋒鋅銳錫錘錐錦鋸錳鎮鏡鐮鑰鑑閃聞隊陸階隨險隱雖雞離靈靜麵黨龜於係繫準醜幾鬥豐衝穀範餘徵製褲裡後發'.split(''));
const ERROR_CAP = 60;

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const projectionSha256 = (value) => sha256(JSON.stringify(value));

export function topicProjection(doc) {
  return doc.topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    description: topic.description,
    evidence: topic.evidence,
    assessmentPrompt: topic.assessmentPrompt,
  }));
}

export function dependencyProjection(doc) {
  return doc.dependencies.map((edge) => ({
    topicId: edge.topicId,
    prerequisiteId: edge.prerequisiteId,
    reason: edge.reason,
  }));
}

export function clusterProjection(doc) {
  return doc.clusters.map((cluster) => ({
    subject: cluster.subject,
    domain: cluster.domain,
    ageRangeStart: cluster.ageRangeStart,
    summary: cluster.summary,
  }));
}

export function labelProjection(topicsDoc) {
  const subjects = [];
  const domains = [];
  const seenSubjects = new Set();
  const seenDomains = new Set();
  for (const topic of topicsDoc.topics) {
    if (!seenSubjects.has(topic.subject)) {
      seenSubjects.add(topic.subject);
      subjects.push(topic.subject);
    }
    const key = `${topic.subject}\t${topic.domain}`;
    if (!seenDomains.has(key)) {
      seenDomains.add(key);
      domains.push({ subject: topic.subject, domain: topic.domain });
    }
  }
  return { subjects, domains };
}

export function loadLocaleSchemas() {
  const directory = resolve(ROOT, 'schema');
  const load = (name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
  return {
    topics: load('locale-topics.schema.json'),
    dependencies: load('locale-dependencies.schema.json'),
    clusters: load('locale-clusters.schema.json'),
    messages: load('locale-messages.schema.json'),
    catalog: load('locale-catalog.schema.json'),
  };
}

function numberTokens(text) {
  // Thousands commas are part of the numeral. A comma before a space or a
  // Chinese character is sentence punctuation and is not required in the translation.
  return text.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g) ?? [];
}

function missingTokens(needed, actual) {
  const counts = new Map();
  for (const token of actual) counts.set(token, (counts.get(token) ?? 0) + 1);
  const missing = [];
  for (const token of needed) {
    const left = counts.get(token) ?? 0;
    if (left === 0) missing.push(token);
    else counts.set(token, left - 1);
  }
  return missing;
}

function latinResidue(source) {
  let text = source.replaceAll('{{name}}', ' ');
  for (const token of KEPT_TOKENS) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'g'), ' ');
  }
  return (text.match(/[A-Za-z]/g) ?? []).length;
}

function expectText(source, translated, label, errors) {
  if (source === null) {
    if (translated !== null) errors.push(`${label}: expected null`);
    return;
  }
  if (typeof source !== 'string') {
    errors.push(`${label}: English source is not text`);
    return;
  }
  if (typeof translated !== 'string' || translated.length === 0) {
    errors.push(`${label}: expected a non-empty string`);
    return;
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(translated)) errors.push(`${label}: contains a control character`);
  const traditional = [...translated].find((character) => TRADITIONAL.has(character));
  if (traditional) errors.push(`${label}: traditional character ${traditional}`);
  const residue = latinResidue(source);
  if (residue >= 4) {
    if (translated === source) errors.push(`${label}: unchanged English`);
    if (!HAN.test(translated)) errors.push(`${label}: missing Simplified Chinese text`);
    if (source.length >= 24 && translated.includes(source)) errors.push(`${label}: contains the untranslated English source`);
  }
  const missing = missingTokens(numberTokens(source), numberTokens(translated));
  if (missing.length) errors.push(`${label}: missing numerals ${missing.join(', ')}`);
  for (const symbol of SYMBOLS) {
    if (source.includes(symbol) && !translated.includes(symbol)) errors.push(`${label}: missing symbol ${symbol}`);
  }
  const sourcePlaceholders = source.split('{{').length - 1;
  const translatedPlaceholders = translated.split('{{').length - 1;
  if (sourcePlaceholders !== translatedPlaceholders) {
    errors.push(`${label}: {{name}} count ${translatedPlaceholders} != ${sourcePlaceholders}`);
  } else if ((source.match(/\{\{name\}\}/g) ?? []).length !== (translated.match(/\{\{name\}\}/g) ?? []).length) {
    errors.push(`${label}: placeholder must stay {{name}}`);
  }
}

function checkPairwise(sourceRows, translatedRows, label, compare, errors) {
  if (translatedRows.length !== sourceRows.length) {
    errors.push(`${label}: record count ${translatedRows.length} != ${sourceRows.length}`);
  }
  const count = Math.min(sourceRows.length, translatedRows.length);
  for (let index = 0; index < count; index += 1) compare(sourceRows[index], translatedRows[index], `${label}[${index}]`, errors);
}

function checkMetadata(file, expected, label, errors) {
  if (file.locale !== expected.locale) errors.push(`${label}: locale ${file.locale} != ${expected.locale}`);
  if (file.language !== expected.language) errors.push(`${label}: language ${file.language} != ${expected.language}`);
  if (REVIEW_PAIRS[file.status] !== file.reviewStatus) errors.push(`${label}: status ${file.status} does not match reviewStatus ${file.reviewStatus}`);
  if (!String(file.attribution ?? '').includes('CC BY-SA 4.0')) errors.push(`${label}: attribution must include CC BY-SA 4.0`);
  if (file.reviewStatus === 'needs-native-speaker-review') {
    if (!String(file.attribution ?? '').includes('native-speaker review')) errors.push(`${label}: attribution must say native-speaker review`);
    if (!String(file.reviewNotice ?? '').includes('审校')) errors.push(`${label}: reviewNotice must include 审校`);
  }
  if (file.reviewNotice !== expected.reviewNotice) errors.push(`${label}: reviewNotice differs from messages.labels.draftNotice`);
}

function checkMessages(messages, topicsDoc, label, errors) {
  const projection = labelProjection(topicsDoc);
  if (messages.sourceProjectionSha256 !== projectionSha256(projection)) errors.push(`${label}: source projection sha256 does not match English subjects and domains`);
  const subjects = new Set(projection.subjects);
  for (const subject of projection.subjects) {
    if (!HAN.test(messages.subjects?.[subject] ?? '')) errors.push(`${label}: missing Simplified Chinese subject label for ${subject}`);
  }
  for (const subject of Object.keys(messages.subjects ?? {})) {
    if (!subjects.has(subject)) errors.push(`${label}: unexpected subject label ${subject}`);
  }
  for (const { subject, domain } of projection.domains) {
    if (!HAN.test(messages.domains?.[subject]?.[domain] ?? '')) errors.push(`${label}: missing Simplified Chinese domain label for ${subject} / ${domain}`);
  }
  for (const [subject, domains] of Object.entries(messages.domains ?? {})) {
    if (!subjects.has(subject)) errors.push(`${label}: unexpected domain group ${subject}`);
    const expected = new Set(projection.domains.filter((entry) => entry.subject === subject).map((entry) => entry.domain));
    for (const domain of Object.keys(domains)) {
      if (!expected.has(domain)) errors.push(`${label}: unexpected domain label ${subject} / ${domain}`);
    }
  }
  for (const key of REQUIRED_LABELS) {
    if (!HAN.test(messages.labels?.[key] ?? '')) errors.push(`${label}: label ${key} must be Simplified Chinese`);
  }
  for (const value of Object.values(messages.topicTypes ?? {})) {
    if (!HAN.test(value)) errors.push(`${label}: topic type label must be Simplified Chinese`);
  }
  for (const value of Object.values(messages.dependencyStrengths ?? {})) {
    if (!HAN.test(value)) errors.push(`${label}: strength label must be Simplified Chinese`);
  }
}

function checkContent(kind, doc, english, localeId, errors) {
  const label = `locale ${localeId} ${kind}.json`;
  if (!Array.isArray(doc.records)) {
    errors.push(`${label}: records must be an array`);
    return;
  }
  const rows = doc.records;
  if (doc.recordCount !== rows.length) errors.push(`${label}: recordCount ${doc.recordCount} != ${rows.length}`);
  if (kind === 'topics') {
    if (doc.sourceProjectionSha256 !== projectionSha256(topicProjection(english))) errors.push(`${label}: source projection sha256 does not match English topic text`);
    checkPairwise(topicProjection(english), rows, label, (source, translated, row, problems) => {
      if (translated.id !== source.id) problems.push(`${row}: id ${translated.id} != ${source.id}`);
      expectText(source.name, translated.name, `${row}.name`, problems);
      expectText(source.description, translated.description, `${row}.description`, problems);
      if (!Array.isArray(translated.evidence) || translated.evidence.length !== source.evidence.length) {
        problems.push(`${row}.evidence: length ${translated.evidence?.length} != ${source.evidence.length}`);
      } else {
        source.evidence.forEach((item, index) => expectText(item, translated.evidence[index], `${row}.evidence[${index}]`, problems));
      }
      expectText(source.assessmentPrompt, translated.assessmentPrompt, `${row}.assessmentPrompt`, problems);
    }, errors);
  } else if (kind === 'dependencies') {
    if (doc.sourceProjectionSha256 !== projectionSha256(dependencyProjection(english))) errors.push(`${label}: source projection sha256 does not match English dependency reasons`);
    checkPairwise(dependencyProjection(english), rows, label, (source, translated, row, problems) => {
      if (translated.topicId !== source.topicId || translated.prerequisiteId !== source.prerequisiteId) {
        problems.push(`${row}: edge ${translated.topicId} <- ${translated.prerequisiteId} != ${source.topicId} <- ${source.prerequisiteId}`);
      }
      expectText(source.reason, translated.reason, `${row}.reason`, problems);
    }, errors);
  } else if (kind === 'clusters') {
    if (doc.sourceProjectionSha256 !== projectionSha256(clusterProjection(english))) errors.push(`${label}: source projection sha256 does not match English cluster summaries`);
    checkPairwise(clusterProjection(english), rows, label, (source, translated, row, problems) => {
      if (translated.subject !== source.subject || translated.domain !== source.domain || translated.ageRangeStart !== source.ageRangeStart) {
        problems.push(`${row}: cluster key does not match English ${source.subject} / ${source.domain} / ${source.ageRangeStart}`);
      }
      expectText(source.summary, translated.summary, `${row}.summary`, problems);
    }, errors);
  }
}

function inside(parent, child) {
  const fromParent = relative(parent, child);
  return fromParent === '' || (!fromParent.startsWith('..') && !isAbsolute(fromParent));
}

export function checkTranslationSlice(kind, sourceRows, translatedRows) {
  const errors = [];
  const label = `slice ${kind}`;
  if (!Array.isArray(translatedRows)) return [`${label}: translated JSON must be an array`];
  if (kind === 'topics') {
    checkPairwise(sourceRows, translatedRows, label, (source, translated, row, problems) => {
      if (translated?.id !== source.id) problems.push(`${row}: id ${translated?.id} != ${source.id}`);
      expectText(source.name, translated?.name, `${row}.name`, problems);
      expectText(source.description, translated?.description, `${row}.description`, problems);
      if (!Array.isArray(translated?.evidence) || translated.evidence.length !== source.evidence.length) {
        problems.push(`${row}.evidence: length ${translated?.evidence?.length} != ${source.evidence.length}`);
      } else {
        source.evidence.forEach((item, index) => expectText(item, translated.evidence[index], `${row}.evidence[${index}]`, problems));
      }
      expectText(source.assessmentPrompt, translated?.assessmentPrompt, `${row}.assessmentPrompt`, problems);
    }, errors);
  } else if (kind === 'dependencies') {
    checkPairwise(sourceRows, translatedRows, label, (source, translated, row, problems) => {
      if (translated?.topicId !== source.topicId || translated?.prerequisiteId !== source.prerequisiteId) {
        problems.push(`${row}: edge mismatch`);
      }
      expectText(source.reason, translated?.reason, `${row}.reason`, problems);
    }, errors);
  } else if (kind === 'clusters') {
    checkPairwise(sourceRows, translatedRows, label, (source, translated, row, problems) => {
      if (translated?.subject !== source.subject || translated?.domain !== source.domain || translated?.ageRangeStart !== source.ageRangeStart) {
        problems.push(`${row}: cluster key mismatch`);
      }
      expectText(source.summary, translated?.summary, `${row}.summary`, problems);
    }, errors);
  } else errors.push(`${label}: unknown kind`);
  return errors;
}

export function checkLocaleSet({ topics, dependencies, clusters, catalog, locales, schemas }) {
  const errors = [];
  errors.push(...checkSchema(catalog, schemas.catalog).map((error) => `locale catalog ${error}`));
  for (const source of EXCLUDED_LOCALE_SOURCES) {
    if (!catalog.excluded?.includes(source)) errors.push(`locale catalog must exclude ${source}`);
  }
  const seen = new Set();
  for (const entry of catalog.locales ?? []) {
    if (seen.has(entry.id)) errors.push(`locale catalog duplicate ${entry.id}`);
    seen.add(entry.id);
    const locale = locales.find((item) => item.id === entry.id);
    if (!locale) {
      errors.push(`locale ${entry.id}: files not supplied`);
      continue;
    }
    if (locale.dirName !== entry.path.split('/').at(-1)) errors.push(`locale ${entry.id}: directory ${locale.dirName} != ${entry.path}`);
    const names = Object.keys(locale.files);
    for (const name of LOCALE_FILES) if (!names.includes(name)) errors.push(`locale ${entry.id}: missing ${name}`);
    for (const name of names) if (!LOCALE_FILES.includes(name)) errors.push(`locale ${entry.id}: unexpected file ${name}`);
    for (const name of EXCLUDED_LOCALE_SOURCES) if (names.includes(name)) errors.push(`locale ${entry.id}: must not include ${name}`);
    for (const [name, file] of Object.entries(locale.files)) {
      const meta = entry.files?.[name];
      if (!meta) continue;
      if (sha256(file.bytes) !== meta.sha256 || file.bytes.length !== meta.bytes) {
        errors.push(`locale ${entry.id} ${name}: catalog file hash does not match bytes`);
      }
      const schema = schemas[name.replace('.json', '')];
      errors.push(...checkSchema(file.json, schema).map((error) => `locale ${entry.id} ${name} ${error}`));
    }
    const messages = locale.files['messages.json']?.json;
    const content = Object.fromEntries(LOCALE_CONTENT_FILES.map((name) => [name, locale.files[name]?.json]));
    if (!messages || LOCALE_CONTENT_FILES.some((name) => !content[name])) continue;
    const expected = { locale: entry.id, language: entry.language, reviewNotice: messages.labels?.draftNotice };
    if (messages.locale !== entry.id || messages.language !== entry.language) errors.push(`locale ${entry.id}: messages identity != catalog`);
    checkMetadata(messages, expected, `locale ${entry.id} messages.json`, errors);
    checkMessages(messages, topics, `locale ${entry.id} messages.json`, errors);
    for (const name of LOCALE_CONTENT_FILES) {
      checkMetadata(content[name], expected, `locale ${entry.id} ${name}`, errors);
      checkContent(name.replace('.json', ''), content[name], name === 'topics.json' ? topics : name === 'dependencies.json' ? dependencies : clusters, entry.id, errors);
    }
    for (const name of locale.extraFiles ?? []) errors.push(`locale ${entry.id}: unexpected directory entry ${name}`);
  }
  return errors.length > ERROR_CAP
    ? [...errors.slice(0, ERROR_CAP), `…and ${errors.length - ERROR_CAP} more locale problems`]
    : errors;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadLocaleInputs(dataDir) {
  const catalogPath = resolve(dataDir, 'locales', 'catalog.json');
  const catalog = readJson(catalogPath);
  const localesRoot = resolve(dataDir, 'locales');
  const locales = (catalog.locales ?? []).map((entry) => {
    const directory = resolve(dataDir, entry.path ?? '');
    if (!inside(localesRoot, directory)) throw new Error(`locale path escapes data/locales: ${entry.path}`);
    const present = existsSync(directory) ? readdirSync(directory) : [];
    const files = {};
    for (const name of LOCALE_FILES) {
      if (!present.includes(name)) continue;
      const bytes = readFileSync(resolve(directory, name));
      files[name] = { json: JSON.parse(bytes.toString('utf8')), bytes };
    }
    const extraFiles = present.filter((name) => !LOCALE_FILES.includes(name));
    return { id: entry.id, dirName: directory.split(sep).at(-1), files, extraFiles };
  });
  const unexpected = readdirSync(localesRoot).filter((name) => name !== 'catalog.json' && !locales.some((locale) => locale.dirName === name));
  return { catalog, locales, unexpected };
}

export function checkLocalesFromDisk(dataDir = resolve(ROOT, 'data')) {
  const catalogPath = resolve(dataDir, 'locales', 'catalog.json');
  if (!existsSync(catalogPath)) return [];
  let loaded;
  try {
    loaded = loadLocaleInputs(dataDir);
  } catch (error) {
    return [`locale catalog could not be read: ${error.message}`];
  }
  const errors = loaded.unexpected.map((name) => `locale catalog unexpected entry ${name}`);
  errors.push(...checkLocaleSet({
    topics: readJson(resolve(dataDir, 'topics.json')),
    dependencies: readJson(resolve(dataDir, 'dependencies.json')),
    clusters: readJson(resolve(dataDir, 'clusters.json')),
    catalog: loaded.catalog,
    locales: loaded.locales,
    schemas: loadLocaleSchemas(),
  }));
  return errors.length > ERROR_CAP ? [...errors.slice(0, ERROR_CAP), `…and ${errors.length - ERROR_CAP} more locale problems`] : errors;
}

export function localeCatalogSummary(dataDir = resolve(ROOT, 'data')) {
  const catalogPath = resolve(dataDir, 'locales', 'catalog.json');
  if (!existsSync(catalogPath)) return null;
  return readJson(catalogPath).locales?.map((locale) => locale.id).join(', ') || 'empty';
}

export function stampCatalog(dataDir = resolve(ROOT, 'data')) {
  const catalogPath = resolve(dataDir, 'locales', 'catalog.json');
  const catalog = readJson(catalogPath);
  for (const locale of catalog.locales ?? []) {
    const directory = resolve(dataDir, locale.path);
    locale.files ??= {};
    for (const name of LOCALE_FILES) {
      const bytes = readFileSync(resolve(directory, name));
      locale.files[name] = { bytes: bytes.length, sha256: sha256(bytes) };
    }
  }
  writeFileSync(catalogPath, jsonText(catalog));
}

export function applyTopic(topic, record, messages) {
  return {
    ...topic,
    name: record.name,
    description: record.description,
    evidence: record.evidence,
    assessmentPrompt: record.assessmentPrompt,
    subjectLabel: messages.subjects[topic.subject],
    domainLabel: messages.domains[topic.subject][topic.domain],
    typeLabel: messages.topicTypes[topic.type],
  };
}

export function applyTopicFromDisk(dataDir, localeId, topicId) {
  const topics = readJson(resolve(dataDir, 'topics.json'));
  const topic = topics.topics.find((item) => item.id === topicId);
  if (!topic) throw new Error(`unknown topic ${topicId}`);
  const directory = resolve(dataDir, 'locales', localeId);
  const overlay = readJson(resolve(directory, 'topics.json'));
  const record = overlay.records.find((item) => item.id === topicId);
  if (!record) throw new Error(`locale ${localeId} has no ${topicId}`);
  const messages = readJson(resolve(directory, 'messages.json'));
  return {
    draftNotice: messages.labels.draftNotice,
    status: overlay.status,
    topic: applyTopic(topic, record, messages),
  };
}
