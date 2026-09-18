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

// ── Data reaching innerHTML as markup ────────────────────────────────────────
// Notion text and provider messages rendered as HTML is the failure class that
// has bitten this file more than once. The rule is deliberately narrow: it only
// looks at values that read like data (`.name`, `.title`, `.message`, …) inside
// an innerHTML statement, and only complains when they are not wrapped in an
// escaping helper. A noisy gate gets ignored, so anything else is left alone.
const ESCAPERS =
  /(?:_esc|safeURL|_srcLinks|checkBadge|checkEvidence|_propText|richText|encodeURIComponent)\s*\(/;
const DATA_READ = /\.(?:name|title|note|fields|message|detail|label|text)\b/;
// Reviewed exceptions, each with the reason it is safe. Adding one is a
// deliberate act: if a new value shows up here, escape it or explain why not.
const ESCAPE_EXCEPTIONS = [
  [/^keys\.map\(/, 'our own store keys and labels'],
  [/^RESEARCH_STORES\[/, 'labels from our own store table'],
  [/^MATERIAL_CATEGORIES\[/, 'labels from our own category table'],
  [/^cfg\.label$/, 'labels from our own review config'],
  [/\?'checked':''$/, "a condition that only ever yields 'checked'"],
  [/^item\.(name|text)$/, 'a comparison string inside a .filter(), not markup'],
];
// Walk the statement that starts at an innerHTML assignment, tracking strings,
// nested template literals and `${…}` frames so a `;` or a backtick inside an
// interpolation cannot end the walk early. Returns every interpolation's text.
function innerHtmlInterpolations(src) {
  const found = [];
  for (const m of src.matchAll(/innerHTML\s*(?:\+)?=\s*/g)) {
    const frames = [{ kind: 'code', depth: 0 }];
    for (let i = m.index + m[0].length; i < src.length; i++) {
      const f = frames[frames.length - 1];
      const c = src[i],
        n = src[i + 1];
      if (f.kind === 'str') {
        if (c === '\\') i++;
        else if (c === f.quote) frames.pop();
        continue;
      }
      if (f.kind === 'tpl') {
        if (c === '\\') {
          i++;
          continue;
        }
        if (c === '`') {
          frames.pop();
          continue;
        }
        if (c === '$' && n === '{') {
          frames.push({ kind: 'code', depth: 0, from: i + 2 });
          i++;
          continue;
        }
        continue;
      }
      if (c === '/' && n === '/') {
        i = src.indexOf('\n', i);
        continue;
      }
      if (c === '/' && n === '*') {
        i = src.indexOf('*/', i) + 1;
        continue;
      }
      if (c === "'" || c === '"') {
        frames.push({ kind: 'str', quote: c });
        continue;
      }
      if (c === '`') {
        frames.push({ kind: 'tpl' });
        continue;
      }
      if (c === '(' || c === '[' || c === '{') {
        f.depth++;
        continue;
      }
      if (c === ')' || c === ']' || c === '}') {
        if (f.depth === 0 && frames.length > 1 && f.from !== undefined) {
          found.push({ at: f.from, text: src.slice(f.from, i) });
          frames.pop();
          continue;
        }
        f.depth--;
        continue;
      }
      if (c === ';' && f.depth === 0 && frames.length === 1) break;
    }
  }
  return found;
}
const escapeFindings = [];
const seen = new Set();
for (const expr of innerHtmlInterpolations(script)) {
  const text = expr.text.replace(/\s+/g, ' ').trim();
  if (!DATA_READ.test(text) || ESCAPERS.test(text)) continue;
  if (ESCAPE_EXCEPTIONS.some(([re]) => re.test(text))) continue;
  const line = html.slice(0, html.indexOf(script) + expr.at).split('\n').length;
  const key = `${line}|${text}`;
  if (seen.has(key)) continue;
  seen.add(key);
  escapeFindings.push({ line, text: text.slice(0, 90) });
}
escapeFindings.sort((a, b) => a.line - b.line);
for (const f of escapeFindings)
  console.log(
    `${f.line}  error  data reaching innerHTML unescaped: ${f.text}  (escape-or-explain)`
  );

const errors = result.messages.filter((m) => m.severity === 2).length;
const warnings = result.messages.length - errors;
console.log(
  `index.html inline script — ${errors} error(s), ${warnings} warning(s), ${escapeFindings.length} unescaped innerHTML finding(s)`
);
process.exit(errors || escapeFindings.length ? 1 : 0);
