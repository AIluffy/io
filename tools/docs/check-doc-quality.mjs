import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, 'apps', 'docs', 'src', 'content', 'docs');

const GENERIC_DESCRIPTION_RE =
  /^description:\s*"(?:type|function|value|interface|enum|class|unknown) export"|^description:\s*"Exports of /m;

const LOCALES = [
  {
    id: 'zh-cn',
    baseDir: '',
    requiredSections: ['## 何时使用', '## 最小示例', '## 常见误用', '## 相关 API'],
  },
  {
    id: 'en',
    baseDir: 'en',
    requiredSections: ['## When to Use', '## Minimal Example', '## Common Pitfalls', '## Related APIs'],
  },
];

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      files.push(fullPath);
    }
  }
  return files;
}

function isExportPage(referenceRelativePath) {
  const parts = referenceRelativePath.split(path.sep);
  return parts.length === 4 && parts[0] === 'reference' && parts[3] === 'index.mdx';
}

function hasCodeFence(content) {
  return /```[a-zA-Z]*/.test(content);
}

async function checkLocale(locale) {
  const localeRoot = locale.baseDir
    ? path.join(docsRoot, locale.baseDir)
    : docsRoot;
  const referenceRoot = path.join(localeRoot, 'api-reference');
  const files = await listFiles(referenceRoot);
  const issues = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const relativeFromLocale = path.relative(localeRoot, file);

    if (GENERIC_DESCRIPTION_RE.test(content)) {
      issues.push(`${locale.id}: generic description in ${relativeFromLocale}`);
    }

    if (/unknown export/i.test(content)) {
      issues.push(`${locale.id}: contains \"unknown export\" in ${relativeFromLocale}`);
    }

    if (isExportPage(relativeFromLocale)) {
      for (const section of locale.requiredSections) {
        if (!content.includes(section)) {
          issues.push(`${locale.id}: missing \"${section}\" in ${relativeFromLocale}`);
        }
      }

      if (!hasCodeFence(content)) {
        issues.push(`${locale.id}: missing code fence in ${relativeFromLocale}`);
      }
    }
  }

  return issues;
}

async function main() {
  const allIssues = [];
  for (const locale of LOCALES) {
    allIssues.push(...(await checkLocale(locale)));
  }

  if (allIssues.length > 0) {
    console.error('Documentation quality checks failed:');
    for (const issue of allIssues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log('Documentation quality checks passed.');
}

await main();
