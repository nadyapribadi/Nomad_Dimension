#!/usr/bin/env node
// Lints the JavaScript embedded in index.html.
//
// ESLint only picks up .js/.mjs/.cjs, so the app's entire client-side logic has
// been outside every gate — lint, pre-commit, and CI. This extracts the inline
// script and lints it as a file, at lint time. Nothing about the shipped
// artifact changes.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ESLint } from 'eslint';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) {
  console.error('lint:inline — no inline <script> block found in index.html');
  process.exit(1);
}
const script = match[1];
// Report positions against index.html, not against the extracted script, so a
// finding can actually be opened.
const lineOffset = html.slice(0, html.indexOf(script)).split('\n').length - 1;

// Top-level functions are reached from outside the script: inline handlers like
// onclick="libraryToggle(...)", and handlers built as strings inside the script
// itself. ESLint only sees the script, so all of them read as unused locals.
// Treat a name as used when it occurs anywhere else in the file, which keeps
// no-unused-vars pointed at names that appear exactly once — their declaration.
const declared = new Set();
for (const m of script.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)/gm)) declared.add(m[1]);
for (const m of script.matchAll(/^(?:const|let|var) ([A-Za-z_$][\w$]*)/gm)) declared.add(m[1]);
const fromHandlers = [...declared]
  .filter((name) => (html.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length > 1)
  .sort();
const withHandlers = fromHandlers.length
  ? `${script}\nvoid [${fromHandlers.join(',')}];\n`
  : script;

// The virtual filePath is what makes ESLint apply the index.html block from
// eslint.config.js. It is deliberately not a real path, so `eslint .` never
// tries to parse the HTML; the text handed in is the extracted JavaScript.
const eslint = new ESLint();
const [result] = await eslint.lintText(withHandlers, { filePath: 'index.html.inline.js' });

for (const m of result.messages) {
  const kind = m.severity === 2 ? 'error' : 'warning';
  console.log(`${m.line + lineOffset}:${m.column}  ${kind}  ${m.message}  (${m.ruleId})`);
}

const errors = result.messages.filter((m) => m.severity === 2).length;
const warnings = result.messages.length - errors;
console.log(`index.html inline script — ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
