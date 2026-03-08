#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const AI_DIR = path.join(ROOT_DIR, '.ai');
const TASK_TEMPLATE_PATH = path.join(AI_DIR, 'tasks', 'templates', 'task.md');
const HANDOFF_TEMPLATE_PATH = path.join(AI_DIR, 'handoffs', 'template.md');
const ADR_TEMPLATE_PATH = path.join(AI_DIR, 'decisions', 'template.md');

const ACRONYMS = new Set(['ai', 'api', 'cli', 'id', 'max', 'oauth', 'ui', 'url']);
const NON_TRIVIAL_PATTERNS = [
  /^apps\//,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^docker-compose\.yml$/,
  /^ecosystem\.config\.cjs$/,
  /^README\.md$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^docs\/ARCHITECTURE\.md$/,
  /^docs\/CONCEPT\.md$/,
  /^apps\/backend\/prisma\//,
  /^\.github\//,
];
const IGNORED_CHECK_PATTERNS = [
  /^node_modules\//,
  /^dist\//,
  /^coverage\//,
  /^\.claude\//,
  /^\.ai\/local\//,
  /^\.ai\/tmp\//,
  /^\.ai\/scratch\//,
];

function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printUsage();
    return;
  }

  const parsed = parseArgs(rest);

  switch (command) {
    case 'task:new':
      createTask(parsed);
      return;
    case 'handoff:new':
      createHandoff(parsed);
      return;
    case 'adr:new':
      createAdr(parsed);
      return;
    case 'check':
      runAiCheck(parsed);
      return;
    default:
      fail(`Unknown command: ${command}`);
  }
}

function printUsage() {
  console.log(`AI helper commands

Usage:
  pnpm ai:task:new -- <slug> [--title "Custom title"] [--owner Codex] [--related none] [--dry-run]
  pnpm ai:handoff:new -- <slug> [--task YYYY-MM-DD-slug] [--owner Codex] [--status paused] [--dry-run]
  pnpm ai:adr:new -- <slug> [--title "Custom title"] [--status proposed] [--supersedes none] [--dry-run]
  pnpm ai:check [--strict]

Examples:
  pnpm ai:task:new -- max-provider-retry
  pnpm ai:handoff:new -- max-provider-retry --task 2026-03-08-max-provider-retry
  pnpm ai:adr:new -- ai-cli-workflow --status accepted
  pnpm ai:check --strict`);
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split('=');

    if (inlineValue !== undefined) {
      options[rawKey] = inlineValue;
      continue;
    }

    const nextValue = argv[index + 1];

    if (!nextValue || nextValue.startsWith('--')) {
      options[rawKey] = true;
      continue;
    }

    options[rawKey] = nextValue;
    index += 1;
  }

  return { options, positionals };
}

function createTask(parsed) {
  const slug = requireSlug(parsed);
  const today = getToday();
  const id = `${today}-${slug}`;
  const title = parsed.options.title ?? slugToTitle(slug);
  const content = readFile(TASK_TEMPLATE_PATH)
    .replace('<title>', title)
    .replace('YYYY-MM-DD-<slug>', id)
    .replace('planned | in_progress | blocked | done', String(parsed.options.status ?? 'in_progress'))
    .replace('Codex | Opus | Human', String(parsed.options.owner ?? 'Codex'))
    .replace('Created: YYYY-MM-DD', `Created: ${today}`)
    .replace('Updated: YYYY-MM-DD', `Updated: ${today}`)
    .replace('<issue, PR, doc, or `none`>', String(parsed.options.related ?? 'none'));

  writeOutput(path.join(AI_DIR, 'tasks', 'active', `${id}.md`), content, parsed.options['dry-run'] === true);
}

function createHandoff(parsed) {
  const slug = requireSlug(parsed);
  const today = getToday();
  const title = parsed.options.title ?? slugToTitle(slug);
  const relatedTask = String(parsed.options.task ?? `${today}-${slug}`);
  const content = readFile(HANDOFF_TEMPLATE_PATH)
    .replace('<title>', title)
    .replace('YYYY-MM-DD-<slug>', relatedTask)
    .replace('blocked | paused', String(parsed.options.status ?? 'paused'))
    .replace('Codex | Opus | Human', String(parsed.options.owner ?? 'Codex'))
    .replace('Updated: YYYY-MM-DD', `Updated: ${today}`);

  writeOutput(path.join(AI_DIR, 'handoffs', `${today}-${slug}.md`), content, parsed.options['dry-run'] === true);
}

function createAdr(parsed) {
  const slug = requireSlug(parsed);
  const today = getToday();
  const number = getNextAdrNumber();
  const id = `${number}-${slug}`;
  const title = parsed.options.title ?? slugToTitle(slug);
  const content = readFile(ADR_TEMPLATE_PATH)
    .replace('ADR 0000: <title>', `ADR ${number}: ${title}`)
    .replace('proposed | accepted | superseded', String(parsed.options.status ?? 'proposed'))
    .replace('Date: YYYY-MM-DD', `Date: ${today}`)
    .replace('<ADR id or `none`>', String(parsed.options.supersedes ?? 'none'));

  writeOutput(path.join(AI_DIR, 'decisions', `${id}.md`), content, parsed.options['dry-run'] === true);
}

function runAiCheck(parsed) {
  const changedFiles = getChangedFiles().filter((filePath) => !IGNORED_CHECK_PATTERNS.some((pattern) => pattern.test(filePath)));

  if (changedFiles.length === 0) {
    console.log('ai:check ok - no local changes detected');
    return;
  }

  const aiChanged = changedFiles.some((filePath) => filePath.startsWith('.ai/'));
  const nonAiFiles = changedFiles.filter((filePath) => !filePath.startsWith('.ai/'));
  let nonTrivialFiles = nonAiFiles.filter((filePath) => NON_TRIVIAL_PATTERNS.some((pattern) => pattern.test(filePath)));

  if (nonTrivialFiles.length === 0 && nonAiFiles.length >= 4) {
    nonTrivialFiles = nonAiFiles;
  }

  if (nonTrivialFiles.length === 0) {
    console.log('ai:check ok - no non-trivial changes detected');
    return;
  }

  if (aiChanged) {
    console.log('ai:check ok - non-trivial changes include .ai updates');
    return;
  }

  const messageLines = [
    'ai:check warning - non-trivial changes detected without .ai updates',
    ...nonTrivialFiles.slice(0, 10).map((filePath) => `  - ${filePath}`),
    'Suggested next step: pnpm ai:task:new -- short-slug',
  ];

  console.warn(messageLines.join('\n'));

  if (parsed.options.strict === true) {
    process.exitCode = 1;
  }
}

function getChangedFiles() {
  const output = runGit(['status', '--porcelain']);

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => parseStatusLine(line))
    .filter(Boolean);
}

function parseStatusLine(line) {
  const value = line.slice(3).trim();

  if (!value) {
    return null;
  }

  if (!value.includes(' -> ')) {
    return value;
  }

  const parts = value.split(' -> ');
  return parts[parts.length - 1];
}

function getNextAdrNumber() {
  const decisionDir = path.join(AI_DIR, 'decisions');
  const numbers = readdirSync(decisionDir)
    .map((fileName) => {
      const match = fileName.match(/^(\d{4})-/);
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => value > 0);

  const nextNumber = Math.max(0, ...numbers) + 1;
  return String(nextNumber).padStart(4, '0');
}

function writeOutput(targetPath, content, dryRun) {
  const relativeTarget = path.relative(ROOT_DIR, targetPath).replace(/\\/g, '/');

  if (existsSync(targetPath)) {
    fail(`Refusing to overwrite existing file: ${relativeTarget}`);
  }

  if (dryRun) {
    console.log(`ai:dry-run ${relativeTarget}\n`);
    console.log(content);
    return;
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
  console.log(`ai:created ${relativeTarget}`);
}

function requireSlug(parsed) {
  const source = String(parsed.options.slug ?? parsed.positionals.join('-')).trim();

  if (!source) {
    fail('A slug is required.');
  }

  const slug = slugify(source);

  if (!slug) {
    fail('Could not derive a valid slug.');
  }

  return slug;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugToTitle(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => (ACRONYMS.has(part) ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(' ');
}

function getToday() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readFile(targetPath) {
  return readFileSync(targetPath, 'utf8');
}

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr ?? '').trim() : '';
    fail(stderr || `git ${args.join(' ')} failed`);
  }
}

function fail(message) {
  console.error(`ai:error ${message}`);
  process.exit(1);
}

main();
