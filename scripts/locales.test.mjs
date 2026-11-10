import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyTopic,
  checkLocaleSet,
  checkLocalesFromDisk,
  checkTranslationSlice,
  clusterProjection,
  dependencyProjection,
  labelProjection,
  loadLocaleSchemas,
  projectionSha256,
  stampCatalog,
  topicProjection,
} from './locale-overlay.mjs';

const schemas = loadLocaleSchemas();
const NOTICE = '这些简体中文是社区与 AI 辅助的翻译草稿，教学准确性仍需母语者审校。英文原文是唯一规范来源。';
const ATTRIBUTION = 'Community/AI-assisted draft. © Generative Spark, Inc. (Marble). Adapted under CC BY-SA 4.0. Needs native-speaker review.';

const meta = (sourceFile, projection, records) => ({
  locale: 'zh-CN',
  language: 'zh-Hans',
  sourceLocale: 'en',
  sourceFile,
  status: 'community-draft',
  reviewStatus: 'needs-native-speaker-review',
  translationMethod: 'ai-assisted',
  contentLicense: 'CC-BY-SA-4.0',
  databaseLicense: 'ODbL-1.0',
  attribution: ATTRIBUTION,
  reviewNotice: NOTICE,
  sourceProjectionSha256: projectionSha256(projection),
  recordCount: records.length,
  records,
});

function english() {
  return {
    topics: {
      version: 'v1',
      topicCount: 1,
      topics: [{
        id: 'mt_test000001',
        type: 'CONCEPTUAL',
        subject: 'Mathematics',
        domain: 'Fractions',
        name: 'Half of a shape',
        description: 'Understand that a half is one of two equal parts.',
        ageRangeStart: 5,
        ageRangeEnd: 7,
        centrality: 0.1,
        evidence: ['Fold a square into two equal parts and shade one half'],
        assessmentPrompt: 'Can {{name}} point to one half, and can {{name}} say why the parts match?',
        standards: ['demo:H1'],
      }],
    },
    dependencies: {
      version: 'v1',
      edgeCount: 1,
      dependencies: [{
        topicId: 'mt_test000001',
        prerequisiteId: 'mt_test000002',
        strength: 'hard',
        reason: 'Must know equal parts before shading one half of a shape',
      }],
    },
    clusters: {
      version: 'v1',
      clusterCount: 1,
      clusters: [{
        subject: 'Mathematics',
        domain: 'Fractions',
        ageRangeStart: 5,
        summary: 'Your child is learning what a half means by splitting shapes into two equal parts.',
      }],
    },
  };
}

function messageDoc(topics) {
  return {
    locale: 'zh-CN',
    language: 'zh-Hans',
    sourceLocale: 'en',
    sourceFile: 'messages.json',
    status: 'community-draft',
    reviewStatus: 'needs-native-speaker-review',
    translationMethod: 'ai-assisted',
    contentLicense: 'CC-BY-SA-4.0',
    databaseLicense: 'ODbL-1.0',
    attribution: ATTRIBUTION,
    reviewNotice: NOTICE,
    sourceProjectionSha256: projectionSha256(labelProjection(topics)),
    subjects: { Mathematics: '数学' },
    domains: { Mathematics: { Fractions: '分数' } },
    topicTypes: {
      CONCEPTUAL: '概念理解',
      PROCEDURAL: '操作步骤',
      REPRESENTATIONAL: '表征方式',
      LANGUAGE: '语言运用',
      META: '学习策略',
    },
    dependencyStrengths: { hard: '必要', soft: '建议' },
    labels: {
      languageName: '简体中文',
      sourceLanguageName: '英语',
      switchLanguage: '语言',
      draftNotice: NOTICE,
      curriculumMap: '课程地图',
      topics: '微主题',
      prerequisites: '先备知识',
      evidence: '掌握证据',
      assessmentPrompt: '评估提示',
      clusterSummary: '领域简介',
      subject: '学科',
      domain: '领域',
      reason: '原因',
      hardPrerequisite: '必要先备',
      softPrerequisite: '建议先备',
      ageRange: '大致年龄',
    },
  };
}

function translatedRows() {
  return {
    topics: [{
      id: 'mt_test000001',
      name: '图形的一半',
      description: '理解一半是把一个整体分成的两等份中的一份。',
      evidence: ['把正方形折成两等份，并涂出其中的一半'],
      assessmentPrompt: '{{name}} 能否指出一半，并说明 {{name}} 为什么这两部分一样大？',
    }],
    dependencies: [{
      topicId: 'mt_test000001',
      prerequisiteId: 'mt_test000002',
      reason: '在给图形的一半涂色之前，必须先知道什么是相等的部分',
    }],
    clusters: [{
      subject: 'Mathematics',
      domain: 'Fractions',
      ageRangeStart: 5,
      summary: '孩子正在通过把图形分成两等份，学习一半是什么意思。',
    }],
  };
}

function bundle(docs = english(), rows = translatedRows()) {
  const files = {
    'topics.json': meta('topics.json', topicProjection(docs.topics), rows.topics),
    'dependencies.json': meta('dependencies.json', dependencyProjection(docs.dependencies), rows.dependencies),
    'clusters.json': meta('clusters.json', clusterProjection(docs.clusters), rows.clusters),
    'messages.json': messageDoc(docs.topics),
  };
  const encoded = Object.fromEntries(Object.entries(files).map(([name, json]) => [name, {
    json,
    bytes: Buffer.from(`${JSON.stringify(json, null, 2)}\n`),
  }]));
  return {
    ...docs,
    schemas,
    locales: [{ id: 'zh-CN', dirName: 'zh-CN', files: encoded, extraFiles: [] }],
    catalog: {
      version: 1,
      sourceLocale: 'en',
      description: 'Synthetic locale catalog.',
      excluded: ['curriculum-standards.json', 'teaching-research.json', 'archived-teaching-research.json', 'curriculum-alignments.json'],
      locales: [{
        id: 'zh-CN',
        language: 'zh-Hans',
        endonym: '简体中文',
        status: 'community-draft',
        reviewStatus: 'needs-native-speaker-review',
        path: 'locales/zh-CN',
        files: Object.fromEntries(Object.entries(encoded).map(([name, file]) => [name, {
          bytes: file.bytes.length,
          sha256: createHash('sha256').update(file.bytes).digest('hex'),
        }])),
      }],
    },
  };
}

const problems = (mutate) => {
  const input = bundle();
  mutate(input);
  return checkLocaleSet(input).join('\n');
};

test('locale overlay accepts a complete Simplified Chinese draft', () => {
  assert.deepEqual(checkLocaleSet(bundle()), []);
});

test('locale overlay keeps graph fields and applies translated text', () => {
  const docs = english();
  const applied = applyTopic(docs.topics.topics[0], translatedRows().topics[0], messageDoc(docs.topics));
  assert.equal(applied.id, 'mt_test000001');
  assert.deepEqual(applied.standards, ['demo:H1']);
  assert.equal(applied.subject, 'Mathematics');
  assert.equal(applied.subjectLabel, '数学');
  assert.equal(applied.domainLabel, '分数');
  assert.equal(applied.name, '图形的一半');
  assert.equal(applied.type, 'CONCEPTUAL');
  assert.equal(applied.typeLabel, '概念理解');
});

test('locale overlay rejects drifted text, placeholders, script and join keys', () => {
  assert.match(problems((input) => { input.locales[0].files['topics.json'].json.records[0].assessmentPrompt = '{{name}} 能否指出一半？'; }), /name}} count 1 != 2/);
  assert.match(problems((input) => { input.locales[0].files['topics.json'].json.records[0].name = '圖形的一半'; }), /traditional character 圖/);
  assert.match(problems((input) => { input.locales[0].files['topics.json'].json.records[0].description = 'Understand that a half is one of two equal parts.'; }), /unchanged English/);
  assert.match(problems((input) => { input.locales[0].files['clusters.json'].json.records[0].subject = '数学'; }), /cluster key does not match English/);
  assert.match(problems((input) => { input.locales[0].files['topics.json'].json.records[0].standardText = 'verbatim standard'; }), /unexpected property standardText/);
  assert.match(problems((input) => { input.locales[0].files['topics.json'].json.sourceProjectionSha256 = '0'.repeat(64); }), /source projection sha256/);
  assert.match(problems((input) => { input.catalog.locales[0].files['topics.json'].sha256 = '0'.repeat(64); }), /catalog file hash/);
  assert.match(problems((input) => { input.catalog.excluded = []; }), /must exclude curriculum-standards.json/);
});

test('slice checks keep numerals and symbols without forcing acronyms into Chinese', () => {
  const acronym = {
    id: 'mt_test000001', name: 'DNA', description: 'DNA', evidence: [], assessmentPrompt: 'DNA',
  };
  assert.deepEqual(checkTranslationSlice('topics', [acronym], [acronym]), []);
  const source = [{
    id: 'mt_test000001',
    name: 'Pyramid alignment',
    description: 'Alignment within 0.05° of true north, using 2 × 3 blocks.',
    evidence: [],
    assessmentPrompt: 'Can {{name}} read 0.05°?',
  }];
  const translated = [{
    id: 'mt_test000001',
    name: '金字塔的对准',
    description: '对准在正北 0.05° 以内，使用 2 × 3 块。',
    evidence: [],
    assessmentPrompt: '{{name}} 能否读出 0.05°？',
  }];
  assert.deepEqual(checkTranslationSlice('topics', source, translated), []);
  translated[0].description = '对准在正北以内，使用若干块。';
  assert.match(checkTranslationSlice('topics', source, translated).join('\n'), /missing numerals 0\.05/);
  const year = [{ ...source[0], description: 'Howard Carter found the tomb in 1922, then drew the antechamber.' }];
  const yearZh = [{ ...translated[0], description: '霍华德·卡特在 1922 年找到了陵墓，并画出了前厅。' }];
  assert.deepEqual(checkTranslationSlice('topics', year, yearZh).filter((error) => error.includes('1922')), []);
  const thousands = [{ ...source[0], description: 'Round 4,213 to the nearest thousand.' }];
  const thousandsZh = [{ ...translated[0], description: '把 4213 四舍五入到最近的千位。' }];
  assert.match(checkTranslationSlice('topics', thousands, thousandsZh).join('\n'), /missing numerals 4,213/);
  translated[0].description = '对准在正北 0.05 度以内，使用 2 x 3 块。';
  assert.match(checkTranslationSlice('topics', source, translated).join('\n'), /missing symbol °/);
});

test('catalog stamp refreshes file hashes and leaves the English projection binding intact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'taxonomy-locale-'));
  try {
    const docs = english();
    const input = bundle(docs);
    mkdirSync(join(dir, 'locales', 'zh-CN'), { recursive: true });
    writeFileSync(join(dir, 'topics.json'), JSON.stringify(docs.topics));
    writeFileSync(join(dir, 'dependencies.json'), JSON.stringify(docs.dependencies));
    writeFileSync(join(dir, 'clusters.json'), JSON.stringify(docs.clusters));
    for (const [name, file] of Object.entries(input.locales[0].files)) {
      writeFileSync(join(dir, 'locales', 'zh-CN', name), file.bytes);
    }
    writeFileSync(join(dir, 'locales', 'catalog.json'), `${JSON.stringify(input.catalog, null, 2)}\n`);
    assert.deepEqual(checkLocalesFromDisk(dir), []);
    const topicsPath = join(dir, 'locales', 'zh-CN', 'topics.json');
    const overlay = JSON.parse(readFileSync(topicsPath, 'utf8'));
    const projection = overlay.sourceProjectionSha256;
    overlay.records[0].description += '。';
    writeFileSync(topicsPath, `${JSON.stringify(overlay, null, 2)}\n`);
    assert.match(checkLocalesFromDisk(dir).join('\n'), /catalog file hash/);
    stampCatalog(dir);
    assert.deepEqual(checkLocalesFromDisk(dir), []);
    assert.equal(JSON.parse(readFileSync(topicsPath, 'utf8')).sourceProjectionSha256, projection);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('published locale catalog matches English source text', () => {
  const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
  const errors = checkLocalesFromDisk(dataDir);
  assert.deepEqual(errors, [], errors.join('\n'));
  const catalog = JSON.parse(readFileSync(new URL('../data/locales/catalog.json', import.meta.url), 'utf8'));
  assert.equal(catalog.sourceLocale, 'en');
  assert.ok(catalog.locales.some((locale) => locale.id === 'zh-CN' && locale.language === 'zh-Hans' && locale.status === 'community-draft'));
});
