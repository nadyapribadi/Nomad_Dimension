// Parse every <script> block in index.html to catch syntax errors before deploy.
// index.html has no test suite and Prettier skips it, so this is the only
// automated guard. Compiles (does not run) each block — undefined browser
// globals are irrelevant, only syntax matters.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

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
console.log(`check-html-syntax: ${blocks.length} <script> block(s) OK`);
