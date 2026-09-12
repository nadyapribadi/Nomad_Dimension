'use strict';

const { withAuth } = require('./_shared/auth');

exports.handler = withAuth(async () => {
  const collections = process.env.NOTION_COLLECTIONS_DATABASE_ID || '';
  const placements = process.env.NOTION_PLACEMENTS_DATABASE_ID || '';
  const valid = (id) =>
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id);
  const ready = valid(collections) && valid(placements);
  return {
    statusCode: ready ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      ready
        ? { collections, placements }
        : {
            error:
              'Idea storage is not configured. Set NOTION_COLLECTIONS_DATABASE_ID and NOTION_PLACEMENTS_DATABASE_ID on the server. Your local draft is still available.',
          }
    ),
  };
});
