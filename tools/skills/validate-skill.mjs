#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const errors = [];
const warnings = [];

const target = process.argv[2];

if (!target) {
  console.error(
    'Usage: node tools/skills/validate-skill.mjs <path-to-skill-folder>',
  );
  process.exit(1);
}

const skillDir = resolve(process.cwd(), target);

function pushError(message) {
  errors.push(message);
}

function pushWarning(message) {
  warnings.push(message);
}

function ensureDirectory(path) {
  if (!existsSync(path)) {
    pushError(`Missing directory: ${path}`);
    return false;
  }
  if (!statSync(path).isDirectory()) {
    pushError(`Not a directory: ${path}`);
    return false;
  }
  return true;
}

function ensureFile(path) {
  if (!existsSync(path)) {
    pushError(`Missing file: ${path}`);
    return false;
  }
  if (!statSync(path).isFile()) {
    pushError(`Not a file: ${path}`);
    return false;
  }
  return true;
}

function parseSimpleFrontmatter(markdownText) {
  if (!markdownText.startsWith('---\n')) {
    pushError('SKILL.md must start with YAML frontmatter (`---`).');
    return null;
  }

  const endMarker = '\n---\n';
  const endIndex = markdownText.indexOf(endMarker, 4);
  if (endIndex === -1) {
    pushError('SKILL.md frontmatter must end with `---` on its own line.');
    return null;
  }

  const rawFrontmatter = markdownText.slice(4, endIndex);
  const lines = rawFrontmatter.split('\n').filter(Boolean);
  const fields = {};

  for (const line of lines) {
    const splitAt = line.indexOf(':');
    if (splitAt === -1) {
      pushError(`Invalid frontmatter line: "${line}"`);
      continue;
    }
    const key = line.slice(0, splitAt).trim();
    const value = line.slice(splitAt + 1).trim();
    fields[key] = value;
  }

  return fields;
}

function parseOpenAiYaml(yamlText) {
  const lines = yamlText.split('\n');
  const result = {
    hasInterface: false,
    interface: {},
  };
  let inInterface = false;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    if (!line.startsWith(' ') && line.trim() === 'interface:') {
      result.hasInterface = true;
      inInterface = true;
      continue;
    }

    if (!line.startsWith(' ')) {
      inInterface = false;
      continue;
    }

    if (!inInterface) {
      continue;
    }

    const trimmed = line.trim();
    const splitAt = trimmed.indexOf(':');
    if (splitAt === -1) {
      continue;
    }

    const key = trimmed.slice(0, splitAt).trim();
    const value = trimmed
      .slice(splitAt + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1');

    result.interface[key] = value;
  }

  return result;
}

if (!ensureDirectory(skillDir)) {
  process.exit(1);
}

const expectedSkillName = basename(skillDir);
const skillMdPath = join(skillDir, 'SKILL.md');
const openAiYamlPath = join(skillDir, 'agents', 'openai.yaml');

if (ensureFile(skillMdPath)) {
  const skillMd = readFileSync(skillMdPath, 'utf8');
  const frontmatter = parseSimpleFrontmatter(skillMd);

  if (frontmatter) {
    const keys = Object.keys(frontmatter);
    const allowedKeys = new Set(['name', 'description']);

    for (const key of keys) {
      if (!allowedKeys.has(key)) {
        pushError(`SKILL.md frontmatter contains unsupported key: "${key}"`);
      }
    }

    if (!('name' in frontmatter)) {
      pushError('SKILL.md frontmatter missing required key: name');
    }
    if (!('description' in frontmatter)) {
      pushError('SKILL.md frontmatter missing required key: description');
    }

    const skillName = (frontmatter.name ?? '').replace(/^"(.*)"$/, '$1');
    if (!/^[a-z0-9-]{1,64}$/.test(skillName)) {
      pushError(
        'SKILL.md frontmatter name must match ^[a-z0-9-]{1,64}$ (lowercase letters, digits, hyphens).',
      );
    }

    if (skillName && skillName !== expectedSkillName) {
      pushWarning(
        `Frontmatter name "${skillName}" differs from folder name "${expectedSkillName}".`,
      );
    }

    const description = (frontmatter.description ?? '').replace(
      /^"(.*)"$/,
      '$1',
    );
    if (!description) {
      pushError('SKILL.md frontmatter description cannot be empty.');
    }
  }
}

if (ensureFile(openAiYamlPath)) {
  const openAiYaml = readFileSync(openAiYamlPath, 'utf8');
  const parsed = parseOpenAiYaml(openAiYaml);

  if (!parsed.hasInterface) {
    pushError('agents/openai.yaml must contain an `interface:` section.');
  } else {
    const displayName = parsed.interface.display_name ?? '';
    const shortDescription = parsed.interface.short_description ?? '';
    const defaultPrompt = parsed.interface.default_prompt ?? '';

    if (!displayName) {
      pushError('agents/openai.yaml missing interface.display_name');
    }
    if (!shortDescription) {
      pushError('agents/openai.yaml missing interface.short_description');
    } else if (shortDescription.length < 25 || shortDescription.length > 64) {
      pushError('interface.short_description must be 25-64 characters.');
    }

    if (!defaultPrompt) {
      pushWarning(
        'agents/openai.yaml missing interface.default_prompt (recommended for better invocation UX).',
      );
    } else {
      const skillRef = `$${expectedSkillName}`;
      if (!defaultPrompt.includes(skillRef)) {
        pushError(`interface.default_prompt should mention "${skillRef}".`);
      }
    }
  }
}

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error('Validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Skill validation passed: ${skillDir}`);
