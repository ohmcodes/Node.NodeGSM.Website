'use strict';
// The community actions (what a rating, comment, edit, download or moderation does to the data) and the views sent back to the browser.
// No HTTP in here: routes read the request, call one of these and send the result. Failures throw HttpError.
const crypto = require('crypto');
const { HttpError } = require('../lib/http');
const { LIMITS } = require('../lib/constants');
const { clean, linkCount } = require('../lib/text');

function createCommunity({ store }) {
  // ---- views
  const rating = (p, client) => { const v = Object.values(p.ratings); return { avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0, count: v.length, mine: (client && p.ratings[client]) || 0 }; };
  const view = (p, client) => ({
    rating: rating(p, client), downloads: p.downloads,
    comments: p.comments.slice(-200).reverse().map((c) => ({ id: c.id, name: c.name, text: c.text, at: c.at })),
    info: { text: p.info.text, rev: p.info.rev, by: p.info.by, at: p.info.at, summary: p.info.summary, history: p.info.history.map((h) => ({ rev: h.rev, by: h.by, at: h.at, summary: h.summary })) },
  });
  const viewOf = (id, client) => view(store.peek(id) || store.plugin(id), client); // reading never creates an empty record

  // { id: { avg, count, downloads } } for every plugin that has a rating or a download
  const summaries = () => {
    const out = {};
    for (const [id, p] of Object.entries(store.data.plugins)) { const r = rating(p); if (r.count || p.downloads) out[id] = { avg: r.avg, count: r.count, downloads: p.downloads }; }
    return out;
  };
  const totals = () => {
    const all = Object.values(store.data.plugins); const sum = (f) => all.reduce((t, p) => t + f(p), 0);
    return { downloads: sum((p) => p.downloads), ratings: sum((p) => Object.keys(p.ratings).length), comments: sum((p) => p.comments.length) };
  };
  // recent activity (newest first), optionally one type, plus the most downloaded plugins
  const feed = (type, limit) => {
    const events = store.data.events.filter((e) => !type || e.t === type).slice(0, limit);
    const topDownloads = Object.entries(store.data.plugins).filter(([, p]) => p.downloads > 0).sort((a, b) => b[1].downloads - a[1].downloads).slice(0, 10).map(([id, p]) => ({ id, downloads: p.downloads }));
    return { events, topDownloads, totals: totals() };
  };

  // ---- visitor actions
  const countDownload = (id) => { store.plugin(id).downloads++; store.event({ t: 'download', id }); };

  // value 1-5 sets the rating of this browser, 0 removes it
  const setRating = (id, client, raw) => {
    const v = Math.round(Number(raw)); if (!(v >= 0 && v <= 5)) throw new HttpError(400, 'Rating must be 1-5 (0 removes your rating)');
    const p = store.plugin(id);
    if (v === 0) delete p.ratings[client]; else { p.ratings[client] = v; store.event({ t: 'rating', id, value: v }); }
    store.touch(); return p;
  };

  const addComment = (id, ip, body) => {
    const text = clean(body.text, LIMITS.comment, true); const name = clean(body.name, LIMITS.name) || 'Anonymous';
    if (text.length < 2) throw new HttpError(400, 'Comment is empty');
    if (linkCount(text) > 2) throw new HttpError(400, 'Too many links');
    const p = store.plugin(id);
    if (p.comments.some((c) => c.by === ip && c.text === text)) throw new HttpError(409, 'Duplicate comment');
    p.comments.push({ id: 'c' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), name, text, at: Date.now(), by: ip });
    if (p.comments.length > LIMITS.comments) p.comments.splice(0, p.comments.length - LIMITS.comments);
    store.event({ t: 'comment', id, cid: p.comments[p.comments.length - 1].id, name, text: text.slice(0, 140) });
    store.touch(); return p;
  };

  const pushHistory = (i) => { i.history.unshift({ rev: i.rev, text: i.text, by: i.by, at: i.at, summary: i.summary }); i.history.length = Math.min(i.history.length, LIMITS.history); };

  const saveInfo = (id, body) => {
    const text = clean(body.text, LIMITS.info, true); const name = clean(body.name, LIMITS.name) || 'Anonymous'; const summary = clean(body.summary, LIMITS.summary);
    const p = store.plugin(id); const i = p.info;
    if (text === i.text) throw new HttpError(400, 'No changes to save');
    if (linkCount(text) > 20) throw new HttpError(400, 'Too many links');
    pushHistory(i);
    Object.assign(i, { text, rev: i.rev + 1, by: name, at: Date.now(), summary });
    store.event({ t: 'info', id, name, rev: i.rev, summary });
    store.touch(); return p;
  };

  // ---- moderation
  const deleteComment = (id, cid) => {
    const p = store.plugin(id); const n = p.comments.length; p.comments = p.comments.filter((c) => c.id !== cid);
    if (p.comments.length === n) throw new HttpError(404, 'Comment not found');
    store.data.events = store.data.events.filter((e) => e.cid !== cid);
    store.touch(); return p;
  };
  const revertInfo = (id, raw) => {
    const rev = Number(raw); const p = store.plugin(id); const i = p.info; const h = i.history.find((x) => x.rev === rev);
    if (!h) throw new HttpError(404, 'Revision not found');
    pushHistory(i);
    Object.assign(i, { text: h.text, rev: i.rev + 1, by: 'moderator', at: Date.now(), summary: 'Reverted to revision ' + rev });
    store.touch(); return p;
  };

  return { view, viewOf, summaries, totals, feed, countDownload, setRating, addComment, saveInfo, deleteComment, revertInfo };
}
module.exports = { createCommunity };
