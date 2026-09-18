'use strict';

// Text that reaches us from Notion, a transcript or a pasted file can hold
// anything, including half of a surrogate pair — two UTF-16 units that are one
// character everywhere else. A plain slice() cuts between them, and the
// leftover half travels as an escape no JSON parser accepts: Google answers the
// whole request with "Invalid JSON payload", so one emoji in one claim condemns
// a batch that was otherwise fine. Clip on character boundaries, and scrub what
// is left where it is serialized, so no caller has to remember.

// A valid pair is matched whole by the first alternative and kept; a stray half
// falls through to the second and becomes the replacement character.
const PAIR_OR_HALF = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;

function scrubLoneSurrogates(value) {
  return String(value ?? '').replace(PAIR_OR_HALF, (m) => (m.length === 2 ? m : '\uFFFD'));
}

function clipText(value, max) {
  const text = String(value ?? '');
  if (!(max > 0) || text.length <= max) return text;
  const cut = text.slice(0, max),
    last = cut.charCodeAt(cut.length - 1);
  // Never end on the high half of a pair: drop it rather than send half a
  // character the provider will refuse.
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

function safeJSON(value) {
  // JSON.stringify escapes a lone surrogate as "\ud83c" — text this parser
  // reads and every provider rejects. Fix the values, not the output string.
  return JSON.stringify(value, (_key, v) => (typeof v === 'string' ? scrubLoneSurrogates(v) : v));
}

module.exports = { scrubLoneSurrogates, clipText, safeJSON };
