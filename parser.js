/**
 * parser.js — local reference parser (used as fallback when APIs fail)
 */

function splitReferences(raw) {
  const lines = raw.split('\n');
  const refs = [];
  let current = '';
  for (const line of lines) {
    if (/^\s*\[\d+\]/.test(line)) {
      if (current.trim()) refs.push(current.trim());
      current = line;
    } else {
      current += ' ' + line;
    }
  }
  if (current.trim()) refs.push(current.trim());
  return refs;
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
