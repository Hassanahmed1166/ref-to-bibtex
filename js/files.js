/**
 * files.js — turn an uploaded .pdf / .docx / .txt into plain text, entirely in the browser.
 * PDF.js and Mammoth are loaded from a CDN only when such a file is first opened.
 */
(function (root) {
  'use strict';
  const AC = root.AC = root.AC || {};

  const CDN = {
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
  };
  const MAX_BYTES = 30 * 1024 * 1024;
  const MAX_PAGES = 400;

  const loaded = {};
  function loadScript(url) {
    return loaded[url] || (loaded[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = resolve;
      s.onerror = () => { delete loaded[url]; reject(new Error('Could not load a helper library from the CDN. Check your connection, or paste the text instead.')); };
      document.head.appendChild(s);
    }));
  }

  /** Rebuild lines (and paragraph breaks) from PDF.js text items using their positions. */
  function pageToText(items) {
    let out = '', lastY = null, lastEnd = null, lineH = 10;
    for (const it of items) {
      if (!('str' in it)) continue;
      const x = it.transform[4], y = it.transform[5], h = Math.abs(it.height || it.transform[3]) || lineH;
      if (lastY !== null && Math.abs(y - lastY) > h * 0.5) {
        const gap = Math.abs(lastY - y);
        out += gap > h * 2.1 ? '\n\n' : '\n';                      // a big vertical gap = new paragraph / reference
        lastEnd = null;
      } else if (lastEnd !== null && x - lastEnd > h * 0.15 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += ' ';
      out += it.str;
      if (it.str.trim()) { lastY = y; lineH = h; }
      lastEnd = x + (it.width || 0);
      if (it.hasEOL) { out += '\n'; lastY = null; lastEnd = null; }
    }
    return out;
  }

  async function readPdf(file, onProgress) {
    await loadScript(CDN.pdf);
    const pdfjs = root.pdfjsLib;
    if (!pdfjs) throw new Error('PDF reader failed to start.');
    pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const n = Math.min(doc.numPages, MAX_PAGES);
    const pages = [];
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(pageToText(content.items));
      if (onProgress) onProgress(i, n);
    }
    const text = pages.join('\n\n');
    if (text.replace(/\s/g, '').length < 40) throw new Error('This PDF has no selectable text (it may be a scan). Run OCR on it first, or paste the references.');
    return { text, pages: doc.numPages };
  }

  async function readDocx(file) {
    await loadScript(CDN.mammoth);
    const res = await root.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!res.value.trim()) throw new Error('No text found in this Word file.');
    return { text: res.value };
  }

  /** @returns {Promise<{text:string, kind:'pdf'|'docx'|'text', pages?:number}>} */
  async function extractText(file, onProgress) {
    if (file.size > MAX_BYTES) throw new Error(`That file is too large (limit ${MAX_BYTES / 1048576} MB).`);
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return Object.assign({ kind: 'pdf' }, await readPdf(file, onProgress));
    if (name.endsWith('.docx') || /wordprocessingml/.test(file.type)) return Object.assign({ kind: 'docx' }, await readDocx(file));
    if (name.endsWith('.doc')) throw new Error('Old .doc files are not supported — save it as .docx (or PDF) and try again.');
    return { kind: 'text', text: await file.text() };
  }

  AC.files = { extractText, pageToText };
  if (typeof module !== 'undefined' && module.exports) module.exports = AC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
