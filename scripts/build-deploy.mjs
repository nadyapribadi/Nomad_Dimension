#!/usr/bin/env node
// Stages the static files Netlify is allowed to publish.
//
// The repo root holds a lot that must never reach a deploy artifact: the
// generated GitNexus index, Graphify output, Docs, and every agent/editor
// config file. Publishing "." uploads all of it, so the publish directory is a
// curated copy instead. Netlify functions are deployed separately from
// functions/ and must not appear here.
//
//   npm run deploy:stage
//
// Exits non-zero if a forbidden path reaches the staged output, so a future
// allowlist change fails loudly instead of leaking silently.
import { copyFile, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '_deploy');

// The complete set of files the browser loads at runtime. There is no build
// step: index.html carries its own inline CSS and JavaScript, and src/*.js are
// classic scripts it loads before that. Adding a script tag without adding the
// file here is caught below, before anything is staged.
const PUBLISH = [
  'index.html',
  'src/core.js',
  'src/notion.js',
  'src/library.js',
  'src/stages.js',
  'src/app.js',
];

// Never allowed in a deploy artifact. Checked after staging.
const FORBIDDEN_DIRS = [
  '.git',
  '.github',
  '.githooks',
  '.claude',
  '.agents',
  '.codex',
  '.gitnexus',
  'graphify-out',
  'Docs',
  'functions',
  'scripts',
];

const FORBIDDEN_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'CHANGELOG.md',
  'README.md',
  'netlify.toml',
  'package.json',
  'package-lock.json',
  'eslint.config.js',
  'prettier.config.js',
  'deno.lock',
  '.nvmrc',
  '.gitignore',
  '.prettierignore',
];

function forbidden(rel) {
  const top = rel.split('/')[0];
  if (FORBIDDEN_DIRS.includes(top) || FORBIDDEN_FILES.includes(top)) return top;
  if (top.startsWith('.env')) return top;
  if (rel.endsWith('.test.js') || rel.endsWith('.lock')) return rel;
  return null;
}

async function walk(dir, base = '') {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await walk(path.join(dir, entry.name), rel)));
    else found.push(rel);
  }
  return found;
}

const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Every classic script the page asks for has to be in the allowlist. Without this
// the failure mode is a live page with no JavaScript, discovered in a browser.
const indexHtml = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const referenced = [...indexHtml.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
const missing = referenced.filter((rel) => !PUBLISH.includes(rel));
if (missing.length) {
  console.error('deploy:stage — index.html loads scripts that are not in PUBLISH:');
  for (const rel of missing) console.error(`  ${rel}`);
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const rel of PUBLISH) {
  const src = path.join(ROOT, rel);
  try {
    await stat(src);
  } catch {
    console.error(`deploy:stage — missing publish source: ${rel}`);
    process.exit(1);
  }
  const dest = path.join(OUT, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(src, dest);
}

const files = (await walk(OUT)).sort();
const violations = files.map((rel) => [rel, forbidden(rel)]).filter(([, hit]) => hit);
if (violations.length) {
  console.error('deploy:stage — forbidden paths reached the deploy artifact:');
  for (const [rel, hit] of violations) console.error(`  ${rel}  (matched ${hit})`);
  process.exit(1);
}

const unexpected = files.filter((rel) => !PUBLISH.includes(rel));
if (unexpected.length) {
  console.error('deploy:stage — staged files that are not in the allowlist:');
  for (const rel of unexpected) console.error(`  ${rel}`);
  process.exit(1);
}

console.log(`deploy:stage — _deploy/ ready (${files.length} file(s))`);
for (const rel of files) {
  const { size } = await stat(path.join(OUT, rel));
  console.log(`  ${rel}  ${kb(size)}`);
}
console.log('Publish this directory only: --dir=_deploy --functions=functions');
