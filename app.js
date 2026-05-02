/**
 * app.js — UI controller for Ref → BibTeX with live API lookup
 */

const refInput        = document.getElementById('refInput');
const convertBtn      = document.getElementById('convertBtn');
const clearBtn        = document.getElementById('clearBtn');
const copyBtn         = document.getElementById('copyBtn');
const downloadBtn     = document.getElementById('downloadBtn');
const outputSection   = document.getElementById('outputSection');
const progressSection = document.getElementById('progressSection');
const errorSection    = document.getElementById('errorSection');
const bibOutput       = document.getElementById('bibOutput');
const errorMsg        = document.getElementById('errorMsg');
const statsBar        = document.getElementById('statsBar');
const progressList    = document.getElementById('progressList');
const progressLabel   = document.getElementById('progressLabel');
const progressBarFill = document.getElementById('progressBarFill');
const toast           = document.getElementById('toast');

let lastBibText = '';
let isRunning = false;

// ── Convert button ──────────────────────────────────────────────────────────
convertBtn.addEventListener('click', async () => {
  if (isRunning) return;
  const raw = refInput.value.trim();

  hideAll();
  if (!raw) { showError('Please paste your references first.'); return; }

  isRunning = true;
  convertBtn.disabled = true;
  convertBtn.querySelector('span').textContent = 'Fetching…';

  try {
    const refStrings = splitReferences(raw).filter(r => r.trim());
    if (!refStrings.length) throw new Error('No references detected. Make sure entries start with [1], [2], etc.');

    // Build progress items
    initProgressList(refStrings);
    progressSection.style.display = 'block';
    progressLabel.textContent = `Looking up ${refStrings.length} reference${refStrings.length > 1 ? 's' : ''}…`;

    const { bibtex, results, stats } = await lookupAllReferences(
      raw,
      (i, state, label, source) => updateProgressItem(i, state, label, source),
      (done, total) => {
        progressBarFill.style.width = `${Math.round((done / total) * 100)}%`;
        progressLabel.textContent = done === total
          ? `Done — ${done} reference${done > 1 ? 's' : ''} processed`
          : `Processing ${done + 1} of ${total}…`;
      }
    );

    lastBibText = bibtex;
    renderOutput(bibtex, stats);

  } catch (err) {
    showError(err.message);
  } finally {
    isRunning = false;
    convertBtn.disabled = false;
    convertBtn.querySelector('span').textContent = 'Fetch & Convert';
  }
});

// ── Clear ───────────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  if (isRunning) return;
  refInput.value = '';
  hideAll();
  lastBibText = '';
  refInput.focus();
});

// ── Copy ────────────────────────────────────────────────────────────────────
copyBtn.addEventListener('click', () => {
  if (!lastBibText) return;
  navigator.clipboard.writeText(lastBibText).then(() => showToast('Copied to clipboard!')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = lastBibText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Copied to clipboard!');
  });
});

// ── Download ─────────────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (!lastBibText) return;
  const blob = new Blob([lastBibText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'references.bib';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('references.bib downloaded!');
});

// ── Keyboard shortcut ────────────────────────────────────────────────────────
refInput.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') convertBtn.click();
});

// ── Progress UI ──────────────────────────────────────────────────────────────
function initProgressList(refStrings) {
  progressList.innerHTML = '';
  progressBarFill.style.width = '0%';

  refStrings.forEach((ref, i) => {
    // Extract short title from ref string for display
    const numless = ref.replace(/^\s*\[\d+\]\s+/, '');
    const quotedTitle = numless.match(/["\u201C\u201D]([^"\u201C\u201D]{5,60})/);
    const shortLabel = quotedTitle
      ? quotedTitle[1].trim()
      : numless.slice(0, 55).replace(/,$/, '').trim();

    const item = document.createElement('div');
    item.className = 'progress-item pending';
    item.id = `pi-${i}`;
    item.innerHTML = `
      <span class="pi-icon status-icon-pending">○</span>
      <span class="pi-num">[${i+1}]</span>
      <span class="pi-text">
        <span class="pi-title">${escHtml(shortLabel)}…</span>
        <span class="pi-source" id="pi-src-${i}">waiting</span>
      </span>
    `;
    progressList.appendChild(item);
  });
}

function updateProgressItem(i, state, label, source) {
  const item = document.getElementById(`pi-${i}`);
  const srcEl = document.getElementById(`pi-src-${i}`);
  if (!item) return;

  item.className = `progress-item ${state}`;

  const icons = {
    pending:  '○',
    fetching: '<span class="spin">◌</span>',
    found:    '●',
    fallback: '◐',
    failed:   '✕'
  };

  const iconEl = item.querySelector('.pi-icon');
  iconEl.className = `pi-icon status-icon-${state}`;
  iconEl.innerHTML = icons[state] || '○';

  // Update source badge
  if (state === 'found' || state === 'fallback') {
    const srcClass = source === 'crossref' ? 'src-crossref'
                   : source === 'semantic'  ? 'src-semantic'
                   : 'src-local';
    const srcLabel = source === 'crossref' ? '✓ via Crossref'
                   : source === 'semantic'  ? '✓ via Semantic Scholar'
                   : '⚠ local parser (not found online)';
    srcEl.className = `pi-source ${srcClass}`;
    srcEl.textContent = srcLabel;

    // Update title display with the found label
    const titleEl = item.querySelector('.pi-title');
    if (label && label.length > 3) {
      titleEl.textContent = label.length > 70 ? label.slice(0, 70) + '…' : label;
    }
  } else if (state === 'fetching') {
    srcEl.className = 'pi-source';
    srcEl.textContent = label || 'searching…';
  }
}

// ── Output rendering ─────────────────────────────────────────────────────────
function renderOutput(bib, stats) {
  bibOutput.innerHTML = syntaxHighlight(bib);
  
  const pct = n => stats.total ? Math.round((n / stats.total) * 100) : 0;

  statsBar.innerHTML = `
    <span><strong>${stats.total}</strong> entries total</span>
    ${stats.crossref ? `<span><span class="dot"></span>${stats.crossref} from Crossref</span>` : ''}
    ${stats.semantic ? `<span><span class="dot" style="background:var(--accent2)"></span>${stats.semantic} from Semantic Scholar</span>` : ''}
    ${stats.local    ? `<span><span class="dot warn"></span>${stats.local} local parse${stats.local > 1 ? 'd' : ''}</span>` : ''}
  `;

  outputSection.style.display = 'block';
  outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function syntaxHighlight(bib) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return bib.split('\n').map(line => {
    const typeMatch = line.match(/^@(\w+)\{(.+),$/);
    if (typeMatch) return `<span class="bib-type">@${esc(typeMatch[1])}</span>{<span class="bib-key">${esc(typeMatch[2])}</span>,`;

    const fieldMatch = line.match(/^(\s+)(\w+)(\s*=\s*)\{(.*)\}(,?)$/);
    if (fieldMatch) return `${fieldMatch[1]}<span class="bib-field">${esc(fieldMatch[2])}</span>${esc(fieldMatch[3])}<span class="bib-brace">{</span><span class="bib-value">${esc(fieldMatch[4])}</span><span class="bib-brace">}</span>${fieldMatch[5]}`;

    if (line.trim() === '}') return `<span class="bib-brace">}</span>`;
    return esc(line);
  }).join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function hideAll() {
  outputSection.style.display   = 'none';
  progressSection.style.display = 'none';
  errorSection.style.display    = 'none';
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorSection.style.display = 'flex';
  errorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
