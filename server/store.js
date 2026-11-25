'use strict';
// Tiny JSON-file store for the community data (no database to install). One file, atomic writes, debounced.
// Fine for a community site with thousands of comments; swap this module for SQLite/Postgres if it ever outgrows that.
const fs = require('fs');
const path = require('path');

class Store {
  constructor(file) {
    this.file = file;
    this.data = { plugins: {} };
    this.timer = null;
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); if (!this.data.plugins) this.data.plugins = {}; } catch { /* first run */ }
  }
  plugin(id) {
    return (this.data.plugins[id] = this.data.plugins[id] || { ratings: {}, comments: [], info: { text: '', rev: 0, by: '', at: 0, summary: '', history: [] }, downloads: 0 });
  }
  peek(id) { return this.data.plugins[id]; }
  // schedule a write (coalesces bursts)
  touch() { if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 400); }
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}
module.exports = { Store };
