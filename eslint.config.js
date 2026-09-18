'use strict';

const fs = require('node:fs');
const path = require('node:path');
const js = require('@eslint/js');
const globals = require('globals');

// Every classic script on the page shares one global scope: the inline script,
// then src/core.js, src/notion.js and the rest. So a name declared in any of them
// is visible to all of them, and ESLint has to be told that or `no-undef` drowns
// in false positives. The list is recomputed from the files on every lint run, so
// it cannot drift; the duplicate guard in lint-inline.mjs is what stops a name
// from being declared twice. They are marked writable because the shared state
// (`libraryRoute`, `_libVerifying`, …) is reassigned across files.
const pageGlobals = (() => {
  const names = new Set();
  // Split a declaration list on commas that are not inside brackets, so
  // `const A = [1, 2], B = { x: 1 }` yields A and B and nothing else.
  const declarators = (text) => {
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
  };
  const collect = (text) => {
    for (const m of text.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    // One statement can declare several names: `let a=1,b=false,c=null;`
    for (const m of text.matchAll(/^(?:const|let|var)\s+([^;\n]*)/gm))
      for (const part of declarators(m[1])) {
        const name = part
          .split('=')[0]
          .replace(/[{}[\]:]/g, ' ')
          .trim()
          .split(/\s+/)[0];
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
  };
  const own = new Map();
  try {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    collect(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  } catch {
    /* no page yet */
  }
  try {
    const dir = path.join(__dirname, 'src');
    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.endsWith('.js')) continue;
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      const before = new Set(names);
      collect(text);
      own.set(
        name,
        [...names].filter((n) => !before.has(n))
      );
    }
  } catch {
    /* no src/ yet */
  }
  return {
    all: Object.fromEntries([...names].map((name) => [name, 'writable'])),
    own,
  };
})();
// Each src file gets the shared globals except the ones it declares itself, or
// ESLint reports every declaration as "already defined as a built-in global".
const globalsForSrc = (name) =>
  Object.fromEntries(
    Object.entries(pageGlobals.all).filter(
      ([key]) => !(pageGlobals.own.get(name) || []).includes(key)
    )
  );
const srcFileConfigs = [...pageGlobals.own.keys()].map((name) => ({
  files: [`src/${name}`],
  languageOptions: {
    globals: { ...globals.browser, module: 'readonly', ...globalsForSrc(name) },
  },
}));

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'Template/**',
      '.netlify/**',
      'Docs/**',
      '.gitnexus/**',
      'graphify-out/**',
      '_deploy/**',
    ],
  },
  js.configs.recommended,
  {
    // Netlify serverless functions — Node CommonJS
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      // ignoreRestSiblings: `({ b64, key, ...rest }) => rest` omits fields on
      // purpose; the omitted names are meant to be unused.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    // This config file itself
    files: ['eslint.config.js', 'prettier.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    // Repo scripts — Node ESM
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // The app's client-side JavaScript lives inline in index.html, so ESLint
    // never picked it up. scripts/lint-inline.mjs extracts it and lints it under
    // this virtual filename, which does not exist on disk — naming index.html
    // here directly would make `eslint .` try to parse the HTML itself. Defect
    // rules take priority over style: the file has no module boundaries, so
    // style churn would bury the findings that matter.
    //
    // `src/*.js` are the same client code in real files, loaded as classic
    // scripts, so they get the same rules — including `no-undef` against browser
    // globals, which is what makes a moved name safe to trust.
    files: ['**/index.html.inline.js', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-cond-assign': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-unsafe-negation': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
      'no-sparse-arrays': 'error',
      'no-async-promise-executor': 'error',
      'no-global-assign': 'error',
      // Warnings, not errors: this is a 400 KB legacy script and the first job
      // is to make the real defects visible, not to block every commit on
      // forty unused locals.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': 'warn',
    },
  },
  // src/*.js end with a guarded `if (typeof module !== 'undefined')` footer so the
  // tests can `require` the same file the browser loads. `module` is a CommonJS
  // wrapper binding, not a global, so it is declared only here — the inline script
  // does not get it.
  ...srcFileConfigs,
  {
    // Repo test scripts — Node CommonJS
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
