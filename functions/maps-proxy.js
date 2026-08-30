'use strict';

// Google Places API (New) — Text Search. Resolves a fuzzy place name (as spoken
// in a vlog) to a canonical place: prefecture, area, address, lat/lng, Maps URL,
// price tier. Browser POSTs { query }. Returns { found, ... }, or
// { found:false, reason:'no_key' } when GOOGLE_MAPS_API_KEY is unset so the app
// silently keeps the AI's prefecture guess.

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.addressComponents',
  'places.primaryType',
  'places.priceLevel',
  'places.googleMapsUri',
].join(',');

// Places API (New) priceLevel enum -> our Places DB "Price Range" select.
const PRICE_LEVEL = {
  PRICE_LEVEL_FREE: { label: 'free', range: 'Free' },
  PRICE_LEVEL_INEXPENSIVE: { label: '¥', range: '¥' },
  PRICE_LEVEL_MODERATE: { label: '¥¥', range: '¥¥' },
  PRICE_LEVEL_EXPENSIVE: { label: '¥¥¥', range: '¥¥¥' },
  PRICE_LEVEL_VERY_EXPENSIVE: { label: '¥¥¥¥', range: '¥¥¥¥' },
};

function pickComponent(components, type) {
  const c = (components || []).find((x) => (x.types || []).includes(type));
  return c ? c.longText || c.shortText || '' : '';
}

// Japan: administrative_area_level_1 is the prefecture. Google returns e.g.
// "Shizuoka Prefecture" in longText — trim to match our dropdown values.
function pickPrefecture(components) {
  return pickComponent(components, 'administrative_area_level_1')
    .replace(/\s+Prefecture$/i, '')
    .trim();
}

function pickArea(components) {
  return (
    pickComponent(components, 'locality') ||
    pickComponent(components, 'administrative_area_level_2') ||
    pickComponent(components, 'sublocality_level_1') ||
    ''
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(200, '');
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return respond(200, { found: false, reason: 'no_key' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' });
  }

  const query = String(body.query || '').trim();
  if (!query) return respond(400, { error: 'Missing query' });

  let data;
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'en',
        regionCode: 'JP',
        maxResultCount: 1,
      }),
    });
    data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return respond(502, {
        found: false,
        error: (data.error && data.error.message) || `HTTP ${res.status}`,
      });
    }
  } catch (e) {
    return respond(502, { found: false, error: e.message });
  }

  const place = (data.places || [])[0];
  if (!place) return respond(200, { found: false });

  const price = PRICE_LEVEL[place.priceLevel] || null;
  return respond(200, {
    found: true,
    id: place.id || '',
    name: (place.displayName && place.displayName.text) || '',
    prefecture: pickPrefecture(place.addressComponents),
    area: pickArea(place.addressComponents),
    address: place.formattedAddress || '',
    lat: place.location ? place.location.latitude : null,
    lng: place.location ? place.location.longitude : null,
    mapsUri: place.googleMapsUri || '',
    primaryType: place.primaryType || '',
    priceLabel: price ? price.label : '',
    priceRange: price ? price.range : '',
  });
};

function respond(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
    },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  };
}

module.exports._internal = { pickPrefecture, pickArea, pickComponent, PRICE_LEVEL };
