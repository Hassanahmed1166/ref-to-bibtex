/**
 * bibtex.js — turns a normalised entry into valid, LaTeX-safe BibTeX.
 */
(function (root) {
  'use strict';
  const AC = root.AC = root.AC || {};

  // ── Cleaning text that comes back from APIs ───────────────────────────────
  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...' };
  function cleanText(s) {
    return String(s == null ? '' : s)
      .replace(/<\/?(?:i|b|em|strong|sub|sup|scp|mml:[^>]*|jats:[^>]*|p|span|u|br)\b[^>]*>/gi, '')
      .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
        if (e[0] === '#') { const c = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return c ? String.fromCodePoint(c) : m; }
        return ENTITIES[e.toLowerCase()] ?? m;
      })
      .replace(/\s+/g, ' ').trim();
  }

  // ── LaTeX escaping ────────────────────────────────────────────────────────
  const escapeLatex = s => s.replace(/([&%$#_])/g, '\\$1');
  const SMALL_ACRONYM = /^[A-Z0-9][A-Za-z0-9-]*[A-Z0-9]$|^[a-z]+[A-Z]\w*$/;

  /** Protect acronyms / camelCase from BibTeX's sentence-casing: UAV -> {UAV}. */
  function protectCaps(s) {
    return s.split(/(\s+)/).map(w => {
      const core = w.replace(/^[("'\[]+|[)"'\],.:;?!]+$/g, '');
      if (core.length >= 2 && /[A-Z].*[A-Z]|^[a-z]+[A-Z]/.test(core) && /^[A-Za-z0-9\\&-]+$/.test(core.replace(/\\/g, '')) && !/^\{/.test(core))
        return w.replace(core, `{${core}}`);
      return w;
    }).join('');
  }

  // ── Keys ──────────────────────────────────────────────────────────────────
  const KEY_STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'for', 'and', 'to', 'with', 'from', 'is', 'are', 'via', 'its', 'new', 'using', 'toward', 'towards', 'at', 'by']);
  function makeCiteKey(entry, style) {
    const first = (entry.authors && entry.authors[0]) || '';
    const last = AC.normWord(first === 'others' ? '' : AC.familyName(first)) || 'unknown';
    const year = entry.year || 'nd';
    if (style === 'authoryear') return `${last}${year}`;
    const w = (entry.title || entry.booktitle || '').split(/\s+/).map(AC.normWord).find(x => x.length > 2 && !KEY_STOP.has(x)) || 'ref';
    return `${last}${year}${w}`;
  }
  /** Makes keys unique across a list: smith2020deep, smith2020deepb, ... */
  function uniqueKeys(entries, style) {
    const seen = new Map();
    return entries.map(e => {
      const base = makeCiteKey(e, style);
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      return n === 0 ? base : base + (n < 26 ? String.fromCharCode(97 + n) : n);
    });
  }

  // ── Entry -> text ─────────────────────────────────────────────────────────
  const FIELD_ORDER = {
    article: ['author', 'title', 'journal', 'year', 'volume', 'number', 'pages', 'publisher', 'doi', 'url'],
    inproceedings: ['author', 'title', 'booktitle', 'year', 'editor', 'pages', 'publisher', 'organization', 'doi', 'url'],
    incollection: ['author', 'title', 'booktitle', 'year', 'editor', 'pages', 'publisher', 'address', 'doi', 'url'],
    book: ['author', 'title', 'publisher', 'address', 'year', 'doi', 'url'],
    techreport: ['author', 'title', 'publisher', 'year', 'doi', 'url'],
    phdthesis: ['author', 'title', 'publisher', 'year', 'doi', 'url'],
    misc: ['author', 'title', 'journal', 'booktitle', 'year', 'volume', 'number', 'pages', 'publisher', 'note', 'eprint', 'archiveprefix', 'doi', 'url']
  };
  const FIELD_MAP = { journal: 'journal', archiveprefix: 'archivePrefix' };
  const RAW_FIELDS = new Set(['doi', 'url', 'eprint', 'archiveprefix', 'year', 'volume', 'number']);
  const TITLE_FIELDS = new Set(['title', 'journal', 'booktitle']);

  /** Returns [[field, value], ...] — shared by the text writer and the side-by-side viewer. */
  function entryFields(entry, opts = {}) {
    const type = FIELD_ORDER[entry.type] ? entry.type : 'misc';
    const e = Object.assign({}, entry);
    e.author = (entry.authors || []).join(' and ');
    if (entry.arxiv) { e.eprint = entry.arxiv; e.archiveprefix = 'arXiv'; }
    if (entry.doi && !e.url && type === 'misc') e.url = '';
    const out = [];
    for (const f of FIELD_ORDER[type]) {
      let v = e[f];
      if (v == null || !String(v).trim()) continue;
      v = String(v).trim();
      if (f === 'pages') v = v.replace(/\s*[-–—]+\s*/g, '--');
      if (!RAW_FIELDS.has(f)) {
        v = cleanText(v);
        v = escapeLatex(v);
        if (TITLE_FIELDS.has(f) && opts.protectCaps !== false) v = protectCaps(v);
      }
      out.push([FIELD_MAP[f] || f, v]);
    }
    return out;
  }

  function entryToBibtex(entry, key, opts) {
    const fields = entryFields(entry, opts);
    const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n');
    const type = FIELD_ORDER[entry.type] ? entry.type : 'misc';
    return `@${type}{${key || makeCiteKey(entry)},\n${body}\n}`;
  }

  AC.bibtex = { cleanText, escapeLatex, protectCaps, makeCiteKey, uniqueKeys, entryFields, entryToBibtex };
  if (typeof module !== 'undefined' && module.exports) module.exports = AC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
