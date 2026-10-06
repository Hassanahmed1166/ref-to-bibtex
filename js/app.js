/**
 * app.js — UI controller: input, settings, live results, side-by-side review, export.
 */
(function () {
  'use strict';
  const AC = window.AC;
  const $ = id => document.getElementById(id);
  const el = {
    input: $('refInput'), count: $('refCount'), hint: $('formatHint'), convert: $('convertBtn'), sample: $('sampleBtn'),
    file: $('fileInput'), clear: $('clearBtn'), format: $('formatSelect'), strict: $('strictness'), keyStyle: $('keyStyle'),
    conc: $('concurrency'), concOut: $('concurrencyOut'), mailto: $('mailto'), caps: $('protectCaps'),
    pCr: $('pCrossref'), pOa: $('pOpenalex'), pSs: $('pSemantic'),
    err: $('errorSection'), errMsg: $('errorMsg'), results: $('resultsSection'), runbar: $('runbar'),
    bar: $('progressBarFill'), barWrap: $('progressBar'), progressLabel: $('progressLabel'), cancel: $('cancelBtn'),
    summary: $('summary'), scope: $('scope'), acceptV: $('acceptVerifiedBtn'), copy: $('copyBtn'), download: $('downloadBtn'),
    rows: $('rows'), toast: $('toast')
  };

  const FORMAT_HINTS = {
    auto: 'Style is detected for each reference separately.',
    ieee: '[1] J. Smith, "Title of paper," IEEE Trans. X, vol. 10, no. 2, pp. 1–10, 2020.',
    apa: 'Smith, J. (2020). Title of paper. Journal of X, 10(2), 1–10.',
    mla: 'Smith, John. "Title of Paper." Journal of X, vol. 10, no. 2, 2020, pp. 1–10.',
    chicago: 'Smith, John. 2020. "Title of Paper." Journal of X 10 (2): 1–10.',
    vancouver: '1. Smith J. Title of paper. J X. 2020;10(2):1–10.',
    harvard: "Smith, J. (2020) 'Title of paper', Journal of X, 10(2), pp. 1–10."
  };

  const SAMPLE = [
    '[1] K. He, X. Zhang, S. Ren, and J. Sun, "Deep residual learning for image recognition," in Proc. IEEE Conf. Comput. Vis. Pattern Recognit. (CVPR), 2016, pp. 770-778.',
    '[2] Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436-444, 2015.',
    '[3] Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2017). Attention is all you need. Advances in Neural Information Processing Systems, 30.',
    '[4] Hazim Shakhatreh et al. Unmanned aerial vehicles (UAVs): A survey on civil applications and key research challenges. IEEE Access, 7:48572-48634, 2019.',
    "[5] Goodfellow, I. et al. (2014) 'Generative adversarial nets', Advances in Neural Information Processing Systems, 27.",
    '[6] https://doi.org/10.1038/nature16961',
    '[7] Smith J, Jones K. Quantum-entangled blockchain governance for the era of digital transformation. Int J Adv Innov Res. 2023;12(4):101-115.'
  ].join('\n');

  // ── State ─────────────────────────────────────────────────────────────────
  const state = { items: [], filter: 'all', running: false, ctl: null };
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };

  // ── Settings ──────────────────────────────────────────────────────────────
  function loadSettings() {
    const s = LS.get('ac-settings', {});
    if (s.format) el.format.value = s.format;
    if (s.strictness) el.strict.value = s.strictness;
    if (s.keyStyle) el.keyStyle.value = s.keyStyle;
    if (s.concurrency) el.conc.value = s.concurrency;
    if (s.mailto) el.mailto.value = s.mailto;
    if (s.protectCaps === false) el.caps.checked = false;
    if (s.providers) { el.pCr.checked = s.providers.crossref !== false; el.pOa.checked = s.providers.openalex !== false; el.pSs.checked = s.providers.semantic !== false; }
    applySettings(false);
  }
  function applySettings(save = true) {
    const c = AC.config;
    c.mailto = el.mailto.validity.valid ? el.mailto.value.trim() : '';
    c.strictness = el.strict.value;
    c.concurrency = +el.conc.value;
    c.providers = { crossref: el.pCr.checked, openalex: el.pOa.checked, semantic: el.pSs.checked };
    el.concOut.textContent = el.conc.value;
    el.hint.textContent = FORMAT_HINTS[el.format.value] || '';
    if (save) LS.set('ac-settings', { format: el.format.value, strictness: el.strict.value, keyStyle: el.keyStyle.value, concurrency: +el.conc.value, mailto: el.mailto.value, protectCaps: el.caps.checked, providers: c.providers });
  }
  [el.format, el.strict, el.keyStyle, el.conc, el.mailto, el.caps, el.pCr, el.pOa, el.pSs].forEach(n => n.addEventListener('change', () => { applySettings(); if (state.items.length && (n === el.keyStyle || n === el.caps)) renderAll(); }));
  el.conc.addEventListener('input', () => { el.concOut.textContent = el.conc.value; });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function toast(msg) { el.toast.textContent = msg; el.toast.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.toast.classList.remove('show'), 2400); }
  function showError(msg) { el.errMsg.textContent = msg; el.err.classList.remove('hidden'); el.err.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  const SRC = { crossref: 'Crossref', openalex: 'OpenAlex', semantic: 'Semantic Scholar', local: 'your text only' };
  const STATUS = { pending: ['Waiting', 'pending'], fetching: ['Checking…', 'fetching'], verified: ['Verified', 'verified'], review: ['Check this', 'review'], notfound: ['Not found', 'notfound'], error: ['Lookup failed', 'error'] };

  const keyOpts = () => ({ protectCaps: el.caps.checked });
  function currentKeys() { return AC.bibtex.uniqueKeys(state.items.map(it => it.result?.entry || it.parsed), el.keyStyle.value); }
  const bibFor = (it, key) => it.override != null ? it.override : AC.bibtex.entryToBibtex(it.result?.entry || it.parsed, key, keyOpts());

  // ── Side-by-side highlighting ─────────────────────────────────────────────
  const WORD = /[\p{L}\p{N}]+/gu;
  const TRIVIAL = new Set(['the', 'of', 'and', 'in', 'on', 'a', 'an', 'for', 'to', 'vol', 'no', 'pp']);
  const nw = w => AC.normWord(w);
  const wordSet = text => new Set((String(text).match(WORD) || []).map(nw));
  function markWords(text, otherSet, cls) {
    let out = '', last = 0, m;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(text))) {
      out += esc(text.slice(last, m.index));
      const n = nw(m[0]);
      const interesting = n.length > 0 && !TRIVIAL.has(n) && (n.length > 1 || /\d/.test(n));
      out += interesting && (cls === 'hit' ? otherSet.has(n) : !otherSet.has(n)) ? `<mark class="${cls}">${esc(m[0])}</mark>` : esc(m[0]);
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  const NEUTRAL_FIELDS = new Set(['doi', 'url', 'eprint', 'archivePrefix', 'publisher', 'address', 'note', 'issn']);

  function renderRaw(it) {
    if (!it.result || it.result.status === 'notfound' || it.result.status === 'error') return esc(it.parsed.raw);
    const e = it.result.entry;
    const bibWords = wordSet([(e.authors || []).join(' '), e.title, e.journal, e.booktitle, e.year, e.volume, e.number, e.pages].join(' '));
    return markWords(it.parsed.raw, bibWords, 'hit');
  }
  function renderBib(it, key) {
    if (it.override != null) return highlightBibSyntax(it.override);
    const entry = it.result?.entry || it.parsed;
    const rawWords = wordSet(it.parsed.raw);
    const compare = it.result && (it.result.status === 'verified' || it.result.status === 'review') && rawWords.size >= 6;   // a bare DOI has nothing to compare
    const fields = AC.bibtex.entryFields(entry, keyOpts());
    const type = fields.length ? (entry.type || 'misc') : 'misc';
    const lines = fields.map(([k, v]) => {
      const val = !compare || NEUTRAL_FIELDS.has(k) ? esc(v)
        : k === 'author' || k === 'editor'   // only surnames are compared: the text often gives initials where the record has full given names
          ? v.split(' and ').map(p => { const [fam, ...giv] = p.split(','); return markWords(fam, rawWords, 'miss') + (giv.length ? ',' + esc(giv.join(',')) : ''); }).join(' and ')
          : markWords(v, rawWords, 'miss');
      return `  <span class="bib-field">${esc(k)}</span> = <span class="bib-brace">{</span><span class="bib-value">${val}</span><span class="bib-brace">}</span>`;
    });
    return `<span class="bib-type">@${esc(type)}</span>{<span class="bib-key">${esc(key)}</span>,\n${lines.join(',\n')}\n<span class="bib-brace">}</span>`;
  }
  function highlightBibSyntax(bib) {
    return bib.split('\n').map(line => {
      let m = line.match(/^@(\w+)\{(.*),\s*$/);
      if (m) return `<span class="bib-type">@${esc(m[1])}</span>{<span class="bib-key">${esc(m[2])}</span>,`;
      m = line.match(/^(\s+)(\w+)(\s*=\s*)\{(.*)\}(,?)$/);
      if (m) return `${m[1]}<span class="bib-field">${esc(m[2])}</span>${m[3]}<span class="bib-brace">{</span><span class="bib-value">${esc(m[4])}</span><span class="bib-brace">}</span>${m[5]}`;
      return esc(line);
    }).join('\n');
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function statusOf(it) { return it.running ? 'fetching' : it.result ? it.result.status : 'pending'; }

  function rowHtml(it, key) {
    const st = statusOf(it);
    const [label, cls] = STATUS[st];
    const r = it.result;
    const pct = r && (r.status === 'verified' || r.status === 'review') ? ` ${Math.round(r.score * 100)}%` : '';
    const decision = it.decision === 'accept' ? ' <span class="chip chip-accepted">✓ accepted</span>' : it.decision === 'reject' ? ' <span class="chip chip-rejected">✕ rejected</span>' : '';
    const busy = st === 'fetching' || st === 'pending';
    const flags = r ? r.flags.map(f => `<li class="flag-${f.level}">${esc(f.text)}</li>`).join('') : '';
    const alts = r && r.candidates.length > 1 ? `<details class="alts"><summary>Other possible matches (${r.candidates.length - 1})</summary><ul>${r.candidates.map((c, ci) => ci === it.pick ? '' :
      `<li><div><strong>${esc(c.cand.title)}</strong><span class="alt-meta">${esc(c.cand.authors.slice(0, 3).map(a => AC.familyName(a)).join(', '))}${c.cand.authors.length > 3 ? ' et al.' : ''} · ${esc(c.cand.year)} · ${esc(c.cand.journal || c.cand.booktitle)} · ${SRC[c.cand.source]} · ${Math.round(c.score * 100)}% match</span></div><button class="btn btn-ghost btn-sm" data-act="use" data-ci="${ci}" type="button">Use this</button></li>`).join('')}</ul></details>` : '';

    const left = it.editingRaw
      ? `<textarea class="edit-area" id="edit-raw-${it.i}" rows="4">${esc(it.parsed.raw)}</textarea><div class="edit-btns"><button class="btn btn-primary btn-sm" data-act="rerun" type="button">Re-check this text</button><button class="btn btn-ghost btn-sm" data-act="cancel-raw" type="button">Cancel</button></div>`
      : `<div class="ref-text">${renderRaw(it)}</div>`;
    const right = busy ? `<div class="bib-wait"><span class="spin">◌</span> ${esc(it.message || 'Waiting…')}</div>`
      : it.editingBib ? `<textarea class="edit-area mono" id="edit-bib-${it.i}" rows="9" spellcheck="false">${esc(bibFor(it, key))}</textarea><div class="edit-btns"><button class="btn btn-primary btn-sm" data-act="save-bib" type="button">Save</button><button class="btn btn-ghost btn-sm" data-act="cancel-bib" type="button">Cancel</button>${it.override != null ? '<button class="btn btn-ghost btn-sm" data-act="reset-bib" type="button">Reset to generated</button>' : ''}</div>`
      : `<pre class="bib">${renderBib(it, key)}</pre>`;

    return `<article class="row row-${cls}${it.decision === 'reject' ? ' is-rejected' : ''}" data-i="${it.i}" id="row-${it.i}">
  <header class="row-head">
    <span class="row-num">[${it.i + 1}]</span>
    <span class="chip chip-${cls}" title="${r ? `Match confidence ${Math.round(r.score * 100)}%` : ''}">${label}${pct}</span>${decision}
    ${r && r.status !== 'notfound' && r.status !== 'error' ? `<span class="src">via ${SRC[r.source]}</span>` : ''}
    <span class="row-actions">
      <button class="icon-btn${it.decision === 'accept' ? ' on' : ''}" data-act="accept" type="button" title="Mark as correct" ${busy ? 'disabled' : ''}>✓ Accept</button>
      <button class="icon-btn${it.decision === 'reject' ? ' on' : ''}" data-act="reject" type="button" title="Leave out of the export" ${busy ? 'disabled' : ''}>✕ Reject</button>
      <button class="icon-btn" data-act="edit-raw" type="button" title="Fix your reference text and look it up again">Edit text</button>
      <button class="icon-btn" data-act="edit-bib" type="button" title="Edit the BibTeX by hand" ${busy ? 'disabled' : ''}>Edit BibTeX</button>
      <button class="icon-btn" data-act="retry" type="button" title="Look this reference up again" ${it.running ? 'disabled' : ''}>↻</button>
    </span>
  </header>
  <div class="pair">
    <section class="pane pane-ref" aria-label="Your reference ${it.i + 1}"><h4>Your reference</h4>${left}</section>
    <section class="pane pane-bib" aria-label="BibTeX ${it.i + 1}"><h4>BibTeX${it.override != null ? ' <span class="edited">edited</span>' : ''}</h4>${right}</section>
  </div>
  ${flags ? `<ul class="flags">${flags}</ul>` : ''}${alts}
</article>`;
  }

  function renderAll() {
    const keys = currentKeys();
    const vis = state.items.filter(it => matchesFilter(it));
    el.rows.innerHTML = vis.map(it => rowHtml(it, keys[it.i])).join('') || '<p class="empty">Nothing in this filter.</p>';
    renderSummary();
  }
  function renderRow(i) {
    const node = $('row-' + i);
    const it = state.items[i];
    if (!node) return;
    if (!matchesFilter(it)) { node.remove(); renderSummary(); return; }
    node.outerHTML = rowHtml(it, currentKeys()[i]);
    renderSummary();
  }
  const matchesFilter = it => state.filter === 'all' || statusOf(it) === state.filter || (state.filter === 'rejected' && it.decision === 'reject');

  function renderSummary() {
    const c = { all: state.items.length, verified: 0, review: 0, notfound: 0, error: 0, rejected: 0 };
    state.items.forEach(it => { const s = statusOf(it); if (c[s] !== undefined) c[s]++; if (it.decision === 'reject') c.rejected++; });
    const chip = (key, label) => c[key] || key === 'all' ? `<button type="button" class="filter${state.filter === key ? ' on' : ''}" data-filter="${key}" aria-pressed="${state.filter === key}">${label} <b>${c[key]}</b></button>` : '';
    el.summary.innerHTML = chip('all', 'All') + chip('verified', '✔ Verified') + chip('review', '⚠ Check this') + chip('notfound', '✕ Not found') + chip('error', 'Failed') + chip('rejected', 'Rejected');
  }

  // ── Running ───────────────────────────────────────────────────────────────
  function setRunning(on) {
    state.running = on;
    el.convert.disabled = on;
    el.convert.querySelector('span').textContent = on ? 'Working…' : 'Convert & Verify';
    el.runbar.hidden = !on;
    if (!on) el.cancel.disabled = false;
  }
  function setProgress(done, total) {
    const p = total ? Math.round(done / total * 100) : 0;
    el.bar.style.width = p + '%';
    el.barWrap.setAttribute('aria-valuenow', p);
    el.progressLabel.textContent = `${done} of ${total} checked`;
  }

  async function run() {
    if (state.running) return;
    const text = el.input.value;
    el.err.classList.add('hidden');
    if (!text.trim()) { showError('Paste some references first.'); el.input.focus(); return; }
    applySettings(false);
    if (!Object.values(AC.config.providers).some(Boolean)) { showError('Select at least one database in Options.'); return; }
    const refs = AC.splitReferences(text);
    if (!refs.length) { showError('No references detected. Put each reference on its own line (or separate them with a blank line).'); return; }

    state.items = refs.map((raw, i) => ({ i, parsed: AC.parseReference(raw, el.format.value), result: null, running: false, message: '', decision: 'auto', override: null, pick: 0 }));
    state.filter = 'all';
    el.results.classList.remove('hidden');
    renderAll();
    el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await resolveItems(state.items.map(it => it.i));
    const st = LS.get('ac-stats', {});                                  // local-only usage counters (shown on the About page)
    LS.set('ac-stats', { refs: (st.refs || 0) + state.items.length, verified: (st.verified || 0) + state.items.filter(it => it.result && (it.result.status === 'verified' || it.result.status === 'review')).length });
  }

  async function resolveItems(indices) {
    state.ctl = new AbortController();
    setRunning(true); setProgress(0, indices.length);
    indices.forEach(i => { state.items[i].result = null; state.items[i].running = false; state.items[i].message = 'Waiting…'; });
    const t0 = performance.now();
    try {
      await AC.lookup.resolveAll(indices.map(i => state.items[i].parsed), state.ctl.signal, {
        onUpdate: (k, s, msg) => { const it = state.items[indices[k]]; it.running = true; it.message = msg; patchWait(it); },
        onDone: (k, res) => { const it = state.items[indices[k]]; it.running = false; it.result = res; it.pick = 0; renderRow(it.i); },
        onProgress: setProgress
      });
    } finally {
      state.items.forEach(it => { if (it.running) { it.running = false; it.message = ''; } });
      setRunning(false);
      renderAll();
      const aborted = state.ctl.signal.aborted;
      toast(aborted ? 'Cancelled' : `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    }
  }
  function patchWait(it) {
    const w = document.querySelector(`#row-${it.i} .bib-wait`);
    if (w) w.lastChild.textContent = ' ' + it.message; else renderRow(it.i);
  }

  // ── Row actions (event delegation) ────────────────────────────────────────
  el.rows.addEventListener('click', async ev => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('.row'); const it = state.items[+row.dataset.i];
    const act = btn.dataset.act;
    if (act === 'accept') it.decision = it.decision === 'accept' ? 'auto' : 'accept';
    else if (act === 'reject') it.decision = it.decision === 'reject' ? 'auto' : 'reject';
    else if (act === 'edit-raw') it.editingRaw = true;
    else if (act === 'cancel-raw') it.editingRaw = false;
    else if (act === 'edit-bib') it.editingBib = true;
    else if (act === 'cancel-bib') it.editingBib = false;
    else if (act === 'reset-bib') { it.override = null; it.editingBib = false; }
    else if (act === 'save-bib') { it.override = $('edit-bib-' + it.i).value.trim(); it.editingBib = false; it.decision = it.decision === 'reject' ? 'auto' : 'accept'; }
    else if (act === 'use') {
      const pick = it.result.candidates[+btn.dataset.ci];
      const old = it.result.candidates[it.pick];
      it.result.candidates[it.pick] = pick; it.result.candidates[+btn.dataset.ci] = old;
      it.result.entry = Object.assign({}, pick.cand, { raw: it.parsed.raw });
      it.result.source = pick.cand.source; it.result.score = pick.score; it.result.status = 'review';
      it.result.flags = it.result.flags.filter(f => f.level === 'info');
      it.result.flags.unshift({ level: 'warn', text: 'You chose this match manually — confirm it looks right, then press Accept.' });
      it.override = null;
    }
    else if (act === 'rerun' || act === 'retry') {
      if (act === 'rerun') {
        const txt = AC.normalizeInput($('edit-raw-' + it.i).value);
        if (txt.length < 8) return;
        it.parsed = AC.parseReference(txt, el.format.value); it.editingRaw = false;
      }
      it.decision = 'auto'; it.override = null;
      renderRow(it.i);
      if (!state.running) await resolveItems([it.i]);
      return;
    }
    renderRow(it.i);
  });
  el.summary.addEventListener('click', ev => {
    const b = ev.target.closest('[data-filter]'); if (!b) return;
    state.filter = state.filter === b.dataset.filter ? 'all' : b.dataset.filter;
    renderAll();
  });
  el.acceptV.addEventListener('click', () => {
    let n = 0; state.items.forEach(it => { if (it.result?.status === 'verified' && it.decision === 'auto') { it.decision = 'accept'; n++; } });
    renderAll(); toast(`${n} verified reference${n === 1 ? '' : 's'} accepted`);
  });
  el.cancel.addEventListener('click', () => { state.ctl?.abort(); el.cancel.disabled = true; });

  // ── Export ────────────────────────────────────────────────────────────────
  function buildBib() {
    const keys = currentKeys(), scope = el.scope.value, parts = [];
    state.items.forEach(it => {
      if (!it.result || it.decision === 'reject') return;
      const ok = it.result.status === 'verified';
      if (scope === 'accepted' && it.decision !== 'accept') return;
      if (scope === 'verified' && !(ok || it.decision === 'accept')) return;
      const note = it.decision === 'accept' || ok ? '' : `% [${it.i + 1}] ${it.result.status === 'review' ? 'CHECK - match is uncertain' : 'NOT VERIFIED - no database record found'}; verify manually\n`;
      parts.push(note + bibFor(it, keys[it.i]));
    });
    return parts.join('\n\n') + (parts.length ? '\n' : '');
  }
  el.copy.addEventListener('click', async () => {
    const bib = buildBib(); if (!bib) { toast('Nothing to export yet'); return; }
    try { await navigator.clipboard.writeText(bib); } catch (_) { const ta = document.createElement('textarea'); ta.value = bib; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast('BibTeX copied');
  });
  el.download.addEventListener('click', () => {
    const bib = buildBib(); if (!bib) { toast('Nothing to export yet'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bib], { type: 'application/x-bibtex;charset=utf-8' }));
    a.download = 'references.bib';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('references.bib downloaded');
  });

  // ── Input ─────────────────────────────────────────────────────────────────
  function updateCount() {
    const n = el.input.value.trim() ? AC.splitReferences(el.input.value).length : 0;
    el.count.textContent = `${n} reference${n === 1 ? '' : 's'} detected`;
    LS.set('ac-draft', el.input.value);
  }
  let t; el.input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(updateCount, 250); });
  el.input.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
  el.convert.addEventListener('click', run);
  el.sample.addEventListener('click', () => { el.input.value = SAMPLE; updateCount(); });
  el.clear.addEventListener('click', () => {
    if (state.running) return;
    el.input.value = ''; state.items = []; el.results.classList.add('hidden'); el.err.classList.add('hidden'); updateCount(); el.input.focus();
  });
  function readFile(f) { if (!f) return; if (f.size > 2e6) { showError('That file is too large (limit 2 MB).'); return; } f.text().then(txt => { el.input.value = txt; updateCount(); toast(`Loaded ${f.name}`); }); }
  el.file.addEventListener('change', () => { readFile(el.file.files[0]); el.file.value = ''; });
  ['dragover', 'dragenter'].forEach(n => el.input.addEventListener(n, e => { e.preventDefault(); el.input.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(n => el.input.addEventListener(n, () => el.input.classList.remove('drag')));
  el.input.addEventListener('drop', e => { e.preventDefault(); readFile(e.dataTransfer.files[0]); });
  window.addEventListener('beforeunload', e => { if (state.running) { e.preventDefault(); e.returnValue = ''; } });

  // ── Init ──────────────────────────────────────────────────────────────────
  loadSettings();
  el.input.value = LS.get('ac-draft', '') || '';
  updateCount();
  window.AC.ui = { state, run, buildBib };
})();
