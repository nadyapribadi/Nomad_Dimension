// Parse every <script> block in index.html, and every classic script the page
// loads from src/, to catch syntax errors before deploy. index.html has no test
// suite and Prettier skips it, so this is the only syntax guard. Compiles (does
// not run) each block — undefined browser globals are irrelevant, only syntax
// matters. Linting lives in lint-inline.mjs, which owns the rule set for client
// code; this script deliberately does not re-lint.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

// A classic script the page loads is part of the page: if it does not parse, the
// app is broken even though index.html itself is fine.
const srcDir = new URL('../src/', import.meta.url);
let srcFiles = [];
try {
  srcFiles = readdirSync(srcDir)
    .filter((name) => name.endsWith('.js'))
    .sort();
} catch {
  /* no src/ yet */
}
for (const name of srcFiles) blocks.push(readFileSync(new URL(name, srcDir), 'utf8'));

if (!blocks.length) {
  console.error('check-html-syntax: no <script> blocks found in index.html');
  process.exit(1);
}

let bad = 0;
blocks.forEach((src, i) => {
  try {
    new vm.Script(src, { filename: `index.html <script> #${i + 1}` });
  } catch (e) {
    bad++;
    console.error(`index.html <script> #${i + 1}: ${e.message}`);
  }
});

if (bad) process.exit(1);
console.log(
  `check-html-syntax: ${blocks.length - srcFiles.length} <script> block(s) + ${srcFiles.length} src/ file(s) OK`
);
