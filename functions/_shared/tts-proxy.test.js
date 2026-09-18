'use strict';
// The TTS proxy is the one path that both holds a provider credential and hands
// a provider message back to the browser, so what it puts in the URL and what it
// relays are worth pinning down.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSession } = require('./auth');
const { handler } = require('../tts-proxy');

const secret = 'a-long-test-password-never-deployed';
const KEY = 'AIzaTESTKEY-not-real-000000';
const realFetch = global.fetch;

function event(body) {
  return {
    httpMethod: 'POST',
    headers: { cookie: `nomad_session=${makeSession(secret)}` },
    body: JSON.stringify(body),
  };
}
function useFetch(impl) {
  process.env.APP_PASSWORD = secret;
  process.env.GOOGLE_TTS_API_KEY = KEY;
  global.fetch = impl;
}
function restore() {
  global.fetch = realFetch;
  delete process.env.GOOGLE_TTS_API_KEY;
}

test('the TTS key travels in a header, never in the request URL', async () => {
  let seen;
  useFetch(async (url, options) => {
    seen = { url, options };
    return { status: 200, json: async () => ({ audioContent: 'b64' }) };
  });
  try {
    const res = await handler(event({ text: 'hello' }));
    assert.equal(res.statusCode, 200);
    assert.doesNotMatch(seen.url, /key=/, 'a URL ends up in logs and error traces');
    assert.equal(seen.options.headers['X-Goog-Api-Key'], KEY);
  } finally {
    restore();
  }
});

test('an upstream error is relayed as a reason, with any credential stripped', async () => {
  useFetch(async () => ({
    status: 403,
    json: async () => ({
      error: {
        code: 403,
        status: 'PERMISSION_DENIED',
        message: `Request had key=${KEY} rejected`,
      },
    }),
  }));
  try {
    const res = await handler(event({ text: 'hello' }));
    assert.equal(res.statusCode, 403);
    assert.doesNotMatch(res.body, /AIzaTESTKEY/, 'the key must not reach the browser');
    const body = JSON.parse(res.body);
    assert.equal(body.error.status, 'PERMISSION_DENIED');
    assert.match(body.error.message, /rejected/, 'the provider reason still comes through');
  } finally {
    restore();
  }
});

test('oversized text is refused before any upstream call', async () => {
  let calls = 0;
  useFetch(async () => {
    calls++;
    return { status: 200, json: async () => ({ audioContent: 'b64' }) };
  });
  try {
    const res = await handler(event({ text: 'x'.repeat(4501) }));
    assert.equal(res.statusCode, 400);
    assert.equal(calls, 0, 'nothing is sent upstream for text that is too long');
    assert.match(JSON.parse(res.body).error, /exceeds the TTS input limit/);
  } finally {
    restore();
  }
});

test('an unlisted voice is refused before any upstream call', async () => {
  let calls = 0;
  useFetch(async () => {
    calls++;
    return { status: 200, json: async () => ({ audioContent: 'b64' }) };
  });
  try {
    // A Studio voice is a much pricier tier than the four the UI offers.
    const res = await handler(
      event({ text: 'hello', voice: { languageCode: 'en-US', name: 'en-US-Studio-O' } })
    );
    assert.equal(res.statusCode, 400);
    assert.match(JSON.parse(res.body).error, /Unsupported voice/);
    assert.equal(calls, 0, 'nothing is sent upstream for an unlisted voice');
    const ok = await handler(event({ text: 'hello', voice: { name: 'en-US-Neural2-F' } }));
    assert.equal(ok.statusCode, 200);
    assert.equal(calls, 1);
  } finally {
    restore();
  }
});

test('an out-of-range speaking rate is refused, and a valid one is passed through', async () => {
  let sent;
  useFetch(async (_url, options) => {
    sent = JSON.parse(options.body);
    return { status: 200, json: async () => ({ audioContent: 'b64' }) };
  });
  try {
    const bad = await handler(
      event({ text: 'hello', voice: { name: 'en-US-Neural2-D' }, audioConfig: { speakingRate: 4 } })
    );
    assert.equal(bad.statusCode, 400);
    assert.match(JSON.parse(bad.body).error, /Speaking rate/);
    await handler(
      event({
        text: 'hello',
        voice: { name: 'en-US-Neural2-D' },
        audioConfig: { speakingRate: 1.25 },
      })
    );
    assert.equal(sent.audioConfig.speakingRate, 1.25);
    assert.equal(sent.audioConfig.audioEncoding, 'MP3');
    assert.equal(sent.voice.languageCode, 'en-US');
  } finally {
    restore();
  }
});
