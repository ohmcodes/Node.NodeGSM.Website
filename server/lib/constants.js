'use strict';
// Shared constants: limits, id formats and where the static site lives.
const path = require('path');

module.exports = {
  SITE: path.join(__dirname, '..', '..', 'public'),
  DEFAULT_CATALOG_INDEX: 'https://ohmcodes.github.io/Node.NodeGSM.Catalogue/index.json',
  LIMITS: { body: 64 * 1024, comment: 2000, info: 20000, name: 40, summary: 120, comments: 300, history: 50 },
  ID_RE: /^[a-z0-9][a-z0-9_-]{0,39}$/,      // plugin ids
  CLIENT_RE: /^[A-Za-z0-9_-]{6,64}$/,        // X-Client-Id (random id the browser makes up; not an account)
};
