/**
 * parser.js — splits pasted text into references and parses each one locally.
 *
 * The local parse is used to (a) build search queries, (b) compare against the
 * database record that comes back, and (c) as a last-resort BibTeX entry when
 * nothing is found online. It does not need to be perfect: the database
 * record, not this parse, is what ends up in the .bib file.
 */
(function (root) {
  'use strict';
  const AC = root.AC = root.AC || {};

  // ── Text normalisation ────────────────────────────────────────────────────
  function normalizeInput(raw) {
    return String(raw || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[‘’ʼ]/g, "'").replace(/[“”„]/g, '"')
      .replace(/[‐-―−]/g, '-')            // every dash/minus -> hyphen
      .replace(/[​-‍﻿­]/g, '')        // zero-width + soft hyphen
      .replace(/ /g, ' ')
      .replace(/[ \t]+/g, ' ').replace(/ +\n/g, '\n').trim();
  }

  const stripDiacritics = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const normWord = s => stripDiacritics(s).toLowerCase().replace(/[^a-z0-9]/g, '');

  // ── Identifiers ───────────────────────────────────────────────────────────
  function extractDOI(str) {
    const m = String(str).match(/\b(10\.\d{4,9}\/[^\s"<>]+)/i);
    if (!m) return null;
    return m[1].replace(/[.,;:)\]}>'"]+$/, '').toLowerCase();
  }
  function extractArXiv(str) {
    const m = String(str).match(/arxiv[:\s\/.]*(?:abs\/)?(\d{4}\.\d{4,5})(?:v\d+)?/i)
           || String(str).match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i);
    return m ? m[1] : null;
  }

  // ── Splitting a pasted block into references ──────────────────────────────
  const REF_HEADING = /^\s*(?:(?:\d{1,2}|[IVXL]+)[.)]\s*)?(?:references and bibliography|literature cited|references?|bibliography|works cited)\s*:?\s*$/i;
  const NEXT_SECTION = /^\s*(?:appendix|appendices|acknowledg(?:e)?ments?|supplementary (?:material|file)s?|author contributions?|conflicts? of interest|funding)\b/i;

  /** If the text is a whole paper, return only the bibliography; otherwise return it unchanged. */
  function extractReferenceSection(text) {
    const lines = text.split('\n');
    const idx = lines.findIndex(l => REF_HEADING.test(l));
    if (idx < 0 || lines.slice(0, idx).filter(l => l.trim()).length < 3) return { text, found: false };   // heading must follow some body text (a bare list may start with "References")
    let end = lines.length;
    for (let i = idx + 3; i < lines.length; i++) if (NEXT_SECTION.test(lines[i])) { end = i; break; }
    return { text: lines.slice(idx + 1, end).join('\n'), found: true };
  }

  /** Drop page numbers / running headers, rejoin hyphenated words and DOIs split across lines. */
  function cleanLayoutArtifacts(text) {
    const lines = text.split('\n').map(l => l.trim());
    const counts = {};
    lines.forEach(l => { const k = l.toLowerCase(); if (k) counts[k] = (counts[k] || 0) + 1; });
    const out = [];
    for (const line of lines) {
      if (!line) { out.push(''); continue; }
      const prev = out[out.length - 1];
      if (/^(?:page\s+)?\d{1,4}$/i.test(line) && !/[-_]$/.test(prev || '')) continue;                          // bare page number
      if (/^page\s+\d+\s+of\s+\d+$/i.test(line) || /^for peer review$/i.test(line)) continue;
      if (REF_HEADING.test(line)) continue;                                                                    // running "References" header
      if (counts[line.toLowerCase()] >= 3 && line.length <= 80 && !/\d{4}/.test(line) && !/press|university|publisher/i.test(line)) continue; // running header/footer
      if (prev && /[A-Za-z]-$/.test(prev) && /^[a-z]/.test(line)) { out[out.length - 1] = prev.slice(0, -1) + line; continue; }   // line-break hyphen
      if (prev && /(?:https?:\/\/\S+|\b10\.\d{4,9}\/\S*)[/_-]$/i.test(prev) && /^[a-z0-9]\S*$/i.test(line)) { out[out.length - 1] = prev + line; continue; } // DOI/URL split at a line break
      out.push(line);
    }
    return out.join('\n');
  }

  const prepareInput = text => {
    const ex = extractReferenceSection(normalizeInput(text));
    return { text: cleanLayoutArtifacts(ex.text), foundSection: ex.found };
  };

  function splitReferences(rawInput) {
    const lines = prepareInput(rawInput).text.split('\n');
    const first = lines.find(l => l.trim().length > 3) || '';
    const numbered = /^\s*(\[\d+\]|\d{1,3}[.)]\s)/.test(first);
    let lastNum = 0;

    // A "1." / "1)" marker only counts when it continues the running sequence;
    // this stops a wrapped line like "10 Mbps links..." from being read as ref 10.
    function markerNumber(t) {
      let m = t.match(/^\[(\d+)\]/);
      if (m) return { n: +m[1], bracket: true };
      m = t.match(/^(\d{1,3})[.)]\s+\S/);
      return m ? { n: +m[1], bracket: false } : null;
    }
    function startsRef(t, buf) {
      const mk = markerNumber(t);
      if (mk) {
        if (mk.bracket || !numbered) return (lastNum = mk.n, true);
        if (mk.n === lastNum + 1 || (lastNum === 0 && mk.n <= 1)) return (lastNum = mk.n, true);
        return false;
      }
      if (/^https?:\/\/doi\.org\/|^10\.\d{4,9}\//i.test(t)) return true;
      if (numbered) return false;
      if (/^[A-Z][\p{L}'-]{1,25},\s+[A-Z]/u.test(t) && /\(\d{4}[a-z]?\)/.test(t)) return true;
      if (/^[A-Z]\.\s+(?:[A-Z]\.\s+)*[A-Z][a-z]/.test(t)) return true;
      // Un-numbered, one-per-line: the previous chunk already looks complete.
      if (buf && /^[A-ZÀ-ɏ]/.test(t) && /\b(19|20)\d{2}[a-z]?\b/.test(buf) && /[.)\]\d]$/.test(buf) && buf.length > 50) return true;
      return false;
    }

    const refs = [];
    let buf = '';
    const flush = () => { if (buf.trim()) refs.push(buf.trim()); buf = ''; };
    for (const line of lines) {
      const t = line.trim();
      if (!t) { flush(); continue; }
      if (startsRef(t, buf)) { flush(); buf = t; }
      else buf = buf ? buf + ' ' + t : t;
    }
    flush();
    return refs.map(r => r.replace(/\s+/g, ' ')).filter(r => r.length > 10);
  }

  const stripMarker = s => s.replace(/^\s*(?:\[\d+\]|\d{1,3}[.)])\s*/, '').trim();

  // ── Format detection ──────────────────────────────────────────────────────
  function detectFormat(ref) {
    const s = stripMarker(ref);
    if (/^\s*\[\d+\]/.test(ref) && /"[^"]{6,}"/.test(s)) return 'ieee';
    if (/\(\d{4}[a-z]?\)\s*[.,]?\s*'/.test(s) || /\(\d{4}\)\s+'/.test(s)) return 'harvard';
    if (/^[^()]{3,200}\(\d{4}[a-z]?\)\s*[.,]/.test(s)) return 'apa';
    if (/^[^.]{3,120}\.\s*(?:19|20)\d{2}\.\s/.test(s)) return 'chicago';
    if (/"[^"]{6,}"/.test(s)) return /\(\d{4}\)/.test(s.slice(-40)) || /\d+\.\d+\s*\(\d{4}\)/.test(s) ? 'mla' : 'ieee';
    if (VANCOUVER_AUTHORS.test(s)) return 'vancouver';
    if (/^\s*\[\d+\]/.test(ref)) return 'ieee';
    return 'unknown';
  }
  const NAME = "\\p{Lu}[\\p{L}'-]+";
  const VANCOUVER_AUTHORS = new RegExp(`^((?:${NAME}(?:\\s${NAME})?\\s\\p{Lu}{1,3})(?:,\\s*(?:${NAME}(?:\\s${NAME})?\\s\\p{Lu}{1,3}))*(?:,\\s*et al)?)\\.\\s+(\\S.*)$`, 'u');

  // ── Author handling ───────────────────────────────────────────────────────
  const PARTICLES = new Set(['van', 'von', 'de', 'del', 'della', 'der', 'den', 'di', 'da', 'dos', 'du', 'la', 'le', 'bin', 'ibn', 'al', 'el', 'ter', 'ten']);
  const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

  /** "John A. Smith" | "J. Smith" | "Smith JA" | "Smith, J." -> "Smith, John A." */
  function personToBib(name) {
    name = String(name || '').trim().replace(/(\p{L}{2})\.$/u, '$1').replace(/\s+/g, ' ');
    if (!name) return '';
    if (/^\{.*\}$/.test(name)) return name;
    if (/et al/i.test(name)) return 'others';
    if (name.includes(',')) {
      const [last, ...rest] = name.split(',');
      return `${last.trim()}, ${rest.join(',').trim()}`.replace(/,\s*$/, '');
    }
    const parts = name.split(' ');
    if (parts.length === 1) return name;
    if (/^\p{Lu}{1,3}$/u.test(parts[parts.length - 1]) && /^\p{Lu}/u.test(parts[0])) {
      const initials = parts[parts.length - 1].split('').map(c => c + '.').join(' ');
      return `${parts.slice(0, -1).join(' ')}, ${initials}`;                 // Vancouver "Smith JA"
    }
    let i = parts.length - 1, suffix = '';
    if (SUFFIXES.has(parts[i].toLowerCase().replace('.', '')) && i > 1) { suffix = ' ' + parts[i]; i--; }
    let start = i;
    while (start > 1 && PARTICLES.has(parts[start - 1].toLowerCase())) start--;
    return `${parts.slice(start, i + 1).join(' ')}${suffix}, ${parts.slice(0, start).join(' ')}`;
  }

  function parseAuthors(block) {
    block = String(block || '').replace(/(\p{L}{2})\.\s*$/u, '$1').replace(/\(eds?\.?\)/ig, '').trim();
    if (!block) return [];
    const etal = block.match(/^(.*?)[,\s]+et al\.?$/i);
    if (etal) return parseAuthors(etal[1]).concat('others');
    const tokens = block.split(/\s*(?:;|,?\s+(?:and|&)\s+|,)\s*/i).map(t => t.trim()).filter(Boolean);
    const isInitials = t => /^(?:\p{Lu}\.?[\s-]*){1,4}$/u.test(t);
    const out = [];
    const lastFirst = tokens.length > 1 && isInitials(tokens[1]) && !/\s/.test(tokens[0].replace(/^\p{Lu}\.\s*/u, ''));
    if (lastFirst || (tokens.length > 1 && tokens.every((t, i) => i % 2 ? isInitials(t) : !isInitials(t)))) {
      for (let i = 0; i < tokens.length; i += 2) {
        if (/et al/i.test(tokens[i])) { out.push('others'); break; }
        out.push(tokens[i + 1] ? `${tokens[i]}, ${tokens[i + 1].replace(/\s+/g, ' ')}` : personToBib(tokens[i]));
      }
    } else {
      for (const t of tokens) {
        if (/^et al\.?$/i.test(t)) { out.push('others'); break; }
        const m = t.match(/^(.*?)\s+et al\.?$/i);
        if (m) { out.push(personToBib(m[1]), 'others'); break; }
        out.push(personToBib(t));
      }
    }
    return out.filter(Boolean);
  }

  const familyName = a => String(a).split(',')[0].replace(/[{}]/g, '').trim();

  // ── Numeric fields ────────────────────────────────────────────────────────
  function findYear(s) {
    let m = s.match(/\((\d{4})[a-z]?\)/);
    if (m && +m[1] >= 1500 && +m[1] <= 2100) return m[1];
    const all = [...s.replace(/https?:\/\/\S+|10\.\d{4,9}\/\S+/g, ' ').matchAll(/(?<![\d:.-])((?:1[5-9]|20)\d{2})[a-z]?(?![\d-])/g)];
    if (!all.length) return '';
    const tail = all.filter(x => x.index > s.length * 0.4);
    return (tail.length ? tail[tail.length - 1] : all[all.length - 1])[1];
  }
  function findNumbers(s, result) {
    let m;
    if ((m = s.match(/\bvol(?:ume)?\.?\s*(\d+)/i))) result.volume = m[1];
    if ((m = s.match(/\b(?:no|issue|iss)\.?\s*(\d+)/i))) result.number = m[1];
    if ((m = s.match(/\bpp?\.\s*([A-Za-z]?\d+(?:\s*-+\s*[A-Za-z]?\d+)?)/i))) result.pages = m[1].replace(/\s*-+\s*/, '-');
    if (!result.volume && (m = s.match(/\b(\d{1,4})\s*\((\d{1,4})\)\s*[,:]?\s*([A-Za-z]?\d+(?:-\d+)?)/))) {
      result.volume = m[1]; result.number = m[2]; if (!result.pages) result.pages = m[3];            // 10(3):123-130, 10(3), 123-130
    } else if (!result.volume && (m = s.match(/\b(\d{1,4}):([A-Za-z]?\d+(?:-\d+)?)\b/))) {
      result.volume = m[1]; if (!result.pages) result.pages = m[2];                                // 7:48572-48634
    }
    if (!result.pages && (m = s.match(/,\s*(\d{1,6}-\d{1,6})\s*(?:,|\.|$)/))) result.pages = m[1];
  }

  // ── Venue text -> journal / booktitle / publisher ─────────────────────────
  const CONF_RE = /\b(proc(?:eedings|\.)?|conference|conf\.|workshop|symposium|congress|colloquium)\b/i;
  const PUBLISHER_RE = /\b(press|springer|wiley|elsevier|publishers?|publishing|publications|mcgraw|pearson|oxford|cambridge|crc|o'reilly|addison)\b/i;

  function parseVenue(venue, result) {
    venue = venue.replace(/^[,.:;\s]+|[\s]+$/g, '').replace(/^in[:\s]+/i, '');
    if (!venue) return;
    const cut = venue.search(/,\s*(?:vol|no|pp|p)\b|,\s*\d|\s+\d+\s*[(:]|\s+vol\b|;|\(\d{4}\)|,?\s+(?:1[5-9]|20)\d{2}\b/i);
    const name = (cut > 0 ? venue.slice(0, cut) : venue).replace(/[.,]+$/, '').trim();
    if (!name || /^\d/.test(name)) return;
    if (CONF_RE.test(name)) { result.booktitle = name; result.type = 'inproceedings'; }
    else if (PUBLISHER_RE.test(name) && !result.volume) { result.publisher = name.replace(/^.*:\s*/, ''); result.type = 'book'; }
    else { result.journal = name; result.type = 'article'; }
  }

  function extractISBN(str) {
    const m = String(str).match(/\bISBN(?:-1[03])?[:\s]*([0-9][0-9\- ]{8,16}[0-9Xx])\b/i) || String(str).match(/\b(97[89][- ]?(?:\d[- ]?){9}\d)\b/);
    if (!m) return '';
    const c = m[1].replace(/[^0-9Xx]/g, '').toUpperCase();
    return c.length === 10 || c.length === 13 ? c : '';
  }
  const BOOK_RE = /\b(?:publisher|press|edition|isbn|monograph|textbook|handbook|dissertation|thesis|technical report|white paper|report no)\b|\b(?:Springer|Wiley|Elsevier|Routledge|Pearson|McGraw|MIT Press|CRC Press)\b/i;
  function classify(raw, doi, isbn) {
    if (isbn) return 'book';
    if (/\b(?:rfc\s*\d+|iso(?:\/iec)?\s*\d+|nist|ieee\s+std|w3c)\b/i.test(raw)) return 'standard';
    if (doi || /\b(?:journal|proceedings|conference|vol\.?|trans(?:actions)?\.?|letters)\b/i.test(raw)) return 'article';
    return BOOK_RE.test(raw) ? 'book' : 'unknown';
  }

  /** Several plausible titles (best first) — lookups try each and keep the best-scoring record. */
  function titleHypotheses(body, primary) {
    const out = [];
    const add = t => {
      t = String(t || '').replace(/\s+/g, ' ').replace(/^[\s.,;:()-]+|[\s.,;:]+$/g, '').trim();
      if (t.split(' ').length >= 2 && t.length >= 8 && !out.some(o => o.toLowerCase() === t.toLowerCase())) out.push(t);
    };
    const firstSentence = s => s.split(/(?<=[a-z0-9)][.!?])\s+(?=[A-Z])/)[0];
    const afterBoundary = s => { const m = s.match(/\.\s+(?=[A-Z])/); return m ? s.slice(m.index + m[0].length) : ''; };
    add(primary);
    for (const m of body.matchAll(/"([^"]{6,}?)"/g)) add(m[1]);
    const inM = body.match(/\bIn:?\s+/);
    if (inM) add(firstSentence(afterBoundary(body.slice(0, inM.index))));
    const y = body.match(/\b(?:1[5-9]|20)\d{2}[a-z]?\)?[.,]?\s+/);
    if (y) add(firstSentence(body.slice(y.index + y[0].length)));
    add(firstSentence(afterBoundary(body)));
    const pieces = body.split(/[.!?]\s+/).filter(p => p.split(/\s+/).length >= 3);
    if (pieces.length) add(pieces.reduce((a, b) => (b.split(/\s+/).length > a.split(/\s+/).length ? b : a)).replace(/^.*?\b(?:et al\.?|and)\b\s*/i, ''));
    return out.slice(0, 5);
  }

  // ── The parser ────────────────────────────────────────────────────────────
  function emptyEntry(raw) {
    return { type: 'misc', authors: [], title: '', journal: '', booktitle: '', publisher: '', year: '', volume: '', number: '', pages: '', address: '', editor: '', note: '', doi: '', arxiv: '', isbn: '', url: '', raw, kind: 'unknown', titleCandidates: [] };
  }
  const PROTECT = s => s.replace(/\b(\p{Lu})\./gu, '$1\u0001').replace(/\bet al\./gi, m => m.replace('.', '\u0001'))
                        .replace(/\b(vol|no|pp|p|ed|eds|ca|vs|fig|dept|univ|proc|trans|int|j|conf|comput|syst|netw|commun|lett|rev|sci|technol|eng|mag|natl|acad)\./gi, m => m.replace('.', '\u0001'));
  const RESTORE = s => s.replace(/\u0001/g, '.');

  function parseReference(refStr, overrideFormat) {
    const raw = stripMarker(refStr);
    const r = emptyEntry(raw);
    r.doi = extractDOI(raw) || '';
    r.arxiv = extractArXiv(raw) || '';
    r.isbn = extractISBN(raw);
    const urlM = raw.match(/https?:\/\/(?!doi\.org)\S+/i);
    if (urlM) r.url = urlM[0].replace(/[.,;)]+$/, '');
    const body = raw.replace(/https?:\/\/\S+|\bdoi:\s*10\.\S+|\b10\.\d{4,9}\/\S+/gi, ' ').replace(/\barxiv:?\s*\d{4}\.\d{4,5}(v\d+)?/gi, ' ')
                    .replace(/\s+/g, ' ').replace(/[,;\s]+$/, '').trim();
    const fmt = overrideFormat && overrideFormat !== 'auto' ? overrideFormat : detectFormat(refStr);
    r.format = fmt;
    r.year = findYear(body);
    findNumbers(body, r);

    let venueText = '';
    const quoted = body.match(/"([^"]{6,}?)"/) || body.match(/(?:^|[\s(])'([^']{8,}?)'(?=[,.\s)]|$)/);
    const parenYear = body.match(/^(.{3,250}?)\s*\((\d{4})[a-z]?\)\s*[.,]?\s*(.*)$/);
    const vanc = body.match(VANCOUVER_AUTHORS);

    if (quoted) {
      r.title = quoted[1].replace(/[,.]$/, '').trim();
      const idx = body.indexOf(quoted[0]);
      let authBlock = body.slice(0, idx).replace(/\(\d{4}\)\s*$/, '').replace(/[,.\s]+$/, '').replace(/\s+\d{4}$/, '');
      r.authors = parseAuthors(authBlock.replace(/\.\s*(?:19|20)\d{2}$/, ''));
      venueText = body.slice(idx + quoted[0].length);
      if (parenYear && fmt === 'harvard') r.authors = parseAuthors(parenYear[1]);
    } else if (parenYear && fmt !== 'vancouver') {
      r.authors = parseAuthors(parenYear[1]);
      const segs = RESTORE_ALL(PROTECT(parenYear[3]).split(/\.\s+/));
      r.title = (segs[0] || '').replace(/[.?!]+$/, m => /[?!]/.test(m) ? m[0] : '').trim();
      venueText = segs.slice(1).join('. ');
    } else if (vanc) {
      r.authors = parseAuthors(vanc[1]);
      const segs = RESTORE_ALL(PROTECT(vanc[2]).split(/\.\s+/));
      r.title = (segs[0] || '').trim();
      venueText = segs.slice(1).join('. ');
    } else {
      const etalM = body.match(/^(.{2,200}?\s+et al)\.?\s+(?=\p{Lu})/u);               // "Author et al. Title..."
      const segs = RESTORE_ALL(PROTECT(etalM ? body.slice(etalM[0].length) : body).split(/\.\s+/));
      let i = 0;
      if (etalM) r.authors = parseAuthors(etalM[1]);
      else r.authors = parseAuthors(segs[i++] || '');
      while (segs[i] && /^(?:1[5-9]|20)\d{2}[a-z]?$/.test(segs[i].trim())) i++;          // Chicago "Author. 2020. Title."
      r.title = (segs[i++] || '').trim();
      venueText = segs.slice(i).join('. ');
    }
    r.title = r.title.replace(/\s*\[(?:Internet|Online)\]\s*$/i, '');

    if (/\bin\b[:\s]/i.test(venueText.slice(0, 12)) || CONF_RE.test(venueText.slice(0, 120))) {
      const ed = venueText.match(/\(?\b(?:eds?\.?|editors?)\)?[:\s]+([^,.]{3,80})/i) || venueText.match(/([^,]+)\s*\(eds?\.?\)/i);
      if (ed) r.editor = parseAuthors(ed[1]).join(' and ');
    }
    parseVenue(venueText, r);
    if (r.type === 'misc') {
      if (r.arxiv) { r.type = 'misc'; r.note = `arXiv:${r.arxiv}`; }
      else if (PUBLISHER_RE.test(venueText)) { r.type = 'book'; r.publisher = (venueText.match(/(?:[A-Z][\w&.' -]+:\s*)?([A-Z][\w&.' -]*(?:Press|Springer|Wiley|Elsevier|Publishers?|Publishing|Publications)[\w. -]*)/) || [])[1] || ''; }
    }
    if (r.type === 'article' && !r.volume && !r.pages && !r.number && r.arxiv) r.type = 'misc';
    r.kind = classify(raw, r.doi, r.isbn);
    if (r.kind === 'book' && !r.journal && !r.booktitle && r.type !== 'inproceedings') r.type = 'book';
    r.titleCandidates = titleHypotheses(body, r.title);
    return r;
  }
  function RESTORE_ALL(arr) { return arr.map(RESTORE); }

  Object.assign(AC, {
    normalizeInput, stripDiacritics, normWord, extractDOI, extractArXiv,
    splitReferences, prepareInput, extractReferenceSection, cleanLayoutArtifacts, extractISBN, stripMarker, detectFormat, parseAuthors, personToBib, familyName, parseReference, emptyEntry
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = AC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
