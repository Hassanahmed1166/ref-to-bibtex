/**
 * lookup.js — Crossref / OpenAlex / Semantic Scholar clients and the resolver
 * that picks the best-matching record for one parsed reference.
 */
(function (root) {
  'use strict';
  const AC = root.AC = root.AC || {};

  const config = AC.config = Object.assign({
    mailto: '',                                   // optional: puts requests in the "polite" pool of Crossref/OpenAlex
    providers: { crossref: true, openalex: true, semantic: true },
    concurrency: 3,
    strictness: 'normal'                          // lenient | normal | strict
  }, AC.config);

  const THRESHOLDS = { lenient: { ok: 0.68, review: 0.42 }, normal: { ok: 0.75, review: 0.5 }, strict: { ok: 0.85, review: 0.6 } };
  const thresholds = () => THRESHOLDS[config.strictness] || THRESHOLDS.normal;

  // Circuit breaker: after 3 straight failures a host is skipped for a minute instead of slowing every reference.
  const health = {};
  const HOST_OF = { crossref: 'api.crossref.org', openalex: 'api.openalex.org', semantic: 'api.semanticscholar.org' };
  const tripped = host => health[host] && health[host].fails >= 3 && Date.now() - health[host].at < 60000;
  function record(host, ok) { const h = health[host] || (health[host] = { fails: 0, at: 0 }); if (ok) h.fails = 0; else { h.fails++; h.at = Date.now(); } }

  // ── HTTP with timeout, retry/back-off, per-host spacing and a cache ──────
  const cache = new Map();
  const gates = {};
  const SPACING = { 'api.semanticscholar.org': 1100, 'api.crossref.org': 120, 'api.openalex.org': 120 };
  const sleep = (ms, signal) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

  function gate(host, signal) {                    // serialises request *starts* per host
    const gap = SPACING[host] || 0;
    const prev = gates[host] || Promise.resolve();
    const next = prev.then(() => sleep(gap, signal)).catch(() => {});
    gates[host] = next;
    return prev.catch(() => {});
  }

  /** @returns {{ok:boolean, status:number, data:any, error:string}} — never throws except on abort */
  async function http(url, signal, { timeout = 12000, retries = 2 } = {}) {
    if (cache.has(url)) return cache.get(url);
    const host = new URL(url).host;
    let last = { ok: false, status: 0, data: null, error: 'network' };
    for (let attempt = 0; attempt <= retries; attempt++) {
      await gate(host, signal);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      const onAbort = () => ctl.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
        if (res.ok) {
          const out = { ok: true, status: res.status, data: await res.json(), error: '' };
          cache.set(url, out); record(host, true);
          return out;
        }
        last = { ok: false, status: res.status, data: null, error: res.status === 404 ? 'not-found' : res.status === 429 ? 'rate-limited' : `http-${res.status}` };
        if (res.status === 404 || (res.status >= 400 && res.status < 500 && res.status !== 429)) return last;
      } catch (e) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        last = { ok: false, status: 0, data: null, error: ctl.signal.aborted ? 'timeout' : 'network' };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
      if (attempt < retries) await sleep(800 * 2 ** attempt, signal);
    }
    if (last.error !== 'not-found') record(host, false);
    return last;
  }

  // ── Normalising provider records ──────────────────────────────────────────
  const clean = AC.bibtex.cleanText;
  const yr = v => (v == null ? '' : String(v));
  const baseCand = (source) => ({ source, type: 'misc', authors: [], title: '', journal: '', booktitle: '', publisher: '', year: '', volume: '', number: '', pages: '', address: '', editor: '', note: '', doi: '', arxiv: '', url: '' });

  function crossrefToCand(item) {
    const TYPE = { 'journal-article': 'article', book: 'book', 'book-chapter': 'incollection', 'proceedings-article': 'inproceedings', monograph: 'book', 'edited-book': 'book', 'reference-book': 'book', report: 'techreport', dissertation: 'phdthesis', 'posted-content': 'misc' };
    const c = baseCand('crossref');
    const container = clean(item['container-title']?.[0] || '');
    c.type = TYPE[item.type] || (item.volume || item.issue ? 'article' : 'misc');
    const person = a => a.family ? `${clean(a.family)}, ${clean(a.given || '')}`.replace(/, $/, '') : a.name ? `{${clean(a.name)}}` : clean(a.given || '');
    c.authors = (item.author || []).map(person).filter(Boolean);
    c.editor = (item.editor || []).map(person).join(' and ');
    c.title = clean([item.title?.[0], item.subtitle?.[0]].filter(Boolean).join(': ').replace(/^(.+): \1$/, '$1'));
    const issued = item.issued || item.published || item['published-print'] || item['published-online'];
    c.year = yr(issued?.['date-parts']?.[0]?.[0]);
    if (c.type === 'article') c.journal = container;
    else if (c.type === 'inproceedings' || c.type === 'incollection') c.booktitle = container || clean(item.event?.name || '');
    else if (container) c.journal = container;
    c.publisher = clean(item.publisher || '');
    c.volume = item.volume || ''; c.number = item.issue || ''; c.pages = (item.page || '').replace(/--?/g, '-');
    c.doi = (item.DOI || '').toLowerCase();
    return c;
  }

  function splitName(display) {
    return AC.personToBib(clean(display));
  }
  function openalexToCand(w) {
    const TYPE = { article: 'article', 'journal-article': 'article', book: 'book', 'book-chapter': 'incollection', 'proceedings-article': 'inproceedings', report: 'techreport', dissertation: 'phdthesis', preprint: 'misc' };
    const c = baseCand('openalex');
    const src = w.primary_location?.source;
    const srcName = clean(src?.display_name || '');
    c.type = TYPE[w.type] || (src?.type === 'journal' ? 'article' : src?.type === 'conference' ? 'inproceedings' : 'misc');
    if (w.type === 'article' && src?.type === 'conference') c.type = 'inproceedings';
    if (w.type === 'article' && src?.type === 'repository') c.type = 'misc';
    c.authors = (w.authorships || []).map(a => splitName(a.author?.display_name || '')).filter(Boolean);
    c.title = clean(w.title || w.display_name || '');
    c.year = yr(w.publication_year);
    if (c.type === 'article' || (c.type === 'misc' && srcName)) c.journal = srcName; else c.booktitle = srcName;
    c.publisher = clean(src?.host_organization_name || '');
    c.volume = w.biblio?.volume || ''; c.number = w.biblio?.issue || '';
    c.pages = [w.biblio?.first_page, w.biblio?.last_page].filter(Boolean).join('-');
    c.doi = (w.doi || '').replace(/^https?:\/\/doi\.org\//i, '').toLowerCase();
    return c;
  }

  function semanticToCand(p) {
    const c = baseCand('semantic');
    const t = p.publicationTypes || [];
    const venue = clean(p.journal?.name || p.venue || p.publicationVenue?.name || '');
    if (t.includes('JournalArticle')) c.type = 'article';
    else if (t.includes('Conference')) c.type = 'inproceedings';
    else if (t.includes('Book')) c.type = 'book';
    else if (t.includes('BookSection')) c.type = 'incollection';
    else if (p.journal?.name) c.type = 'article';
    else if (/conference|proceedings|workshop|symposium/i.test(venue)) c.type = 'inproceedings';
    else c.type = 'misc';
    c.authors = (p.authors || []).map(a => splitName(a.name || '')).filter(Boolean);
    c.title = clean(p.title || '');
    c.year = yr(p.year);
    if (c.type === 'article' || c.type === 'misc') c.journal = venue; else c.booktitle = venue;
    c.volume = p.journal?.volume || ''; c.pages = (p.journal?.pages || '').replace(/--?/g, '-');
    c.doi = (p.externalIds?.DOI || '').toLowerCase();
    c.arxiv = p.externalIds?.ArXiv || '';
    return c;
  }

  // ── Provider calls (each returns {cands, error}) ─────────────────────────
  const q = encodeURIComponent;
  const mail = () => config.mailto ? `&mailto=${q(config.mailto)}` : '';
  const SS_FIELDS = 'title,authors,year,venue,journal,externalIds,publicationTypes,publicationVenue';
  const CR_SELECT = 'DOI,title,subtitle,author,issued,published,container-title,volume,issue,page,publisher,type,editor,event';

  const wrap = (res, map) => res.ok ? { cands: map(res.data), error: '' } : { cands: [], error: res.status === 404 ? '' : res.error };

  const providers = {
    crossref: {
      label: 'Crossref',
      byDOI: async (doi, s) => wrap(await http(`https://api.crossref.org/works/${q(doi)}${mail().replace('&', '?')}`, s), d => d.message ? [crossrefToCand(d.message)] : []),
      search: async (text, s, kind) => {
        const yr = text.year ? `&filter=from-pub-date:${text.year},until-pub-date:${text.year}` : '';
        const param = kind === 'title' ? `query.title=${q(text.title)}${text.author ? `&query.author=${q(text.author)}` : ''}`
                    : kind === 'year' ? `query.bibliographic=${q((text.title || text.raw).slice(0, 300) + ' ' + text.author)}${yr}`
                    : `query.bibliographic=${q(text.raw.slice(0, 300))}`;
        return wrap(await http(`https://api.crossref.org/works?${param}&rows=5&select=${CR_SELECT}${mail()}`, s), d => (d.message?.items || []).map(crossrefToCand));
      }
    },
    openalex: {
      label: 'OpenAlex',
      byDOI: async (doi, s) => wrap(await http(`https://api.openalex.org/works/doi:${q(doi)}${mail().replace('&', '?')}`, s), d => d.id ? [openalexToCand(d)] : []),
      search: async (text, s, kind) => wrap(await http(`https://api.openalex.org/works?search=${q(kind === 'raw' ? text.raw.slice(0, 250) : text.title || text.raw.slice(0, 250))}${kind === 'year' && text.year ? `&filter=publication_year:${text.year}` : ''}&per-page=5${mail()}`, s), d => (d.results || []).map(openalexToCand))
    },
    semantic: {
      label: 'Semantic Scholar',
      byDOI: async (doi, s) => wrap(await http(`https://api.semanticscholar.org/graph/v1/paper/DOI:${q(doi)}?fields=${SS_FIELDS}`, s, { retries: 1 }), d => d.paperId ? [semanticToCand(d)] : []),
      byArxiv: async (id, s) => wrap(await http(`https://api.semanticscholar.org/graph/v1/paper/ARXIV:${q(id)}?fields=${SS_FIELDS}`, s, { retries: 1 }), d => d.paperId ? [semanticToCand(d)] : []),
      search: async (text, s, kind) => wrap(await http(`https://api.semanticscholar.org/graph/v1/paper/search?query=${q(kind === 'title' ? text.title : text.raw.slice(0, 250))}&limit=5&fields=${SS_FIELDS}`, s, { retries: 1 }), d => (d.data || []).map(semanticToCand))
    }
  };

  // ── Resolver ──────────────────────────────────────────────────────────────
  const enabled = () => Object.keys(providers).filter(k => config.providers[k] && !tripped(HOST_OF[k]));

  /**
   * Resolves one parsed reference.
   * @returns {Promise<{entry, status, score, source, candidates, flags, errors, detail}>}
   *   status: verified | review | notfound | error
   */
  async function resolveReference(parsed, signal, onStatus = () => {}) {
    const on = enabled();
    const errors = {};
    const note = (name, r) => { if (r.error) errors[name] = r.error; return r.cands; };
    const pool = [];                                            // {cand, s:{score...}, via}
    const add = (cands, via) => {
      for (const c of cands) {
        if (!c.title) continue;
        const id = AC.normWord(c.title) + c.year + AC.normWord(AC.familyName(c.authors[0] || ''));
        const sc = AC.match.scoreCandidate(parsed, c);
        const ex = pool.find(p => p.id === id);
        if (ex) { mergeInto(ex.cand, c); ex.s = AC.match.scoreCandidate(parsed, ex.cand); continue; }
        pool.push({ id, cand: c, s: sc, via });
      }
    };
    const best = () => pool.slice().sort((a, b) => b.s.score - a.s.score)[0];
    const good = () => { const b = best(); return !!b && b.s.score >= thresholds().ok && b.s.year !== 0; };
    const flags = [];
    const callAll = (fnName, arg, kind) => Promise.all(on.filter(n => providers[n][fnName]).map(async n => note(providers[n].label, await providers[n][fnName](arg, signal, kind))));
    const queryText = { raw: parsed.raw, title: parsed.title, year: parsed.year, author: parsed.authors[0] && parsed.authors[0] !== 'others' ? AC.familyName(parsed.authors[0]) : '' };

    let doiRecords = [];
    if (parsed.doi) {
      onStatus('DOI found — looking it up…');
      doiRecords = (await callAll('byDOI', parsed.doi)).flat();
      add(doiRecords, 'doi');
    }
    if (parsed.arxiv && !pool.length && providers.semantic && on.includes('semantic')) {
      onStatus('arXiv id found — looking it up…');
      add(note('Semantic Scholar', await providers.semantic.byArxiv(parsed.arxiv, signal)), 'arxiv');
    }
    if (!good()) {
      onStatus('Searching Crossref and OpenAlex…');
      const fast = on.filter(n => n !== 'semantic');
      const res = await Promise.all(fast.map(async n => note(providers[n].label, await providers[n].search(queryText, signal, 'raw'))));
      res.forEach(c => add(c, 'raw'));
    }
    if (!good() && parsed.title.length > 8) {
      onStatus('Searching by title and first author…');
      const fast = on.filter(n => n !== 'semantic');
      const res = await Promise.all(fast.map(async n => note(providers[n].label, await providers[n].search(queryText, signal, 'title'))));
      res.forEach(c => add(c, 'title'));
    }
    if (!good() && parsed.year && parsed.title.length > 8) {
      onStatus(`Searching ${parsed.year} publications…`);
      const fast = on.filter(n => n !== 'semantic');
      const res = await Promise.all(fast.map(async n => note(providers[n].label, await providers[n].search(queryText, signal, 'year'))));
      res.forEach(c => add(c, 'year'));
    }
    if (!good() && on.includes('semantic')) {
      onStatus('Trying Semantic Scholar…');
      add(note('Semantic Scholar', await providers.semantic.search(queryText, signal, parsed.title.length > 8 ? 'title' : 'raw')), 'semantic');
    }

    const rank = p => p.s.score + (p.cand.type !== 'misc' ? 0.01 : 0) + (p.cand.pages || p.cand.volume ? 0.005 : 0);
    const ranked = pool.slice().sort((a, b) => rank(b) - rank(a));
    const top = ranked[0];
    const th = thresholds();

    // A reference that is nothing but a DOI has nothing to compare against: trust the DOI.
    const bareDoi = parsed.doi && parsed.raw.replace(/https?:\/\/\S+|doi:?|10\.\d{4,9}\/\S+/gi, '').replace(/[\s\W]/g, '').length < 8;
    if (bareDoi && doiRecords.length) {
      const d = doiRecords[0];
      const entry = await enrich(d, ranked, parsed, signal, note, on);
      entry.raw = parsed.raw;
      return { entry, status: 'verified', score: 1, source: d.source, candidates: [{ cand: d, score: 1 }], via: 'doi', errors,
        flags: [{ level: 'info', text: 'Resolved from the DOI alone — there was no other text to compare, so check the title yourself.' }] };
    }
    // DOI sanity: it resolved, but to something that is not what was pasted.
    if (parsed.doi) {
      if (!doiRecords.length) {
        if (Object.keys(errors).length < on.length) flags.push({ level: 'warn', text: `DOI ${parsed.doi} was not found in ${on.map(n => providers[n].label).join(' / ')}` });
      } else {
        const d = doiRecords[0], ds = AC.match.scoreCandidate(parsed, d);
        if (ds.score < th.review) flags.push({ level: 'bad', text: `The DOI resolves to a different paper: "${d.title}" (${d.year}) — it does not match this reference` });
      }
    }

    const allFailed = (on.length === 0 || Object.keys(errors).length >= on.length) && !pool.length;
    let status = 'notfound', entry = parsed, score = 0, source = 'local';
    if (allFailed) status = 'error';
    else if (top && top.s.score >= th.review) {
      status = top.s.score >= th.ok ? 'verified' : 'review';
      entry = await enrich(top.cand, ranked, parsed, signal, note, on);
      entry.raw = parsed.raw;
      score = top.s.score; source = top.cand.source;
      const s = top.s;
      if (s.title < 0.6) flags.push({ level: 'warn', text: `Title only ${Math.round(s.title * 100)}% similar to your text` });
      if (s.authors !== null && s.authors < 0.5) flags.push({ level: 'warn', text: 'Authors in the database record are mostly absent from your reference' });
      if (s.year === 0) flags.push({ level: 'warn', text: `Year differs: your text says ${parsed.year}, record says ${top.cand.year}` });
      if (status === 'verified' && (flags.some(f => f.level === 'bad') || s.year === 0 || s.title < 0.6 || s.authors === 0)) status = 'review';
    } else if (top) score = top.s.score;
    if (status === 'notfound' || status === 'error') {
      entry = Object.assign({}, parsed);
      if (status === 'notfound') flags.push({ level: 'warn', text: 'No database record matched this reference. It may be a book, report, web page or an unindexed source — or it may not exist.' });
      if (status === 'error') flags.push({ level: 'warn', text: 'Could not reach the lookup services (' + Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(', ') + '). Check your connection and retry.' });
    }
    for (const t of AC.match.redFlags(entry, parsed)) flags.push({ level: 'info', text: t });
    for (const [k, v] of Object.entries(errors)) if (status !== 'error') flags.push({ level: 'info', text: `${k} did not respond (${v === 'network' ? 'network error or rate limit' : v}) — results may be incomplete` });

    const candidates = ranked.slice(0, 4).map(p => ({ cand: p.cand, score: p.s.score }));
    return { entry, status, score, source, candidates, flags, errors, via: top?.via || '' };
  }

  function mergeInto(a, b) {
    for (const k of Object.keys(b)) if ((a[k] === '' || a[k] == null || (Array.isArray(a[k]) && !a[k].length)) && b[k] && b[k].length !== 0) a[k] = b[k];
  }

  /** Fill gaps (issue, pages, publisher…) from Crossref when the best record came from elsewhere. */
  async function enrich(cand, ranked, parsed, signal, note, on) {
    const out = Object.assign({}, cand, { authors: cand.authors.slice() });
    for (const p of ranked) if (p.cand !== cand && p.cand.doi && p.cand.doi === cand.doi) mergeInto(out, p.cand);
    if (out.doi && cand.source !== 'crossref' && on.includes('crossref') && (!out.pages || !out.number || !out.publisher)) {
      const r = note('Crossref', await providers.crossref.byDOI(out.doi, signal));
      if (r[0] && AC.match.exactTitle(r[0].title, out.title) || (r[0] && AC.match.jaccard(AC.match.tokens(r[0].title), AC.match.tokens(out.title)) > 0.8)) {
        const cr = r[0];
        for (const k of ['pages', 'number', 'volume', 'publisher', 'editor']) if (!out[k] && cr[k]) out[k] = cr[k];
        if (cr.type !== 'misc' && out.type === 'misc') { out.type = cr.type; out.journal = out.journal || cr.journal; out.booktitle = out.booktitle || cr.booktitle; }
      }
    }
    if (!out.arxiv && parsed.arxiv) out.arxiv = parsed.arxiv;
    return out;
  }

  /**
   * Resolve many references with limited concurrency. Results keep input order.
   * callbacks: onUpdate(i, {state, message}), onDone(i, result), onProgress(done,total)
   */
  async function resolveAll(parsedList, signal, cb = {}) {
    const results = new Array(parsedList.length);
    let next = 0, done = 0;
    async function worker() {
      while (next < parsedList.length) {
        const i = next++;
        if (signal?.aborted) return;
        cb.onUpdate?.(i, 'fetching', 'Starting…');
        try {
          results[i] = await resolveReference(parsedList[i], signal, m => cb.onUpdate?.(i, 'fetching', m));
        } catch (e) {
          if (e.name === 'AbortError') return;
          results[i] = { entry: parsedList[i], status: 'error', score: 0, source: 'local', candidates: [], flags: [{ level: 'warn', text: 'Unexpected error: ' + e.message }], errors: {}, via: '' };
        }
        cb.onDone?.(i, results[i]);
        cb.onProgress?.(++done, parsedList.length);
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(config.concurrency, parsedList.length)) }, worker));
    return results;
  }

  AC.lookup = { providers, resolveReference, resolveAll, thresholds, crossrefToCand, openalexToCand, semanticToCand, clearCache: () => cache.clear() };
  if (typeof module !== 'undefined' && module.exports) module.exports = AC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
