#!/usr/bin/env node
// Lints the JavaScript embedded in index.html.
//
// ESLint only picks up .js/.mjs/.cjs, so the app's entire client-side logic has
// been outside every gate — lint, pre-commit, and CI. This extracts the inline
// script and lints it as a file, at lint time. Nothing about the shipped
// artifact changes.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { ESLint } from 'eslint';
import projectConfig from '../eslint.config.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) {
  console.error('lint:inline — no inline <script> block found in index.html');
  process.exit(1);
}
const script = match[1];

// ── No declaration may live in two places ────────────────────────────────────
// `src/*.js` is loaded as a classic script before this inline script, so both
// share one global scope. A `function` declared in both would silently let the
// later copy win (a move that quietly did nothing), and a `const`/`let` declared
// in both is a SyntaxError that kills the whole inline script. Neither should
// ever reach a commit, so the check names the offender.
const SRC_DIR = path.join(ROOT, 'src');
const srcFiles = (() => {
  try {
    return readdirSync(SRC_DIR)
      .filter((name) => name.endsWith('.js'))
      .sort();
  } catch {
    return [];
  }
})();
const declaredIn = (text) => {
  const names = new Set();
  for (const m of text.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of text.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  return names;
};
const inlineNames = declaredIn(script);
// Loading the same file twice runs it twice, and the second run throws on every
// top-level `const` it declares — a broken page from a duplicated line.
const scriptTags = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const duplicateTags = scriptTags.filter((rel, i) => scriptTags.indexOf(rel) !== i);
for (const rel of duplicateTags)
  console.log(
    `${rel}  error  loaded twice — the second run redeclares its consts  (duplicate <script src>)`
  );
const duplicates = [];
// Names the earlier classic scripts provide to this one. Declaring them to ESLint
// is what lets `no-undef` stay an error: a name the inline script uses must come
// from a file that really declares it, and removing it from src/ fails the lint
// instead of failing at runtime.
const srcGlobals = {};
let srcText = '';
for (const name of srcFiles) {
  const text = await readFile(path.join(SRC_DIR, name), 'utf8');
  srcText += `${text}\n`;
  for (const declared of declaredIn(text)) {
    srcGlobals[declared] = 'readonly';
    if (inlineNames.has(declared)) duplicates.push(`${name}: ${declared}`);
  }
}
for (const dup of duplicates)
  console.log(`${dup}  error  declared in both src/ and the inline script  (move, don't copy)`);
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
// Comma-splitting alone would read property names out of an object literal
// (`const R = { edits: {}, drafts: {} }`) and then "use" identifiers that do not
// exist, which is a no-undef error all of its own.
function declarators(text) {
  const out = [];
  let depth = 0,
    start = 0,
    quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}
for (const m of script.matchAll(/^(?:const|let|var)\s+([^;\n]*)/gm))
  for (const part of declarators(m[1])) {
    const name = part
      .split('=')[0]
      .replace(/[{}[\]:]/g, ' ')
      .trim()
      .split(/\s+/)[0];
    if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
  }
// A name counts as used when the page or a src file mentions it anywhere else:
// the callers of what is still declared inline now live in src/*.js.
const fromHandlers = [...declared]
  .filter(
    (name) =>
      (html.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length > 1 ||
      new RegExp(`\\b${name}\\b`).test(srcText)
  )
  .sort();
const withHandlers = fromHandlers.length
  ? `${script}\nvoid [${fromHandlers.join(',')}];\n`
  : script;

// The virtual filePath is what makes ESLint apply the index.html block from
// eslint.config.js. It is deliberately not a real path, so `eslint .` never
// tries to parse the HTML; the text handed in is the extracted JavaScript.
// Built from the project's own config so the rule set stays in one place, plus
// the names the earlier classic scripts declare.
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    ...projectConfig,
    { files: ['**/index.html.inline.js'], languageOptions: { globals: srcGlobals } },
  ],
});
const [result] = await eslint.lintText(withHandlers, {
  filePath: 'index.html.inline.js',
});

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
  `index.html inline script — ${errors} error(s), ${warnings} warning(s), ${escapeFindings.length} unescaped innerHTML finding(s), ${duplicates.length} duplicate declaration(s), ${duplicateTags.length} duplicate script tag(s)`
);
process.exit(errors || escapeFindings.length || duplicates.length || duplicateTags.length ? 1 : 0);
