'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { _internal } = require('../yt-transcript');
const {
  extractVideoId,
  extractPlayerResponse,
  sliceBalancedJson,
  pickCaptionTrack,
  parseJson3,
  digTranscriptText,
} = _internal;

test('extractVideoId: bare id, watch, youtu.be, shorts, embed', () => {
  assert.equal(extractVideoId('jNQXAC9IVRw'), 'jNQXAC9IVRw');
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=jNQXAC9IVRw&t=10s'), 'jNQXAC9IVRw');
  assert.equal(extractVideoId('https://youtu.be/jNQXAC9IVRw'), 'jNQXAC9IVRw');
  assert.equal(extractVideoId('https://www.youtube.com/shorts/jNQXAC9IVRw'), 'jNQXAC9IVRw');
  assert.equal(extractVideoId('https://www.youtube.com/embed/jNQXAC9IVRw'), 'jNQXAC9IVRw');
  assert.equal(extractVideoId('not a url'), '');
});

test('sliceBalancedJson: stops at the matching brace, ignores braces in strings', () => {
  const s = 'x = {"a":1,"b":"}{","c":{"d":2}} ; more';
  assert.equal(sliceBalancedJson(s, 4), '{"a":1,"b":"}{","c":{"d":2}}');
});

test('extractPlayerResponse: pulls the object after the marker', () => {
  const html = `<script>var ytInitialPlayerResponse = {"captions":{"x":1}};</script>`;
  assert.deepEqual(extractPlayerResponse(html), { captions: { x: 1 } });
});

test('pickCaptionTrack: lang match > manual > english > first', () => {
  const tracks = [
    { languageCode: 'ja', kind: 'asr' },
    { languageCode: 'en', kind: 'asr' },
    { languageCode: 'fr' },
  ];
  assert.equal(pickCaptionTrack(tracks, 'ja').languageCode, 'ja'); // exact
  assert.equal(pickCaptionTrack(tracks, '').languageCode, 'fr'); // manual (non-asr)
  assert.equal(pickCaptionTrack([tracks[0], tracks[1]], '').languageCode, 'en'); // english asr
  assert.equal(pickCaptionTrack([tracks[0]], '').languageCode, 'ja'); // first
});

test('parseJson3: joins segs, one line per event', () => {
  const json = {
    events: [
      { segs: [{ utf8: 'hello ' }, { utf8: 'world' }] },
      { segs: [{ utf8: '\n' }] },
      { segs: [{ utf8: 'second line' }] },
    ],
  };
  assert.equal(parseJson3(json), 'hello world\nsecond line');
  assert.equal(parseJson3({}), '');
});

test('digTranscriptText: youtube-transcript.io tracks[].transcript shape', () => {
  const resp = [
    {
      text: 'flat fallback text',
      id: 'abc',
      tracks: [
        {
          language: 'en',
          transcript: [
            { start: '0', dur: '1', text: 'hello' },
            { start: '1', dur: '1', text: 'world' },
          ],
        },
      ],
    },
  ];
  assert.equal(digTranscriptText(resp), 'hello world');
});

test('digTranscriptText: flat string, bare array, and null', () => {
  assert.equal(digTranscriptText([{ text: '  hi there  ' }]), 'hi there');
  assert.equal(digTranscriptText([{ transcript: '  hi there  ' }]), 'hi there');
  assert.equal(
    digTranscriptText([{ transcript: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] }]),
    'a b c'
  );
  assert.equal(digTranscriptText(null), '');
});
