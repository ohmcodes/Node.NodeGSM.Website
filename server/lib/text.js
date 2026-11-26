'use strict';
// Text helpers for untrusted user input.

// Strips control characters and collapses whitespace (multiline keeps paragraphs, at most 3 newlines in a row), then cuts to `max`.
const clean = (s, max, multiline) => String(s == null ? '' : s)
  .replace(multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '')
  .replace(multiline ? /\n{4,}/g : /\s+/g, multiline ? '\n\n\n' : ' ')
  .trim().slice(0, max);

const linkCount = (s) => (s.match(/https?:\/\/|www\./gi) || []).length;

module.exports = { clean, linkCount };
