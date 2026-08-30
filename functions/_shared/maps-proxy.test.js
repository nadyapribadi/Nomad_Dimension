'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pickPrefecture, pickArea, pickComponent } = require('../maps-proxy')._internal;

const comps = [
  {
    longText: 'Shizuoka Prefecture',
    shortText: 'Shizuoka',
    types: ['administrative_area_level_1', 'political'],
  },
  { longText: 'Fujinomiya', shortText: 'Fujinomiya', types: ['locality', 'political'] },
  { longText: 'Japan', shortText: 'JP', types: ['country', 'political'] },
];

test('pickPrefecture strips a trailing " Prefecture"', () => {
  assert.equal(pickPrefecture(comps), 'Shizuoka');
});

test('pickPrefecture leaves a bare name alone', () => {
  assert.equal(
    pickPrefecture([{ longText: 'Tokyo', types: ['administrative_area_level_1'] }]),
    'Tokyo'
  );
});

test('pickArea prefers locality over admin_area_level_2', () => {
  assert.equal(pickArea(comps), 'Fujinomiya');
});

test('missing / empty components -> empty string, no throw', () => {
  assert.equal(pickPrefecture([]), '');
  assert.equal(pickArea(undefined), '');
  assert.equal(pickComponent(null, 'locality'), '');
});
