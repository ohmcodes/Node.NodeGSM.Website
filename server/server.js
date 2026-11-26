'use strict';
// NodeGSM website server: serves the static site AND the community API (ratings, comments, editable plugin info, download counts).
// No dependencies. Run:  npm start   (PORT=8080 ADMIN_TOKEN=secret node server/server.js)
// Settings are environment variables, see config.js. The code is split by job:
//   config.js   settings            app.js       wiring + HTTP server       store.js   the JSON data file
//   lib/        http, router, rate limit, auth, static files, text helpers
//   services/   catalogue reader, community actions, app download counter, GitHub stars
//   routes/     the API endpoints (site-wide, per plugin, converter submissions)
const { createApp } = require('./app');

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3013;
  const s = createApp();
  s.listen(port, () => console.log(`NodeGSM site + community API on http://localhost:${port}  (admin ${process.env.ADMIN_TOKEN ? 'enabled' : 'disabled'})`));
  const bye = () => { s.store.flush(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
