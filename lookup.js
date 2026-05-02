/**
 * lookup.js
 * Fetches rich BibTeX metadata from Crossref → Semantic Scholar → local parser
 */

// ── Crossref ────────────────────────────────────────────────────────────────

async function lookupCrossref(title, year, authors) {
  try {
    // Build a query: title + first author last name + year
    const firstAuthorLast = (authors[0] || '').split(/\s+/).pop();
    const q = [title, firstAuthorLast, year].filter(Boolean).join(' ');
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=3&select=DOI,title,author,published,container-title,volume,issue,page,publisher,type,editor,event,ISBN,ISSN&mailto=refbibtex@example.com`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.message?.items;
    if (!items || items.length === 0) return null;

    // Score results by title similarity and year match
    const scored = items.map(item => {
      const itemTitle = (item.title?.[0] || '').toLowerCase();
      const score = titleSimilarity(title.toLowerCase(), itemTitle)
        + (year && item.published?.['date-parts']?.[0]?.[0] === parseInt(year) ? 0.2 : 0);
      return { item, score };
    }).sort((a, b) => b.score - a.score);

    if (scored[0].score < 0.35) return null;
    return crossrefItemToBibtex(scored[0].item);
  } catch (e) {
    return null;
  }
}

function crossrefItemToBibtex(item) {
  const type = crossrefType(item.type, item);
  const authors = (item.author || []).map(a => {
    const given = a.given || '';
    const family = a.family || '';
    return family ? `${family}, ${given}` : given;
  });

  const year = item.published?.['date-parts']?.[0]?.[0]?.toString()
    || item['published-print']?.['date-parts']?.[0]?.[0]?.toString()
    || item['published-online']?.['date-parts']?.[0]?.[0]?.toString()
    || '';

  const title = item.title?.[0] || '';
  const doi   = item.DOI || '';
  const pages = (item.page || '').replace('--', '-');
  const volume = item.volume || '';
  const number = item.issue || '';
  const journal = item['container-title']?.[0] || '';
  const publisher = item.publisher || '';
  const booktitle = (type === 'inproceedings' || type === 'incollection')
    ? (item['container-title']?.[0] || item?.event?.name || '')
    : '';

  const editors = (item.editor || []).map(e => {
    const g = e.given || ''; const f = e.family || '';
    return f ? `${f}, ${g}` : g;
  });

  return {
    type, authors, title, journal, booktitle,
    publisher, year, volume, number, pages,
    editor: editors.join(' and '), doi,
    address: '', note: '', organization: ''
  };
}

function crossrefType(crType, item) {
  switch (crType) {
    case 'journal-article': return 'article';
    case 'book': return 'book';
    case 'book-chapter': return 'incollection';
    case 'proceedings-article':
    case 'conference-paper': return 'inproceedings';
    case 'monograph': return 'book';
    case 'edited-book': return 'book';
    default: return 'misc';
  }
}

// ── Semantic Scholar ────────────────────────────────────────────────────────

async function lookupSemanticScholar(title, year, authors) {
  try {
    const q = title + (year ? ' ' + year : '');
    const fields = 'title,authors,year,venue,journal,externalIds,publicationTypes,publicationVenue';
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=3&fields=${fields}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const papers = data?.data;
    if (!papers || papers.length === 0) return null;

    const scored = papers.map(p => {
      const score = titleSimilarity(title.toLowerCase(), (p.title || '').toLowerCase())
        + (year && p.year === parseInt(year) ? 0.2 : 0);
      return { p, score };
    }).sort((a, b) => b.score - a.score);

    if (scored[0].score < 0.35) return null;
    return semanticPaperToBibtex(scored[0].p);
  } catch (e) {
    return null;
  }
}

function semanticPaperToBibtex(paper) {
  const authors = (paper.authors || []).map(a => {
    const parts = (a.name || '').trim().split(/\s+/);
    if (parts.length < 2) return a.name || '';
    const last = parts[parts.length - 1];
    const first = parts.slice(0, -1).join(' ');
    return `${last}, ${first}`;
  });

  const types = paper.publicationTypes || [];
  let type = 'misc';
  if (types.includes('JournalArticle')) type = 'article';
  else if (types.includes('Conference') || types.includes('ConferencePaper')) type = 'inproceedings';
  else if (types.includes('Book')) type = 'book';
  else if (types.includes('BookSection')) type = 'incollection';
  else if (paper.journal?.name) type = 'article';
  else if (paper.venue) type = 'inproceedings';

  const doi = paper.externalIds?.DOI || '';
  const journal = type === 'article' ? (paper.journal?.name || paper.venue || '') : '';
  const booktitle = (type === 'inproceedings' || type === 'incollection')
    ? (paper.venue || paper.publicationVenue?.name || '') : '';

  return {
    type, authors,
    title: paper.title || '',
    journal, booktitle,
    publisher: '', year: paper.year?.toString() || '',
    volume: paper.journal?.volume || '',
    number: paper.journal?.pages ? '' : '',
    pages: paper.journal?.pages || '',
    editor: '', doi,
    address: '', note: '', organization: ''
  };
}

// ── Title similarity (Jaccard on word sets) ──────────────────────────────────

function titleSimilarity(a, b) {
  const clean = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
  const setA = new Set(clean(a));
  const setB = new Set(clean(b));
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Main lookup orchestrator ─────────────────────────────────────────────────

/**
 * Look up a single parsed reference entry using external APIs.
 * Returns { entry, source } where source is 'crossref' | 'semantic' | 'local'
 */
async function lookupEntry(parsed, onStatus) {
  const { title, year, authors } = parsed;

  if (!title && !parsed.raw) {
    return { entry: parsed, source: 'local' };
  }

  onStatus('fetching', 'Searching Crossref…');
  const crossrefResult = await lookupCrossref(title, year, authors);
  if (crossrefResult) {
    return { entry: crossrefResult, source: 'crossref' };
  }

  onStatus('fetching', 'Trying Semantic Scholar…');
  const semanticResult = await lookupSemanticScholar(title, year, authors);
  if (semanticResult) {
    return { entry: semanticResult, source: 'semantic' };
  }

  onStatus('fallback', 'Using local parser');
  return { entry: parsed, source: 'local' };
}

/**
 * Look up all references, calling progress callbacks.
 * @param {string} raw - raw reference text
 * @param {function} onItemUpdate - called with (index, state, label, source?)
 * @param {function} onProgress - called with (done, total)
 * @returns {Promise<{bibtex: string, results: Array}>}
 */
async function lookupAllReferences(raw, onItemUpdate, onProgress) {
  const refStrings = splitReferences(raw).filter(r => r.trim());
  if (!refStrings.length) throw new Error('No references detected. Make sure entries start with [1], [2], etc.');

  const parsed = refStrings.map(parseReference);
  const results = [];

  for (let i = 0; i < parsed.length; i++) {
    onItemUpdate(i, 'fetching', 'Fetching…', '');

    const { entry, source } = await lookupEntry(
      parsed[i],
      (state, msg) => onItemUpdate(i, state, msg, '')
    );

    const state = source === 'local' ? 'fallback' : 'found';
    const label = source === 'crossref' ? '✓ Crossref'
                : source === 'semantic' ? '✓ Semantic Scholar'
                : '⚠ Local parser';

    onItemUpdate(i, state, parsed[i].title || parsed[i].raw?.slice(0, 60) || `Reference ${i+1}`, source);
    results.push({ entry, source, original: parsed[i] });
    onProgress(i + 1, parsed.length);

    // Small delay to be polite to APIs
    if (i < parsed.length - 1) await sleep(300);
  }

  const bibtexEntries = results.map(r => entryToBibtex(r.entry));
  const bibtex = bibtexEntries.join('\n\n');

  const stats = {
    total: results.length,
    crossref: results.filter(r => r.source === 'crossref').length,
    semantic: results.filter(r => r.source === 'semantic').length,
    local: results.filter(r => r.source === 'local').length,
  };

  return { bibtex, results, stats };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
