'use strict';

// Presence only: never return credentials or call a paid service.
const { withAuth } = require('./_shared/auth');
const { MODEL } = require('./web-research')._internal;
const KEYS = {
  notion: 'NOTION_TOKEN',
  youtube: 'YOUTUBE_API_KEY',
  maps: 'GOOGLE_MAPS_API_KEY',
  tts: 'GOOGLE_TTS_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'DASHSCOPE_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  xai: 'XAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
};

exports.handler = withAuth(async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '{}' };
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      configured: Object.fromEntries(
        Object.entries(KEYS).map(([service, key]) => [service, !!process.env[key]?.trim()])
      ),
      factCheck: { provider: 'gemini', model: MODEL, search: 'Google Search' },
      checked: 'presence-only',
    }),
  };
});
