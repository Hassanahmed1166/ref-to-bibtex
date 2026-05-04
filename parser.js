/**
 * parser.js — local reference parser (used as fallback when APIs fail)
 */

function splitReferences(raw) {
  // PASS 0 — unicode / whitespace normalisation
  raw = raw
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013|\u2014/g, '-').replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\t/g, ' ').replace(/[ ]+/g, ' ').replace(/ +\n/g, '\n');

  const rawLines = raw.split('\n');

  // Detect dominant marker style
  const firstNonBlank = rawLines.find(l => l.trim().length > 3) || '';
  const hasNumberedMarker = /^\s*\[\d+\]/.test(firstNonBlank) || /^\s*\d+[\. )]\s+\S/.test(firstNonBlank);

  function isRefStart(line) {
    const t = line.trim();
    if (!t) return false;
    if (/^\[\d+\]/.test(t)) return true;
    if (/^\d{1,3}[\. )]\s+\S/.test(t)) return true;
    if (/^https?:\/\/doi\.org\//.test(t) || /^10\.\d{4,9}\//.test(t)) return true;
    if (!hasNumberedMarker) {
      if (/^[A-Z][A-Za-z'\-]{1,25},\s+[A-Z]/.test(t) && /\(\d{4}[a-z]?\)/.test(t)) return true;
    }
    return false;
  }

  // PASS 1 — join soft-wrapped continuation lines
  const logicalLines = [];
  let buf = '';
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      if (buf) { logicalLines.push(buf); buf = ''; }
      logicalLines.push('');
    } else if (isRefStart(line)) {
      if (buf) logicalLines.push(buf);
      buf = trimmed;
    } else if (buf === '') {
      buf = trimmed;
    } else {
      buf += ' ' + trimmed;
    }
  }
  if (buf) logicalLines.push(buf);

  // PASS 2 — split into individual reference strings
  const refs = [];
  let current = '';
  for (const lline of logicalLines) {
    if (lline === '') {
      if (current.trim()) { refs.push(current.trim()); current = ''; }
    } else if (isRefStart(lline)) {
      if (current.trim()) refs.push(current.trim());
      current = lline;
    } else {
      current += current ? ' ' + lline : lline;
    }
  }
  if (current.trim()) refs.push(current.trim());

  return refs.map(r => r.replace(/\s+/g, ' ').trim()).filter(r => r.length > 10);
}

function parseAuthors(block) {
  if (!block) return [];
  block = block.replace(/\.\s*$/, '').trim();
  const raw = block.split(/,\s+(?:and\s+)?|(?:^|\s)and\s+/i).filter(Boolean);
  const authors = [];
  for (let a of raw) {
    a = a.trim().replace(/\.$/, '');
    if (!a) continue;
    if (/et al/i.test(a)) { authors.push('others'); continue; }
    const parts = a.trim().split(/\s+/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const first = parts.slice(0, -1).join(' ');
      authors.push(`${last}, ${first}`);
    } else {
      authors.push(a);
    }
  }
  return authors;
}

function parseReference(refStr) {
  const withoutNum = refStr.replace(/^\s*\[\d+\]\s+/, '').trim();
  const result = {
    type: 'misc', authors: [], title: '', journal: '', booktitle: '',
    publisher: '', year: '', volume: '', number: '', pages: '',
    address: '', editor: '', note: '', doi: '', raw: withoutNum
  };

  const yearMatch = withoutNum.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) result.year = yearMatch[0];

  const pagesMatch = withoutNum.match(/pp\.\s*([\d\s,–\-]+)/i);
  if (pagesMatch) result.pages = pagesMatch[1].trim().replace(/–/g, '-');

  const volMatch = withoutNum.match(/vol(?:ume)?\.?\s*(\d+)/i);
  if (volMatch) result.volume = volMatch[1];
  const numMatch = withoutNum.match(/no(?:\.|,)?\s*(\d+)/i);
  if (numMatch) result.number = numMatch[1];

  const quotedTitle = withoutNum.match(/["\u201C\u201D]([^"\u201C\u201D]+)["\u201C\u201D]/);
  if (quotedTitle) result.title = quotedTitle[1].trim();

  const isChapter = /\bin\b/i.test(withoutNum) && quotedTitle;
  const isConference = /conference|proceedings|workshop|symposium/i.test(withoutNum) && /\bin\b/i.test(withoutNum);

  let authorBlock = '';
  if (quotedTitle) {
    authorBlock = withoutNum.substring(0, withoutNum.indexOf(quotedTitle[0])).trim().replace(/,\s*$/, '');
  } else {
    const parts = withoutNum.split(',');
    authorBlock = parts.slice(0, 2).join(',');
  }
  result.authors = parseAuthors(authorBlock);

  const pubs = ['Springer', 'Elsevier', 'Wiley', 'IEEE', 'ACM', 'Academic Press', 'MIT Press', 'CRC Press'];
  for (const p of pubs) {
    if (withoutNum.includes(p)) { result.publisher = p; break; }
  }

  if (isChapter || isConference) {
    const inMatch = withoutNum.match(/\bin\s+(.+)/i);
    if (inMatch) {
      let inPart = inMatch[1];
      const edMatch = inPart.match(/,\s*([^,]+(?:Eds?\.|Editors?)[^:]*):?/i);
      if (edMatch) result.editor = parseAuthors(edMatch[1].replace(/Eds?\.?/i, '').trim()).join(' and ');
      result.booktitle = inPart.split(',')[0].trim().replace(/[()]/g, '').replace(/\.$/, '');
    }
    result.type = isConference ? 'inproceedings' : 'incollection';
  } else if (quotedTitle && result.title) {
    const afterTitle = withoutNum.substring(
      withoutNum.indexOf(quotedTitle[0]) + quotedTitle[0].length + quotedTitle[1].length + 1
    ).trim().replace(/^[,"']+/, '').trim();
    const journalRaw = afterTitle.split(',')[0].trim().replace(/\.$/, '');
    if (journalRaw && !/^\d/.test(journalRaw)) result.journal = journalRaw;
    result.type = 'article';
  } else {
    result.type = 'book';
    if (!result.title) {
      const parts = withoutNum.split(',');
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i].trim();
        if (p.length > 8 && /^[A-Z]/.test(p) && !/^\d/.test(p) && !/springer|press|vol|pp\./i.test(p)) {
          result.title = p.replace(/\.$/, '').trim();
          break;
        }
      }
    }
  }

  return result;
}

function makeCiteKey(entry) {
  const firstAuthor = entry.authors[0] || 'unknown';
  const lastName = firstAuthor.split(',')[0].replace(/\s+/g, '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
  const year = entry.year || '0000';
  const stopwords = new Set(['the','a','an','of','in','on','for','and','to','with','from','is','are','via','its','new','an','using']);
  const titleWords = (entry.title || entry.booktitle || '').split(/\s+/).map(w => w.toLowerCase().replace(/[^a-z]/g, ''));
  const titleWord = titleWords.find(w => w.length > 2 && !stopwords.has(w)) || 'ref';
  return `${lastName}${year}${titleWord}`;
}

function entryToBibtex(entry) {
  const key = makeCiteKey(entry);
  const fields = [];
  const add = (name, value) => { if (value && String(value).trim()) fields.push([name, String(value).trim()]); };

  if (entry.authors && entry.authors.length) add('author', entry.authors.join(' and '));
  add('title', entry.title);

  if (entry.type === 'article') {
    add('journal', entry.journal);
    add('volume', entry.volume);
    add('number', entry.number);
    add('pages', entry.pages);
    add('doi', entry.doi);
  } else if (entry.type === 'book') {
    add('publisher', entry.publisher);
    add('address', entry.address);
    add('edition', entry.edition);
    add('doi', entry.doi);
  } else if (entry.type === 'incollection' || entry.type === 'inproceedings') {
    add('booktitle', entry.booktitle);
    add('editor', entry.editor);
    add('pages', entry.pages);
    add('publisher', entry.publisher);
    add('organization', entry.organization);
    add('doi', entry.doi);
  }

  add('year', entry.year);
  if (entry.note) add('note', entry.note);

  const fieldLines = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${v}}`)
    .join(',\n');

  return `@${entry.type}{${key},\n${fieldLines}\n}`;
}
