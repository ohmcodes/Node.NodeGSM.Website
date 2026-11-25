// WindowsGSM C# plugin -> NodeGSM plugin.json converter.
// Pure JavaScript, zero dependencies, runs in the browser and in Node (UMD). It only READS text: it never compiles,
// evaluates or executes the C#. Anything that is real code (custom Install/Update, HTTP, RCON, file writes ...) is NOT
// converted: it is reported as a warning / TODO so a human can write the NodeGSM equivalent (plugin.js hooks).
//
//   const { convertCs } = require('./convert-cs');
//   convertCs(source, { id, name, author, existingIds }) -> { ok, errors, id, pluginJson, pluginJsonText, readmeText, warnings, todos, detected, prBody }
//
// Format reference: PLUGINS.md of the NodeGSM / Catalogue repositories. Keep PLUGINS in sync when the format changes.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NodeGsmConvert = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIMITS = { source: 200 * 1024, json: 64 * 1024, readme: 32 * 1024 };
  const ID_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
  const QUERIES = { a2s: 'a2s', ut3: 'ut3', fivem: 'fivem' };
  // WindowsGSM ServerConfig member -> NodeGSM run.args placeholder (names verified against PLUGINS.md "Argument templates")
  const PH = { ServerPort: 'port', ServerQueryPort: 'queryPort', ServerMap: 'map', ServerMaxPlayer: 'maxPlayers', ServerName: 'name', ServerIP: 'ip', ServerParam: 'param', ServerGSLT: 'gslt' };
  const CONTROL = new Set(['if', 'else', 'for', 'foreach', 'while', 'do', 'try', 'catch', 'finally', 'switch', 'using', 'lock', 'unchecked', 'checked']);
  const GENERIC_NAMES = /^(skeleton|newplugin|plugin|example|myplugin)/i;

  // ------------------------------------------------------------------ source checks
  /** '' when the text looks like a C# source file, else a reason. */
  function checkSource(source) {
    if (typeof source !== 'string') return 'The source must be text';
    if (!source.trim()) return 'The source is empty';
    if (source.length > LIMITS.source) return 'The source is larger than ' + (LIMITS.source / 1024) + ' KB';
    // NUL / other control characters (binary file) or the replacement character (not valid UTF-8)
    if (/[\u0000-\u0008\u000B\u000E-\u001F\u007F�]/.test(source)) return 'This does not look like a text file (binary or invalid characters found)';
    return '';
  }

  // ------------------------------------------------------------------ lexer (comments dropped, strings kept whole)
  const P2 = new Set(['=>', '+=', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '-=', '::']);
  const isIdStart = (c) => /[\p{L}_@]/u.test(c);
  const isIdPart = (c) => /[\p{L}\p{N}_]/u.test(c);

  // splits "expr[,align][:format]" of an interpolation hole into the expression
  function holeExpr(e) {
    let depth = 0, q = false, ternary = false;
    for (let k = 0; k < e.length; k++) {
      const c = e[k];
      if (q) { if (c === '\\') k++; else if (c === '"') q = false; continue; }
      if (c === '"') q = true;
      else if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === '?' && depth === 0) ternary = true;
      else if (c === ':' && depth === 0 && !ternary) return e.slice(0, k).trim();
    }
    return e.trim();
  }

  function readString(src, i) {
    let j = i, interp = false, verb = false;
    while ((src[j] === '$' || src[j] === '@') && j - i < 3) { if (src[j] === '$') interp = true; else verb = true; j++; }
    if (src[j] !== '"') return null;
    // raw string literal """ ... """
    if (src.startsWith('"""', j)) {
      let q = 0; while (src[j + q] === '"') q++;
      const close = src.indexOf('"'.repeat(q), j + q);
      const end = close < 0 ? src.length : close;
      const text = src.slice(j + q, end).replace(/^\s*\n/, '').replace(/\n\s*$/, '');
      return { end: close < 0 ? src.length : close + q, parts: [{ s: text }], interp: false };
    }
    j++;
    const parts = []; let cur = '';
    for (;;) {
      const ch = src[j];
      if (ch === undefined) break;
      if (!verb && ch === '\\') {
        const n = src[j + 1];
        const map = { n: '\n', t: '\t', r: '\r', '0': '\0', a: '\x07', b: '\b', f: '\f', v: '\v' };
        if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(src.substr(j + 2, 4))) { cur += String.fromCharCode(parseInt(src.substr(j + 2, 4), 16)); j += 6; }
        else if (n === 'x' && /^[0-9a-fA-F]{1,4}/.test(src.substr(j + 2, 4))) { const h = /^[0-9a-fA-F]{1,4}/.exec(src.substr(j + 2, 4))[0]; cur += String.fromCharCode(parseInt(h, 16)); j += 2 + h.length; }
        else { cur += n === undefined ? '' : (map[n] !== undefined ? map[n] : n); j += 2; }
        continue;
      }
      if (ch === '"') {
        if (verb && src[j + 1] === '"') { cur += '"'; j += 2; continue; }
        j++; break;
      }
      if (interp && ch === '{') {
        if (src[j + 1] === '{') { cur += '{'; j += 2; continue; }
        let k = j + 1, depth = 0;
        while (k < src.length) {
          const c = src[k];
          if (c === '"') { k++; while (k < src.length && src[k] !== '"') { if (src[k] === '\\') k++; k++; } }
          else if (c === '(' || c === '[' || c === '{') depth++;
          else if (c === ')' || c === ']') depth--;
          else if (c === '}') { if (depth === 0) break; depth--; }
          k++;
        }
        parts.push({ s: cur }); cur = '';
        parts.push({ e: holeExpr(src.slice(j + 1, k)) });
        j = k + 1; continue;
      }
      if (interp && ch === '}' && src[j + 1] === '}') { cur += '}'; j += 2; continue; }
      if (!verb && ch === '\n') break; // unterminated regular string: stop at the line end
      cur += ch; j++;
    }
    parts.push({ s: cur });
    return { end: j, parts: parts.filter((p, n) => p.e !== undefined || p.s !== '' || n === 0), interp: parts.some((p) => p.e !== undefined) };
  }

  function lex(src) {
    const toks = []; const n = src.length; let i = 0; let lineStart = true;
    const add = (t, s, e, extra) => toks.push(Object.assign({ t, s, e }, extra));
    while (i < n) {
      const c = src[i];
      if (c === '\n') { lineStart = true; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === '#' && lineStart) { while (i < n && src[i] !== '\n') i++; continue; } // #region, #if ...
      lineStart = false;
      if (c === '"' || c === '$' || c === '@') {
        const r = readString(src, i);
        if (r) { add('str', i, r.end, { parts: r.parts, interp: r.interp, v: r.interp ? null : r.parts.map((p) => p.s).join('') }); i = r.end; continue; }
      }
      if (c === "'") {
        let j = i + 1, v = '';
        while (j < n && src[j] !== "'" && src[j] !== '\n') { if (src[j] === '\\') { v += src[j + 1] || ''; j += 2; } else v += src[j++]; }
        add('str', i, j + 1, { parts: [{ s: v }], interp: false, v, ch: true }); i = j + 1; continue;
      }
      if (isIdStart(c)) { let j = i + 1; while (j < n && isIdPart(src[j])) j++; add('id', i, j, { v: src.slice(i, j).replace(/^@/, '') }); i = j; continue; }
      if (c >= '0' && c <= '9') { let j = i + 1; while (j < n && /[0-9a-zA-Z_.]/.test(src[j])) j++; add('num', i, j, { v: src.slice(i, j) }); i = j; continue; }
      const two = src.substr(i, 2);
      if (P2.has(two)) { add('p', i, i + 2, { v: two }); i += 2; continue; }
      add('p', i, i + 1, { v: c }); i++;
    }
    return link(toks);
  }

  // fills tok.m with the index of the matching ( [ { or ) ] } (-1 when unmatched)
  function link(toks) {
    const stack = []; const close = { ')': '(', ']': '[', '}': '{' };
    toks.forEach((t) => { if (t.t === 'p') delete t.m; });
    toks.forEach((t, k) => {
      if (t.t !== 'p') return;
      if (t.v === '(' || t.v === '[' || t.v === '{') { t.m = -1; stack.push(k); }
      else if (close[t.v]) {
        for (let s = stack.length - 1; s >= 0; s--) if (toks[stack[s]].v === close[t.v]) { toks[stack[s]].m = k; t.m = stack[s]; stack.length = s; break; }
      }
    });
    return toks;
  }
  const sub = (toks, a, b) => link(toks.slice(a, b).map((t) => Object.assign({}, t)));
  const isP = (t, v) => t && t.t === 'p' && t.v === v;
  const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
  const opener = (t) => t && t.t === 'p' && (t.v === '(' || t.v === '[' || t.v === '{');

  function splitTop(toks, v) {
    const out = []; let cur = [];
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (opener(t) && t.m > k) { for (let q = k; q <= t.m; q++) cur.push(toks[q]); k = t.m; continue; }
      if (isP(t, v)) { out.push(relink(cur)); cur = []; } else cur.push(t);
    }
    out.push(relink(cur)); return out;
  }
  function findTop(toks, v, from) {
    for (let k = from || 0; k < toks.length; k++) {
      const t = toks[k];
      if (opener(t) && t.m > k) { k = t.m; continue; }
      if (isP(t, v)) return k;
    }
    return -1;
  }
  const text = (src, toks) => (toks.length ? src.slice(toks[0].s, toks[toks.length - 1].e).replace(/\s+/g, ' ').trim() : '');
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  // ------------------------------------------------------------------ structure: classes and members
  function findClasses(toks) {
    const out = []; const ns = [];
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (isId(t, 'namespace')) {
        let j = k + 1, name = '';
        while (j < toks.length && (isId(toks[j]) || isP(toks[j], '.'))) name += toks[j++].v;
        ns.push({ name, from: k, to: isP(toks[j], '{') && toks[j].m > 0 ? toks[j].m : toks.length });
      }
      if (isId(t, 'class') && isId(toks[k + 1]) && !(toks[k - 1] && (isP(toks[k - 1], ':') || isP(toks[k - 1], ',')))) {
        let j = k + 2, bases = [], inBase = false;
        while (j < toks.length && !isP(toks[j], '{') && !isP(toks[j], ';')) { if (isP(toks[j], ':')) inBase = true; else if (inBase && isId(toks[j]) && !isId(toks[j], 'where')) bases.push(toks[j].v); if (isId(toks[j], 'where')) inBase = false; j++; }
        if (!isP(toks[j], '{') || toks[j].m < 0) continue;
        const nsName = ns.filter((x) => k > x.from && k < x.to).map((x) => x.name).pop() || '';
        out.push({ name: toks[k + 1].v, bases, open: j, close: toks[j].m, namespace: nsName, at: k });
      }
    }
    return out;
  }

  // splits a class body (token range) into member chunks
  function splitMembers(toks, a, b) {
    const out = []; let k = a;
    while (k < b) {
      while (k < b && isP(toks[k], '[') && toks[k].m > k) k = toks[k].m + 1; // attributes
      const start = k; let sawAssign = false, end = -1;
      while (k < b) {
        const t = toks[k];
        if (t.t === 'p') {
          if ((t.v === '(' || t.v === '[') && t.m > k) { k = t.m + 1; continue; }
          if (t.v === '=' || t.v === '=>') sawAssign = true;
          if (t.v === '{') {
            const close = t.m > k ? t.m : b - 1;
            if (sawAssign) { k = close + 1; continue; }
            k = close + 1;
            if (k < b && isP(toks[k], '=')) { sawAssign = true; continue; } // property initialiser after { get; set; }
            end = k; break;
          }
          if (t.v === ';') { end = k + 1; break; }
          if (t.v === '}') { k++; continue; }
        }
        k++;
      }
      if (end < 0) end = k;
      if (end > start) out.push([start, end]);
      if (end <= start) k = start + 1; else k = end;
    }
    return out;
  }

  function parseMember(toks, a, b) {
    const slice = toks.slice(a, b);
    let first = -1, kind = '';
    for (let k = 0; k < slice.length; k++) {
      const t = slice[k];
      if (opener(t) && t.m !== undefined && t.m > -1) {
        if (t.v === '(') { first = k; kind = '('; break; }
        if (t.v === '{') { first = k; kind = '{'; break; }
        // [ ... ] (array types): skip to its end by absolute index mapping
        const rel = t.m - a; if (rel > k) { k = rel; continue; }
      }
      if (t.t === 'p' && (t.v === '=' || t.v === '=>')) { first = k; kind = t.v; break; }
      if (isP(t, ';')) { first = k; kind = ';'; break; }
    }
    if (first < 0) return null;
    const rel = sub(toks, a, b);
    let nameIdx = first - 1;
    if (isP(rel[nameIdx], '>')) { let d = 0; while (nameIdx >= 0) { if (isP(rel[nameIdx], '>')) d++; if (isP(rel[nameIdx], '<')) { d--; if (d === 0) { nameIdx--; break; } } nameIdx--; } }
    if (!isId(rel[nameIdx])) return null;
    const name = rel[nameIdx].v;
    const before = rel.slice(0, nameIdx).filter((t) => isId(t)).map((t) => t.v);
    const m = { name, mods: before, type: before[before.length - 1] || '', isConst: before.includes('const'), kind: kind === '(' ? 'method' : 'value', expr: null, body: null, all: rel };
    const stripSemi = (arr) => (arr.length && isP(arr[arr.length - 1], ';') ? sub(arr, 0, arr.length - 1) : arr);
    if (kind === '(') {
      let k = rel[first].m + 1;
      while (k < rel.length && !isP(rel[k], '{') && !isP(rel[k], '=>')) { if (opener(rel[k]) && rel[k].m > k) k = rel[k].m; k++; }
      if (isP(rel[k], '=>')) m.body = stripSemi(sub(rel, k + 1, rel.length));
      else if (isP(rel[k], '{') && rel[k].m > k) m.body = sub(rel, k + 1, rel[k].m);
      else m.body = [];
      m.isExprBody = isP(rel[k], '=>');
    } else if (kind === '=' || kind === '=>') {
      m.expr = stripSemi(sub(rel, first + 1, rel.length));
    } else if (kind === '{') {
      const close = rel[first].m > first ? rel[first].m : rel.length - 1;
      const body = sub(rel, first + 1, close);
      const g = body.findIndex((t) => isId(t, 'get'));
      if (g >= 0) {
        if (isP(body[g + 1], '=>')) m.expr = stripSemi(sub(body, g + 2, body.length));
        else if (isP(body[g + 1], '{') && body[g + 1].m > 0) {
          const inner = sub(body, g + 2, body[g + 1].m); const r = inner.findIndex((t) => isId(t, 'return'));
          if (r >= 0) { const e = findTop(inner, ';', r); m.expr = sub(inner, r + 1, e < 0 ? inner.length : e); }
        }
      }
      if (isP(rel[close + 1], '=')) m.expr = stripSemi(sub(rel, close + 2, rel.length));
    }
    return m;
  }

  // ------------------------------------------------------------------ constant evaluation (literals only)
  function evalConst(src, toks, members, depth) {
    depth = depth || 0;
    if (depth > 8) return null;
    toks = stripParens(toks);
    if (!toks.length) return null;
    const terms = splitTop(toks, '+');
    let acc = null;
    for (const term of terms) {
      const v = evalTerm(src, term, members, depth);
      if (v === null) return null;
      if (acc === null) acc = v;
      else if (typeof acc.v === 'number' && typeof v.v === 'number') acc = { v: acc.v + v.v };
      else acc = { v: String(acc.v) + String(v.v) };
    }
    return acc; // { v } or null when it is not a constant
  }
  function stripParens(toks) { while (toks.length > 1 && isP(toks[0], '(') && toks[0].m === toks.length - 1) toks = toks.slice(1, -1).map((t) => t); return relink(toks); }
  const relink = (toks) => (toks.length && toks.some((t) => t.m !== undefined) ? link(toks.map((t) => Object.assign({}, t))) : toks);

  function evalTerm(src, t, members, depth) {
    t = stripParens(t);
    if (!t.length) return null;
    // casts like (string)x or (object)new A2S()
    if (isP(t[0], '(') && t[0].m > 0 && t[0].m === 2 && isId(t[1]) && t.length > 3) t = relink(t.slice(3));
    if (t.length === 1) {
      const x = t[0];
      if (x.t === 'str') {
        if (!x.interp) return { v: x.v };
        let out = '';
        for (const p of x.parts) { if (p.e !== undefined) { const r = evalConst(p.e, lex(p.e), members, depth + 1); if (!r) return null; out += String(r.v); } else out += p.s; }
        return { v: out };
      }
      if (x.t === 'num') return /^\d+$/.test(x.v) ? { v: Number(x.v) } : { v: x.v };
      if (isId(x, 'true')) return { v: true };
      if (isId(x, 'false')) return { v: false };
      if (isId(x, 'null')) return { v: null, isNull: true };
      if (isId(x) && members[x.v] && members[x.v].expr) return evalConst(src, members[x.v].expr, members, depth + 1);
      return null;
    }
    if (t.length === 3 && isId(t[0]) && /^(string|String)$/.test(t[0].v) && isP(t[1], '.') && isId(t[2], 'Empty')) return { v: '' };
    if (t.length === 3 && isId(t[0], 'this') && isP(t[1], '.') && isId(t[2]) && members[t[2].v] && members[t[2].v].expr) return evalConst(src, members[t[2].v].expr, members, depth + 1);
    if (isId(t[0], 'new') && isId(t[1])) { let k = 2; while (isP(t[k], '.') && isId(t[k + 1])) k += 2; return { v: { type: t[k - 1 > 1 ? k - 1 : 1].v }, isNew: true }; }
    return null;
  }
  const str = (r) => (r && r.v !== null && typeof r.v !== 'object' ? String(r.v) : null);

  // ------------------------------------------------------------------ Plugin metadata
  function readMeta(src, cls, members) {
    const meta = {}; let found = false;
    const take = (key, exprToks) => { const r = evalConst(src, exprToks, members); if (r && typeof r.v !== 'object') { meta[key] = String(r.v === null ? '' : r.v); } else meta['_' + key] = text(src, exprToks); };
    const body = cls.tokens;
    // new Plugin { a = "", b = "" }  /  new Plugin() { ... }
    for (let k = 0; k < body.length; k++) {
      if (isId(body[k], 'new') && isId(body[k + 1], 'Plugin')) {
        let j = k + 2; if (isP(body[j], '(') && body[j].m > j) j = body[j].m + 1;
        if (isP(body[j], '{') && body[j].m > j) {
          found = true;
          for (const part of splitTop(sub(body, j + 1, body[j].m), ',')) {
            const eq = findTop(part, '=');
            if (eq === 1 && isId(part[0])) take(part[0].v, sub(part, 2, part.length));
          }
        }
      }
      // Plugin.name = "x";   plugin.author = "y";
      if (isId(body[k]) && /^plugin$/i.test(body[k].v) && isP(body[k + 1], '.') && isId(body[k + 2]) && isP(body[k + 3], '=') && !isP(body[k - 1], '.')) {
        const e = findTop(body, ';', k); found = true;
        take(body[k + 2].v, sub(body, k + 4, e < 0 ? body.length : e));
      }
    }
    for (const m of Object.values(members)) if (m.type === 'Plugin') found = true;
    return { meta, found };
  }

  // ------------------------------------------------------------------ run.args from Start()
  function statements(toks) {
    const out = []; let k = 0;
    while (k < toks.length) {
      const first = toks[k]; const start = k;
      const control = isP(first, '{') || (isId(first) && CONTROL.has(first.v));
      if (control) {
        let j = k;
        while (j < toks.length && !isP(toks[j], ';')) {
          if (isP(toks[j], '{') && toks[j].m > j) { j = toks[j].m + 1; break; }
          if (opener(toks[j]) && toks[j].m > j) j = toks[j].m;
          j++;
        }
        k = j; out.push({ toks: sub(toks, start, k), control: true });
      } else {
        const e = findTop(toks, ';', k);
        k = e < 0 ? toks.length : e + 1; out.push({ toks: sub(toks, start, e < 0 ? toks.length : e), control: false });
      }
    }
    return out;
  }

  // variable operations in a method body: name -> [{op:'set'|'add', toks}] (+ names touched inside if/loops)
  function collectVars(toks) {
    const vars = {}; const conditional = new Set();
    const add = (n, op, t) => { (vars[n] = vars[n] || []).push({ op, toks: t }); };
    for (const st of statements(toks)) {
      const t = st.toks;
      if (st.control) {
        for (let k = 0; k < t.length; k++) if (isId(t[k]) && (isP(t[k + 1], '+=') || isP(t[k + 1], '=') || (isP(t[k + 1], '.') && /^Append/.test((t[k + 2] || {}).v || '')))) conditional.add(t[k].v);
        continue;
      }
      let k = 0;
      while (k < 3 && isId(t[k]) && !isP(t[k + 1], '+=') && !isP(t[k + 1], '=') && !isP(t[k + 1], '.')) k++; // type tokens
      if (!isId(t[k])) continue;
      const name = t[k].v;
      if (isP(t[k + 1], '=') && !isP(t[k + 2], '=')) {
        let e = sub(t, k + 2, t.length);
        if (isId(e[0], 'new') && isId(e[1], 'StringBuilder')) { const par = isP(e[2], '(') && e[2].m > 2 ? sub(e, 3, e[2].m) : []; e = par; }
        add(name, 'set', e);
      } else if (isP(t[k + 1], '+=')) add(name, 'add', sub(t, k + 2, t.length));
      else if (isP(t[k + 1], '.') && /^Append(Line)?$/.test((t[k + 2] || {}).v || '') && isP(t[k + 3], '(') && t[k + 3].m > 3) {
        add(name, t[k + 2].v === 'AppendLine' ? 'addline' : 'add', sub(t, k + 4, t[k + 3].m));
      } else if (isP(t[k + 1], '.') && /^(Insert|Replace|Remove|Clear)$/.test((t[k + 2] || {}).v || '')) add(name, 'unknown', t);
    }
    return { vars, conditional };
  }

  function makeAtoms(src, env) {
    const U = (s) => [{ k: 'u', s: clip(s, 120) }];
    function expand(name, d) {
      const ops = env.vars[name]; if (!ops) return null;
      let out = [];
      for (const o of ops) {
        if (o.op === 'unknown') { out = out.concat(U(text(src, o.toks))); continue; }
        const a = atomsOf(o.toks, d + 1);
        if (o.op === 'set') out = a; else { out = out.concat(a); if (o.op === 'addline') out.push({ k: 't', s: ' ' }); }
      }
      env.used.add(name); return out;
    }
    function atomsOf(toks, d) {
      if (d > 12) return U('(too deep)');
      toks = stripParens(toks);
      if (!toks.length) return [];
      const q = findTop(toks, '?');
      if (q > 0) {
        const c = findTop(toks, ':', q + 1);
        if (c > q) {
          const cond = text(src, toks.slice(0, q)); const A = sub(toks, q + 1, c), B = sub(toks, c + 1, toks.length);
          const neg = /^!/.test(cond);
          if (/^!?\s*(string|String)\s*\.\s*IsNullOr(WhiteSpace|Empty)\s*\(/.test(cond) || /^[\w.]+\s*(==|!=)\s*("")$/.test(cond)) {
            const eq = /!=/.test(cond); const emptyBranch = (neg || eq) ? B : A, valBranch = (neg || eq) ? A : B;
            const er = evalConst(src, emptyBranch, {}); if (er && er.v === '') return [{ k: 'o', a: atomsOf(valBranch, d + 1) }];
          }
        }
        return U(text(src, toks));
      }
      const terms = splitTop(toks, '+'); if (terms.length > 1) return terms.reduce((acc, t) => acc.concat(atomsOf(t, d + 1)), []);
      let t = toks;
      if (isP(t[0], '(') && t[0].m === 2 && isId(t[1]) && t.length > 3) t = relink(t.slice(3)); // cast
      // x.ToString() / x.Trim() / x.TrimEnd()
      while (t.length > 4 && isP(t[t.length - 1], ')') && isP(t[t.length - 2], '(') && isId(t[t.length - 3]) && /^(ToString|Trim|TrimEnd|TrimStart)$/.test(t[t.length - 3].v) && isP(t[t.length - 4], '.')) t = t.slice(0, -4);
      t = relink(t);
      if (t.length === 1 && t[0].t === 'str') {
        const x = t[0]; let out = [];
        for (const p of x.parts) { if (p.e !== undefined) out = out.concat(atomsOf(lex(p.e), d + 1)); else if (p.s) out.push({ k: 't', s: p.s }); }
        return out;
      }
      if (t.length === 1 && t[0].t === 'num') return [{ k: 't', s: t[0].v }];
      // member chain
      const chain = []; let ok = true;
      for (let k = 0; k < t.length; k++) { if (k % 2 === 0 ? !isId(t[k]) : !isP(t[k], '.')) { ok = false; break; } if (k % 2 === 0) chain.push(t[k].v); }
      if (ok && chain.length) {
        if (chain[0] === 'this') chain.shift();
        if (chain.length === 2 && (chain[0] === '_serverData' || chain[0] === 'serverData') && PH[chain[1]]) return [{ k: 'p', n: PH[chain[1]], sd: chain[1] }];
        if (chain.length === 2 && /^(string|String)$/.test(chain[0]) && chain[1] === 'Empty') return [];
        if (chain.length === 1) {
          const e = expand(chain[0], d); if (e) return e;
          const m = env.members[chain[0]];
          if (m && m.expr) { const r = evalConst(src, m.expr, env.members); if (r && typeof r.v !== 'object') return r.v === '' ? [] : [{ k: 't', s: String(r.v) }]; }
        }
      }
      return U(text(src, t));
    }
    return atomsOf;
  }

  // atoms -> NodeGSM run.args items. Never invents: pieces it cannot convert drop the whole argument and become TODOs.
  function renderArgs(atomsList, notes) {
    const split = (atoms) => {
      const args = []; let cur = []; let lead = false, trail = false, startedAny = false;
      const endArg = () => { if (cur.length) args.push(cur); cur = []; };
      let quote = false;
      atoms.forEach((a) => {
        if (a.k === 't') {
          for (const ch of a.s) {
            if (ch === '"') { quote = !quote; continue; }
            if (!quote && /\s/.test(ch)) { if (!startedAny) lead = true; endArg(); trail = true; continue; }
            startedAny = true; trail = false;
            const last = cur[cur.length - 1];
            if (last && last.k === 't') last.s += ch; else cur.push({ k: 't', s: ch });
          }
        } else if (a.k === 'o') {
          const inner = split(a.a);
          if (inner.lead) { if (!startedAny) lead = true; endArg(); }
          startedAny = true; trail = false;
          if (inner.args.length) cur.push({ k: 'o', args: inner.args });
          if (inner.trail) { endArg(); trail = true; }
        } else { startedAny = true; trail = false; cur.push(a); }
      });
      endArg();
      return { args, lead, trail };
    };
    const render = (arg) => {
      // returns {s} | {group:[s...]} | {bad:text}
      const only = arg.length === 1 ? arg[0] : null;
      if (only && only.k === 'o') {
        if (only.args.length === 1) return render(only.args[0]);
        const parts = only.args.map(render);
        if (parts.some((p) => p.bad || p.group)) return { bad: 'optional argument group' };
        return { group: parts.map((p) => p.s) };
      }
      let s = '';
      for (const a of arg) {
        if (a.k === 't') {
          if (/[{}\[\]]/.test(a.s)) return { bad: 'text with braces/brackets: ' + a.s };
          s += a.s;
        } else if (a.k === 'p') {
          s += '{' + (a.n === 'param' && arg.length > 1 ? 'paramRaw' : a.n) + '}';
          if (a.n === 'param' && arg.length > 1) notes.rawParam = true;
        } else if (a.k === 'u') return { bad: a.s };
        else if (a.k === 'o') {
          if (a.args.length !== 1) return { bad: 'optional part with several arguments inside one argument' };
          const r = render(a.args[0]); if (r.bad || r.group) return { bad: r.bad || 'nested group' };
          s += '[' + r.s + ']';
        }
      }
      return { s };
    };
    const out = []; const bad = [];
    const rendered = [];
    for (const a of split(atomsList).args) { const r = render(a); if (r.bad) bad.push(r.bad); else rendered.push(r); }
    // "-port" "{port}"  ->  ["-port", "{port}"] (kept or dropped together)
    for (let k = 0; k < rendered.length; k++) {
      const r = rendered[k]; const nx = rendered[k + 1];
      if (r.s && nx && nx.s && /^[-+][^{}\s=]+$/.test(r.s) && /^\{(?!param)[A-Za-z]+\}$/.test(nx.s)) { out.push([r.s, nx.s]); k++; notes.grouped = true; }
      else out.push(r.group ? r.group : r.s);
    }
    return { args: out, bad };
  }

  // ------------------------------------------------------------------ helpers for the result
  const trivial = (body) => !body || body.every((t) => (t.t === 'id' && /^(return|null|true|false|string|String|Empty|await|Task|FromResult)$/.test(t.v)) || (t.t === 'p' && /^[;.(){}]$/.test(t.v)) || (t.t === 'str' && !t.v) || t.t === 'num');
  const mentions = (body, re) => !!body && body.some((t) => t.t === 'id' && re.test(t.v));
  const urlsIn = (body) => { const u = new Set(); (body || []).forEach((t) => { if (t.t === 'str') (t.parts || []).forEach((p) => { const m = p.s && p.s.match(/https?:\/\/[^\s"'<>)]+/); if (m) u.add(m[0]); }); }); return [...u].slice(0, 6); };
  const filesIn = (body) => { const u = new Set(); (body || []).forEach((t) => { if (t.t === 'str' && t.v && /^[\w./\\ -]+\.(cfg|ini|json|properties|xml|txt|yaml|yml|conf|lua|toml)$/i.test(t.v)) u.add(t.v); }); return [...u].slice(0, 8); };
  const oneLine = (s, n) => clip(String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim(), n);

  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  }
  function suggestId(cands, taken) {
    let base = '';
    for (const c of cands) { const s = slugify(c); if (s.length >= 2 && !GENERIC_NAMES.test(s)) { base = s; break; } }
    if (!base) base = slugify(cands.find((c) => slugify(c).length >= 2) || '') || 'mygame';
    base = base.slice(0, 32).replace(/[-_]+$/, '');
    if (base.length < 2) base += '-gs';
    const has = (id) => taken.has(id);
    let id = base, n = 2;
    while (has(id) || id === '_template') { const suf = '-' + n++; id = base.slice(0, 32 - suf.length) + suf; }
    return id;
  }
  const semver = (v) => { const m = String(v || '').trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(.*)$/); return m ? `${m[1]}.${m[2] || 0}.${m[3] || 0}` + (/^[-+][0-9A-Za-z.+-]*$/.test(m[4]) ? m[4] : '') : ''; };
  const safeRel = (p) => typeof p === 'string' && p.length > 0 && !/^[\\/]/.test(p) && !/^[a-zA-Z]:/.test(p) && !p.split(/[\\/]/).includes('..');

  // ------------------------------------------------------------------ strict validation of a submitted/converted plugin.json
  // Subset of the Catalogue validator (scripts/lib/validate.js) restricted to what the converter produces:
  // plugin.json + README only; no plugin.js, no scripts, no download/run steps.
  const ALLOWED_KEYS = ['$schema', 'id', 'name', 'description', 'summary', 'author', 'contributors', 'version', 'url', 'tags', 'color', 'media', 'docs', 'install', 'run', 'defaults', 'query', 'gslt'];
  function validatePluginJson(m) {
    const errors = []; const e = (s) => errors.push(s);
    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    if (!isObj(m)) return ['plugin.json must be a JSON object'];
    for (const k of Object.keys(m)) if (!ALLOWED_KEYS.includes(k)) e(`"${k}" is not accepted here (this route takes only plugin.json fields produced by the converter; plugin.js is never accepted)`);
    const badText = (v) => typeof v === 'string' && /[\u0000-\u001F\u007F�]/.test(v);
    const walk = (v, at) => { if (typeof v === 'string') { if (badText(v)) e(`${at} contains control characters`); } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`)); else if (isObj(v)) Object.keys(v).forEach((k) => walk(v[k], `${at}.${k}`)); };
    walk(m, 'plugin.json');
    const text = (k, max, req) => { const v = m[k]; if (v === undefined) { if (req) e(`"${k}" is required`); return; } if (typeof v !== 'string' || (req && !v.trim())) e(`"${k}" must be ${req ? 'non-empty ' : ''}text`); else if (v.length > max) e(`"${k}" is too long (max ${max})`); };
    if (typeof m.id !== 'string' || !ID_RE.test(m.id)) e('"id" must be 2-32 chars of a-z 0-9 _ - (starting with a letter or digit)');
    text('name', 100, true); text('description', 600); text('summary', 140); text('author', 100); text('version', 40); text('url', 300);
    if (m.url && !/^https?:\/\/[^\s]+$/i.test(m.url)) e('"url" must be an http(s) link');
    if (m.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(m.color))) e('"color" must look like #RRGGBB');
    if (m.tags !== undefined && !(Array.isArray(m.tags) && m.tags.length <= 12 && m.tags.every((t) => typeof t === 'string' && t.length <= 30))) e('"tags" must be up to 12 short texts');
    if (m.contributors !== undefined && !(Array.isArray(m.contributors) && m.contributors.length <= 12 && m.contributors.every((t) => typeof t === 'string' && t.length <= 60))) e('"contributors" must be up to 12 short texts');
    const i = m.install;
    if (!isObj(i)) e('"install" is required: { "type": "steamcmd", "appId": "..." } or { "type": "manual" }');
    else {
      if (i.type === 'steamcmd') { if (!/^\d{1,10}$/.test(String(i.appId || ''))) e('install.appId must be a numeric Steam app id'); }
      else if (i.type !== 'manual') e('install.type must be "steamcmd" or "manual" (custom steps need a pull request to the Catalogue)');
      for (const k of Object.keys(i)) if (!['type', 'appId'].includes(k)) e(`install.${k} is not accepted here`);
    }
    const r = m.run;
    if (!isObj(r)) e('"run" is required');
    else {
      for (const k of Object.keys(r)) if (!['exe', 'command', 'args', 'stdin', 'stopCommand', 'workingDir'].includes(k)) e(`run.${k} is not accepted here`);
      if (!r.exe) e('"run.exe" (path of the server executable, relative to the server files folder) is required');
      else if (!safeRel(r.exe) || typeof r.exe !== 'string' || r.exe.length > 200) e('"run.exe" must be a relative path without ".."');
      if (r.workingDir !== undefined && !safeRel(r.workingDir)) e('"run.workingDir" must be a relative path without ".."');
      if (r.command !== undefined && !(typeof r.command === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(r.command))) e('"run.command" must be a plain program name such as "java"');
      if (r.stdin !== undefined && typeof r.stdin !== 'boolean') e('"run.stdin" must be true or false');
      if (r.stopCommand !== undefined && !(typeof r.stopCommand === 'string' && r.stopCommand.length <= 100)) e('"run.stopCommand" must be short text');
      if (r.args !== undefined) {
        if (!Array.isArray(r.args) || r.args.length > 60) e('"run.args" must be an array of up to 60 items');
        else r.args.forEach((a, k) => { const ok = (typeof a === 'string' && a.length <= 200) || (Array.isArray(a) && a.length <= 8 && a.every((x) => typeof x === 'string' && x.length <= 200)); if (!ok) e(`run.args[${k}] must be text or an array of text`); });
      }
    }
    if (m.defaults !== undefined) {
      if (!isObj(m.defaults)) e('"defaults" must be an object');
      else for (const [k, v] of Object.entries(m.defaults)) {
        if (!['port', 'queryPort', 'map', 'maxPlayers', 'additional', 'portIncrement'].includes(k)) e(`defaults.${k} is not accepted`);
        else if (k === 'portIncrement') { if (!(Number.isInteger(v) && v >= 1 && v <= 100)) e('defaults.portIncrement must be a whole number 1-100'); }
        else if (typeof v !== 'string' || v.length > 300) e(`defaults.${k} must be text`);
        else if (['port', 'queryPort', 'maxPlayers'].includes(k) && v && !/^\d{1,6}$/.test(v)) e(`defaults.${k} must be a number`);
      }
    }
    if (m.query !== undefined && m.query !== null && !QUERIES[m.query]) e('"query" must be a2s, ut3, fivem or null');
    if (m.gslt !== undefined && typeof m.gslt !== 'boolean') e('"gslt" must be true or false');
    if (m.media !== undefined) {
      if (!isObj(m.media)) e('"media" must be an object');
      else {
        for (const k of Object.keys(m.media)) if (!['icon', 'readme', 'screenshots'].includes(k)) e(`media.${k} is not accepted here`);
        if (m.media.icon !== undefined && m.media.icon !== 'icon.png') e('media.icon must be "icon.png"');
        if (m.media.readme !== undefined && m.media.readme !== 'README.md') e('media.readme must be "README.md"');
        if (m.media.screenshots !== undefined && !(Array.isArray(m.media.screenshots) && m.media.screenshots.length === 0)) e('media.screenshots must be empty (add screenshots in the pull request)');
      }
    }
    if (m.docs !== undefined) {
      if (!Array.isArray(m.docs) || m.docs.length > 10) e('"docs" must be up to 10 { title, url, type } entries');
      else m.docs.forEach((d, k) => {
        if (!isObj(d) || typeof d.title !== 'string' || !d.title || d.title.length > 120) e(`docs[${k}].title is required`);
        else if (typeof d.url !== 'string' || !/^https?:\/\/[^\s]+$/i.test(d.url) || d.url.length > 300) e(`docs[${k}].url must be an http(s) link`);
        else if (!['official', 'unofficial'].includes(d.type)) e(`docs[${k}].type must be "official" or "unofficial"`);
      });
    }
    return errors;
  }

  // ------------------------------------------------------------------ README + PR body
  function buildReadme(pj, info) {
    info = info || {};
    const L = [];
    L.push('# ' + oneLine(pj.name || pj.id, 100), '');
    L.push(oneLine(pj.description, 600) || 'Short description of the game and the server.', '');
    L.push('## Install');
    if (pj.install && pj.install.type === 'steamcmd') L.push(`Installed with SteamCMD, app id [${pj.install.appId}](https://steamdb.info/app/${pj.install.appId}/info/).`, '');
    else L.push('Not installed automatically: put the server files (including `' + ((pj.run && pj.run.exe) || 'the server executable') + '`) into the server folder, or extend the install steps.', '');
    const d = pj.defaults || {};
    const rows = [['Game port', d.port], ['Query port', d.queryPort], ['Default map', d.map], ['Max players', d.maxPlayers], ['Start parameters', d.additional]].filter((r) => r[1]);
    if (rows.length) { L.push('## Defaults', '| | |', '|---|---|'); rows.forEach((r) => L.push(`| ${r[0]} | ${String(r[1]).replace(/\|/g, '\\|')} |`)); L.push(''); }
    if (pj.run && pj.run.exe) L.push('## Start', 'Executable: `' + pj.run.exe + '`' + (pj.run.command ? ' (started through `' + pj.run.command + '`)' : ''), '');
    L.push('## Notes');
    L.push('This plugin was converted automatically from a WindowsGSM plugin' + (info.className ? ' (`' + oneLine(info.className, 60) + '`' + (info.originalAuthor ? ' by ' + oneLine(info.originalAuthor, 60) : '') + ')' : '') + ' with the NodeGSM website converter. It has not been tested in NodeGSM yet.');
    (info.todos || []).forEach((t) => L.push('- TODO: ' + oneLine(t, 300)));
    return L.join('\n') + '\n';
  }

  function buildPrBody(pj, info) {
    info = info || {}; const id = pj.id;
    const L = [];
    L.push('## What does this PR do?');
    L.push('- [x] Adds a new plugin: `plugins/' + id + '`');
    L.push('- [ ] Fixes / updates an existing plugin: `plugins/<id>` (what changed in the game, with a link to patch notes / SteamDB / wiki):');
    L.push('');
    L.push('Converted from a WindowsGSM C# plugin' + (info.className ? ' (`' + oneLine(info.className, 60) + '`' + (info.originalAuthor ? ' by ' + oneLine(info.originalAuthor, 60) : '') + ')' : '') + ' with the NodeGSM website converter' + (info.automated ? ' (automated submission: it needs an icon and a docs / README review before merging)' : '') + '. Only `plugin.json` and `README.md` were generated; the C# was never executed.');
    L.push('');
    L.push('## Checklist');
    L.push('- [ ] `npm test` passes');
    L.push('- [ ] Folder name equals `id`; has `icon.png` (**still needed**), `README.md`, `author` (maker), `version`, `description`');
    L.push('- [ ] Optional: `summary` (max 140 characters), `contributors`');
    L.push('- [ ] `docs` links added (official first, then unofficial) and I opened each one (**still needed**)');
    L.push('- [ ] Bumped `version` if I changed an existing plugin (not applicable for a new plugin)');
    L.push('- [ ] Tested in NodeGSM: install -> start -> stop (or explain what I could not test)');
    L.push('- [x] No binaries or secrets; downloads come from the official source (nothing is downloaded by this plugin)');
    L.push('- [ ] `plugin.js` only if JSON can\'t do it (explain why): none included');
    L.push('');
    if ((info.todos || []).length) { L.push('## Not converted / needs a human'); info.todos.forEach((t) => L.push('- ' + oneLine(t, 300))); L.push(''); }
    if ((info.warnings || []).length) { L.push('## Converter warnings'); info.warnings.forEach((t) => L.push('- ' + oneLine(t, 300))); L.push(''); }
    L.push('## Tested on');
    L.push('Not tested yet.');
    return L.join('\n') + '\n';
  }

  // ------------------------------------------------------------------ main
  function convertCs(source, opts) {
    opts = opts || {};
    const res = { ok: false, errors: [], id: '', pluginJson: null, pluginJsonText: '', readmeText: '', warnings: [], todos: [], detected: {}, prBody: '' };
    const err = checkSource(source);
    if (err) { res.errors.push(err); return res; }
    const src = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const warnings = res.warnings, todos = res.todos;
    const warn = (s) => { if (!warnings.includes(s)) warnings.push(s); };
    const todo = (s) => { if (!todos.includes(s)) todos.push(s); };
    const taken = new Set((opts.existingIds ? [...opts.existingIds] : []).map(String));

    let toks;
    try { toks = lex(src); } catch (e) { res.errors.push('Could not read the file: ' + e.message); return res; }
    const classes = findClasses(toks);
    if (!classes.length) { res.errors.push('No C# class found: this does not look like a WindowsGSM plugin (expected "public class <Name>" with a "Plugin" metadata block).'); return res; }

    // pick the plugin class
    const info = classes.map((c) => {
      c.tokens = sub(toks, c.open + 1, c.close);
      c.members = {};
      for (const [a, b] of splitMembers(c.tokens, 0, c.tokens.length)) { const m = parseMember(c.tokens, a, b); if (m && !c.members[m.name]) c.members[m.name] = m; }
      const r = readMeta(src, c, c.members); c.meta = r.meta; c.hasMeta = r.found;
      c.score = (c.hasMeta ? 10 : 0) + (/^WindowsGSM\.Plugins/.test(c.namespace) ? 3 : 0) + (c.members.Start ? 1 : 0) + (c.bases.includes('SteamCMDAgent') ? 1 : 0) + (c.members.StartPath ? 1 : 0);
      return c;
    });
    const withMeta = info.filter((c) => c.hasMeta);
    if (!withMeta.length) { res.errors.push('No WindowsGSM plugin metadata found: expected a "public Plugin Plugin = new Plugin { name = ..., author = ... }" field in a class.'); return res; }
    const cls = withMeta.slice().sort((a, b) => b.score - a.score)[0];
    if (withMeta.length > 1) warn(`Several classes have Plugin metadata (${withMeta.map((c) => c.name).join(', ')}); converted "${cls.name}".`);
    const M = cls.members, meta = cls.meta;
    const val = (name) => (M[name] && M[name].expr ? evalConst(src, M[name].expr, M) : null);
    const detected = res.detected = { className: cls.name, namespace: cls.namespace, baseClass: cls.bases[0] || '', members: Object.keys(M).filter((k) => M[k].kind === 'method') };
    if (cls.namespace && !/^WindowsGSM\.Plugins/.test(cls.namespace)) warn(`Namespace is "${cls.namespace}" (WindowsGSM plugins use "WindowsGSM.Plugins").`);
    for (const k of Object.keys(meta)) if (k[0] === '_') warn(`Plugin.${k.slice(1)} is not a plain text value (${oneLine(meta[k], 80)}); left out.`);

    // --- listing
    const fullName = str(val('FullName'));
    const metaName = (meta.name || '').replace(/^WindowsGSM\./i, '');
    const pj = {};
    const id = (opts.id !== undefined && opts.id !== '') ? String(opts.id).trim() : suggestId([cls.name, fullName, metaName], taken);
    detected.suggestedId = suggestId([cls.name, fullName, metaName], taken);
    pj.$schema = '../plugin.schema.json';
    pj.id = id;
    pj.name = oneLine(opts.name || fullName || metaName || cls.name, 100);
    if (!fullName && !opts.name) warn('FullName was not found: the plugin name comes from Plugin.name / the class name.');
    const pick = (o, k, v) => (o !== undefined && o !== '' ? o : v);
    const description = oneLine(pick(opts.description, '', meta.description), 600);
    if (description) pj.description = description; else todo('Add a "description" (one or two sentences about the game and the server).');
    const author = oneLine(pick(opts.author, '', meta.author), 100);
    if (author) pj.author = author; else todo('Add an "author" (the maker of the plugin).');
    const version = semver(pick(opts.version, '', meta.version));
    if (version) pj.version = version; else { pj.version = '1.0.0'; warn('No version found in Plugin.version: set to 1.0.0.'); }
    if (meta.version && version && version !== meta.version.trim()) detected.versionNormalised = `${meta.version} -> ${version}`;
    const url = oneLine(pick(opts.url, '', meta.url), 300);
    if (url) { if (/^https?:\/\/\S+$/i.test(url)) pj.url = url; else warn('Plugin.url is not an http(s) link; left out.'); }
    if (meta.color) { const c = meta.color.trim(); const full = /^#[0-9a-fA-F]{3}$/.test(c) ? '#' + c.slice(1).split('').map((x) => x + x).join('') : c; if (/^#[0-9a-fA-F]{6}$/.test(full)) pj.color = full.toLowerCase(); else warn(`Plugin.color "${oneLine(c, 20)}" is not #RRGGBB; left out.`); }
    pj.media = { icon: 'icon.png', readme: 'README.md', screenshots: [] };
    todo('Add icon.png (square PNG, 64-256 px) next to plugin.json.');
    todo('Add "docs" links (official guides first, then unofficial ones) that you opened.');

    // --- install
    const appIdR = val('AppId'); const appId = str(appIdR);
    const isAgent = cls.bases.includes('SteamCMDAgent');
    detected.steamcmd = false;
    if (appId && /^\d+$/.test(appId)) { pj.install = { type: 'steamcmd', appId }; detected.steamcmd = true; detected.appId = appId; }
    else {
      if (isAgent || M.AppId) warn(isAgent ? 'The class extends SteamCMDAgent but AppId is empty or not a plain number: install set to "manual".' : 'AppId is not a plain number: install set to "manual".');
      pj.install = { type: 'manual' };
      if (!(M.Install && !trivial(M.Install.body))) todo('Installation is "manual": NodeGSM does not know how to download this server. Add install steps (steamcmd / download / extract) or a plugin.js install() hook, see PLUGINS.md.');
    }
    const loginAnon = val('loginAnonymous');
    detected.loginAnonymous = loginAnon ? loginAnon.v : undefined;

    // --- run
    pj.run = {};
    const sp = val('StartPath');
    let exe = opts.exe !== undefined && opts.exe !== '' ? String(opts.exe) : (sp && typeof sp.v === 'string' ? sp.v : '');
    if (!exe && M.StartPath && M.StartPath.expr && !sp) warn('StartPath is not a plain text value: set the executable by hand.');
    exe = exe.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '').trim();
    pj.run.exe = exe;
    detected.startPath = exe;
    const embed = val('AllowsEmbedConsole');
    if (embed && typeof embed.v === 'boolean') { pj.run.stdin = embed.v; detected.allowsEmbedConsole = embed.v; }
    else if (M.AllowsEmbedConsole) warn('AllowsEmbedConsole is not a plain true/false: run.stdin left out (NodeGSM default: true).');

    // Start(): FileName / WorkingDirectory / Arguments, only from literal expressions
    const start = M.Start && M.Start.body;
    let argsFound = false;
    if (!start) { warn('No Start() method found: run.args left out.'); }
    else {
      const { vars, conditional } = collectVars(start);
      const env = { vars, members: M, used: new Set() };
      const atomsOf = makeAtoms(src, env);
      const exprs = (key) => {
        const out = [];
        for (let k = 0; k < start.length; k++) if (isId(start[k], key) && isP(start[k + 1], '=')) {
          let j = k + 2; while (j < start.length && !isP(start[j], ',') && !isP(start[j], ';') && !isP(start[j], '}')) { if (opener(start[j]) && start[j].m > j) j = start[j].m; j++; }
          out.push(sub(start, k + 2, j));
        }
        return out;
      };
      const argExprs = exprs('Arguments');
      if (!argExprs.length) warn('Start() has no "Arguments = ..." assignment: run.args left out.');
      else {
        const results = argExprs.map((e) => { const notes = {}; const atoms = atomsOf(e, 0); return { e, notes, r: renderArgs(atoms, notes), atoms }; });
        const sig = (x) => JSON.stringify(x.r.args) + '|' + x.r.bad.join('|');
        const distinct = new Set(results.map(sig));
        const first = results[0];
        if (distinct.size > 1) warn('Start() assigns different Arguments in different branches (for example with / without the embedded console). Converted the first one; review run.args.');
        argsFound = true;
        if (first.r.args.length) pj.run.args = first.r.args;
        first.r.bad.forEach((b) => todo('Start() argument piece not converted (it uses C# code, not a plain value): `' + oneLine(b, 100) + '`. Write it as a run.args template or in a plugin.js args() hook.'));
        if (first.r.bad.length) warn('run.args is INCOMPLETE: ' + first.r.bad.length + ' piece(s) of the C# command line could not be converted (see the TODOs). Do not use it as is.');
        if (first.notes.rawParam) warn('{paramRaw} is used where the start parameters were glued to other text (ARK-style); check the result.');
        if (first.notes.grouped) warn('Flag + value pairs such as -port {port} were grouped as ["-port", "{port}"] so both are dropped when the value is empty.');
        const usedVars = [...env.used]; const touched = usedVars.filter((n) => conditional.has(n));
        if (touched.length) warn(`Start() changes ${touched.join(', ')} inside if/loops: run.args may be incomplete, review it.`);
        const hasOptional = first.atoms.some((a) => a.k === 'o') || usedVars.some((n) => (vars[n] || []).some((o) => (o.toks || []).some((t) => isP(t, '?'))));
        if (hasOptional) warn('Conditional parts (string.IsNullOrWhiteSpace(...) ? "" : ...) became optional parts: NodeGSM drops an argument when its placeholder is empty.');
        detected.argsSource = oneLine(text(src, first.e), 160);
      }
      // FileName: java etc.
      const fn = exprs('FileName')[0];
      if (fn) {
        const t = text(src, fn);
        const viaVar = fn.length === 1 && isId(fn[0]) && (vars[fn[0].v] || []).some((o) => text(src, o.toks).includes('JavaHelper'));
        if (/JavaHelper/.test(t) || viaVar) { pj.run.command = 'java'; warn('The server is started through Java: run.command is "java". NodeGSM does not install Java; users need it on the PATH (WindowsGSM downloaded a JRE for them).'); todo('Document the Java requirement in the README.'); }
        else { const c = evalConst(src, fn, M); if (c && typeof c.v === 'string' && c.v && c.v !== exe && /^[A-Za-z0-9._-]+$/.test(c.v)) { pj.run.command = c.v.replace(/\.exe$/i, ''); warn(`Start() runs "${c.v}" instead of StartPath: run.command set to "${pj.run.command}", check it.`); } }
      }
      const wd = exprs('WorkingDirectory')[0];
      if (wd) { const t = text(src, wd); if (/GetDirectoryName/.test(t) && exe.includes('/')) pj.run.workingDir = exe.slice(0, exe.lastIndexOf('/')); else if (!/^ServerPath\s*\.\s*GetServersServerFiles\s*\(\s*_?serverData\s*\.\s*ServerID\s*\)$/.test(t.replace(/Functions\./, ''))) warn('Start() sets a custom WorkingDirectory (`' + oneLine(t, 80) + '`): set run.workingDir by hand if the server needs it.'); }
    }
    if (!argsFound && start) detected.argsSource = '';

    // Stop(): obvious literal only
    if (M.Stop && M.Stop.body) {
      const b = M.Stop.body; let lit = null, window = null;
      for (let k = 0; k < b.length; k++) {
        if (isId(b[k], 'WriteLine') && isP(b[k + 1], '(') && b[k + 2] && b[k + 2].t === 'str' && !b[k + 2].interp && isP(b[k + 3], ')')) lit = lit === null ? b[k + 2].v : lit;
        if (isId(b[k], 'SendMessageToMainWindow') || isId(b[k], 'SendWaitToMainWindow')) { const arg = (b.slice(k).find((t, q) => q > 0 && t.t === 'str')); if (arg && !arg.interp) window = window === null ? arg.v : window; }
      }
      const stopLit = lit !== null ? lit : window;
      if (lit !== null && pj.run.stdin !== false && lit.trim() && !/[\u0000-\u001F]/.test(lit)) { pj.run.stopCommand = lit.trim(); detected.stopCommand = lit.trim(); }
      else if (stopLit !== null) { detected.stopWindowKeys = stopLit; warn(`Stop() sends "${oneLine(stopLit, 30)}" to the server window, which only works with WindowsGSM's window handling: run.stopCommand left out (NodeGSM stops the process itself).`); }
      else if (!trivial(b) && !mentions(b, /^Kill$/)) warn('Stop() has logic that is not a plain console command: run.stopCommand left out.');
    }

    // --- defaults
    const defaults = {};
    const portVal = (key, name) => { const v = str(val(name)); if (v === null || v === '') return; if (/^\d{1,6}$/.test(v.trim())) defaults[key] = v.trim(); else warn(`${name} "${oneLine(v, 30)}" is not a number: left out.`); };
    portVal('port', 'Port'); portVal('queryPort', 'QueryPort');
    const mp = str(val('Maxplayers')); if (mp) { if (/^\d{1,6}$/.test(mp.trim())) defaults.maxPlayers = mp.trim(); else warn(`Maxplayers "${oneLine(mp, 30)}" is not a number: left out.`); }
    const dm = str(val('Defaultmap')); if (dm) defaults.map = oneLine(dm, 200);
    const ad = str(val('Additional')); if (ad) defaults.additional = oneLine(ad, 300);
    const pi = val('PortIncrements'); if (pi && Number.isInteger(pi.v) && pi.v >= 1 && pi.v <= 100) defaults.portIncrement = pi.v; else if (M.PortIncrements && !pi) warn('PortIncrements is not a plain number: left out.');
    if (Object.keys(defaults).length) pj.defaults = defaults;
    ['Port', 'Maxplayers', 'Defaultmap', 'Additional', 'QueryPort'].forEach((n) => { if (M[n] && M[n].expr && !val(n)) warn(`${n} is not a plain value: left out.`); });

    // --- query
    const qm = val('QueryMethod');
    if (qm && qm.isNew) { const q = QUERIES[String(qm.v.type).toLowerCase()]; if (q) { pj.query = q; detected.query = q; } else warn(`QueryMethod "new ${qm.v.type}()" has no NodeGSM equivalent (a2s, ut3, fivem): left out.`); }
    else if (qm && qm.isNull) detected.query = null;
    else if (M.QueryMethod) warn('QueryMethod is not "null" or "new A2S()/UT3()/FIVEM()": left out.');

    // --- gslt / login
    const startText = start ? text(src, start) : '';
    const usesGslt = /ServerGSLT/.test(startText) || /GSLT/i.test(text(src, M.CreateServerCFG && M.CreateServerCFG.body || []));
    if (usesGslt) { pj.gslt = true; detected.gslt = true; }
    if (loginAnon && loginAnon.v === false) {
      if (usesGslt) detected.gslt = true;
      else warn('loginAnonymous is false: the game server needs a Steam account to download. NodeGSM installs with an anonymous SteamCMD login only, so installing this will probably fail.');
    }

    // --- everything that is real code: report, never guess
    const sc = detected.steamcmd;
    const refSteam = (b) => mentions(b, /^SteamCMD$/);
    const extra = (b) => mentions(b, /^(File|Directory|WebClient|HttpClient|DownloadFile|DownloadFileTaskAsync|DownloadStringTaskAsync|WriteAllText|ZipFile)$/);
    const custom = (name, b, hook) => {
      if (!b || trivial(b)) return;
      if (sc && refSteam(b) && !extra(b)) return; // plain SteamCMD install / update
      detected.customMethods = (detected.customMethods || []).concat(name);
      const urls = urlsIn(b);
      todo(`${name}() has custom code (${oneLine([mentions(b, /^(WebClient|HttpClient|DownloadFile|DownloadFileTaskAsync|DownloadStringTaskAsync)$/) ? 'HTTP download' : '', mentions(b, /^(File|Directory|WriteAllText)$/) ? 'file writes' : '', mentions(b, /^(UI|CreateYesNoPromptV1)$/) ? 'user prompt' : ''].filter(Boolean).join(', ') || 'logic', 60)}) which cannot be converted automatically. ${hook}${urls.length ? ' URLs it uses: ' + urls.join(' ') : ''}`);
    };
    custom('Install', M.Install && M.Install.body, 'Use install steps (download / extract / write) or a plugin.js install(h) hook, see PLUGINS.md.');
    if (M.Update && M.Update.body && !(M.Install && M.Update.body.length === M.Install.body.length)) custom('Update', M.Update.body, 'Updates re-run the install steps in NodeGSM; for a version check add plugin.js latest(h) / local(dir).');
    if (!sc) {
      custom('GetRemoteBuild', M.GetRemoteBuild && M.GetRemoteBuild.body, 'Add a plugin.js latest(h) hook that returns the newest version.');
      custom('GetLocalBuild', M.GetLocalBuild && M.GetLocalBuild.body, 'Add a plugin.js local(dir) hook that returns the installed version.');
    }
    if (M.CreateServerCFG && !trivial(M.CreateServerCFG.body)) {
      const files = filesIn(M.CreateServerCFG.body);
      detected.customMethods = (detected.customMethods || []).concat('CreateServerCFG');
      todo('CreateServerCFG() writes default config files' + (files.length ? ' (' + files.join(', ') + ')' : '') + ': recreate them with an install "write" step using {name} {port} {queryPort} {map} {maxPlayers}, or as configs[] with a templates/ file.');
    }
    const all = cls.tokens;
    if (mentions(all, /^JavaHelper$/) && !pj.run.command) { warn('The plugin uses JavaHelper (Java): check whether run.command "java" is needed.'); }
    if (mentions(all, /^(CreateYesNoPromptV1|CreateYesNoPrompt)$/)) warn('The plugin asks the user a question (for example to accept an EULA). NodeGSM plugins cannot prompt: say so in the README or write the agreement file in an install step.');
    if (all.some((t) => (t.t === 'id' && /^(rcon|getrcon|[a-z]*rcon(password|port|client))/i.test(t.v)) || (t.t === 'str' && (t.parts || []).some((p) => /(^|[^a-z])rcon([^a-z]|$)|getrcon/i.test(p.s || p.e || ''))))) warn('The plugin refers to RCON: add consoles[] of type "rcon" (source "rcon:<port>:<password>") by hand, see PLUGINS.md.');
    if (mentions(all, /^(Registry|WindowsFirewall)$/)) warn('The plugin touches the Windows registry / firewall: NodeGSM has no equivalent in plugin.json.');
    detected.name = pj.name; detected.author = pj.author || ''; detected.originalAuthor = meta.author || '';
    detected.defaults = pj.defaults || {}; detected.stdin = pj.run.stdin; detected.args = pj.run.args || null;

    // --- validate + assemble
    const errors = res.errors;
    if (!exe) errors.push(M.StartPath ? 'No server executable found: StartPath is empty or not a plain value. Enter it in the "executable" field.' : 'StartPath is not declared in this class (it may be inherited from a WindowsGSM engine class). Enter the server executable in the "executable" field.');
    if (!ID_RE.test(id)) errors.push('"id" must be 2-32 chars of a-z 0-9 _ - (starting with a letter or digit).');
    else if (taken.has(id)) errors.push(`A plugin with the id "${id}" already exists: pick another id.`);
    validatePluginJson(pj).forEach((m) => { if (!errors.includes(m) && !(m.startsWith('"id"') && errors.some((x) => x.startsWith('"id"'))) && !(m.startsWith('"run.exe"') && !exe)) errors.push(m); });

    // key order like the template
    const runOrder = {}; ['exe', 'command', 'workingDir', 'args', 'stdin', 'stopCommand'].forEach((k) => { if (pj.run[k] !== undefined) runOrder[k] = pj.run[k]; }); pj.run = runOrder;
    const order = ['$schema', 'id', 'name', 'description', 'author', 'version', 'url', 'color', 'media', 'install', 'run', 'defaults', 'query', 'gslt'];
    const out = {}; order.forEach((k) => { if (pj[k] !== undefined) out[k] = pj[k]; });
    res.id = id; res.pluginJson = out;
    res.pluginJsonText = JSON.stringify(out, null, 2) + '\n';
    const ctx = { className: cls.name, originalAuthor: meta.author, todos, warnings, automated: !!opts.automated };
    res.readmeText = buildReadme(out, ctx);
    res.prBody = buildPrBody(out, ctx);
    res.ok = errors.length === 0;
    return res;
  }

  // ------------------------------------------------------------------ tiny zip writer (stored, no compression)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  const utf8 = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Uint8Array.from(Buffer.from(s, 'utf8')));
  /** files: { 'folder/name.ext': 'text' } -> Uint8Array of a .zip */
  function makeZip(files) {
    const parts = []; const central = []; let offset = 0;
    const u16 = (n) => [n & 255, (n >>> 8) & 255]; const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    for (const [name, content] of Object.entries(files)) {
      const nb = utf8(name), data = utf8(content), crc = crc32(data);
      const local = Uint8Array.from([0x50, 0x4B, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), 0, 0]);
      parts.push(local, nb, data);
      central.push(Uint8Array.from([0x50, 0x4B, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(offset)]), nb);
      offset += local.length + nb.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0); const n = Object.keys(files).length;
    const end = Uint8Array.from([0x50, 0x4B, 5, 6, 0, 0, 0, 0, ...u16(n), ...u16(n), ...u32(cdSize), ...u32(offset), 0, 0]);
    const all = [...parts, ...central, end]; const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0;
    all.forEach((b) => { out.set(b, p); p += b.length; });
    return out;
  }

  return { convertCs, checkSource, validatePluginJson, buildReadme, buildPrBody, makeZip, slugify, LIMITS, ID_RE, PLACEHOLDERS: PH };
});
