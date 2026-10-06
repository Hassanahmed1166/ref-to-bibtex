/**
 * match.js — decides whether a database record really is the pasted reference.
 *
 * Unlike a title-only comparison, a candidate is scored on title, authors AND
 * year, and the title is also compared against the raw pasted text so a
 * mis-parsed title does not sink a correct match.
 */
(function (root) {
  'use strict';
  const AC = root.AC = root.AC || {};

  const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'for', 'and', 'to', 'with', 'from', 'is', 'are', 'via', 'its', 'new', 'using', 'toward', 'towards', 'how', 'between', 'their', 'this', 'that', 'into', 'by', 'at', 'as', 'be', 'or']);
  const ABBREV = { uav: 'unmanned aerial vehicle', uavs: 'unmanned aerial vehicles', iot: 'internet of things', ids: 'intrusion detection system', ips: 'intrusion prevention system', ddos: 'distributed denial of service', llm: 'large language model', gan: 'generative adversarial network', cnn: 'convolutional neural network', lstm: 'long short term memory', vanet: 'vehicular ad hoc network', manet: 'mobile ad hoc network' };

  function tokens(s) {
    const words = AC.stripDiacritics(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const out = [];
    for (const w of words) {
      out.push(w);
      if (ABBREV[w]) out.push(...ABBREV[w].split(' '));
    }
    return out.filter(w => w.length > 1 && !STOP.has(w));
  }
  function jaccard(a, b) {
    const A = new Set(a), B = new Set(b);
    if (!A.size || !B.size) return 0;
    let inter = 0; for (const x of A) if (B.has(x)) inter++;
    return inter / (A.size + B.size - inter);
  }
  const coverage = (needle, hay) => {
    const N = [...new Set(needle)];
    return N.length ? N.filter(w => hay.has(w)).length / N.length : 0;
  };
  const exactTitle = (a, b) => !!a && !!b && AC.normWord(a) === AC.normWord(b);

  /**
   * @param parsed  the locally parsed reference (has .raw .title .authors .year)
   * @param cand    a normalised database record
   * @returns {score 0..1, title, authors, year, exact}
   */
  function scoreCandidate(parsed, cand) {
    const rawSet = new Set(tokens(parsed.raw));
    const candTitle = tokens(cand.title);
    const jac = parsed.title ? jaccard(tokens(parsed.title), candTitle) : 0;
    // Coverage of the candidate's title inside the raw text rescues a mis-parsed title,
    // but short titles ("The Digital Era") are contained in almost any text, so scale by length.
    const cov = coverage(candTitle, rawSet) * Math.min(1, candTitle.length / 4);
    const exact = exactTitle(parsed.title, cand.title);
    const covWeight = parsed.title ? (jac > 0.3 ? 0.9 : 0.6) : 0.95;
    const title = exact ? 1 : Math.max(jac, cov * covWeight);

    let authors = null;
    // Compare only as many authors as the reference actually lists ("Smith et al." lists one).
    const listed = (parsed.authors || []).filter(a => a !== 'others');
    const n = Math.min(3, Math.max(1, listed.length || 3));
    const candAuth = (cand.authors || []).filter(a => a !== 'others').slice(0, n);
    if (candAuth.length) {
      const rawNorm = ' ' + AC.stripDiacritics(parsed.raw).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
      let hit = 0;
      for (const a of candAuth) {
        const fam = AC.normWord(AC.familyName(a));
        if (fam.length < 2 || !rawNorm.includes(' ' + fam + ' ')) continue;
        // same surname — if the reference gives an initial for that person, it should agree
        const ref = listed.find(l => AC.normWord(AC.familyName(l)) === fam);
        const refInit = ref && AC.normWord((ref.split(',')[1] || '').trim()).charAt(0);
        const candInit = AC.normWord((a.split(',')[1] || '').trim()).charAt(0);
        hit += refInit && candInit && refInit !== candInit ? 0.3 : 1;
      }
      authors = hit / candAuth.length;
    }
    let year = null;
    if (parsed.year && cand.year) {
      const d = Math.abs(+parsed.year - +cand.year);
      year = d === 0 ? 1 : d === 1 ? 0.6 : 0;                      // online-first vs print year
    }
    const w = [[title, 0.6], [authors, 0.25], [year, 0.15]].filter(([v]) => v !== null);
    const total = w.reduce((s, [, k]) => s + k, 0);
    const score = w.reduce((s, [v, k]) => s + v * k, 0) / total;
    return { score, title, authors, year, exact };
  }

  // ── Heuristic red flags (hints for a human, never a verdict) ─────────────
  const STYLE_PATTERNS = [
    [/\b(?:unveiling|navigating|harnessing|leveraging|unpacking|demystifying|reimagining)\b.*\b(?:era|landscape|paradigm|ecosystem|frontier)\b/i, 'Buzzword-heavy title'],
    [/\bthe\s+(?:nexus|interplay|confluence|synergy)\s+(?:of|between)\b/i, 'Generic "nexus/interplay" phrasing'],
    [/\bchallenges?\s+and\s+opportunities\b/i, 'Generic "challenges and opportunities" phrasing'],
    [/\bexploring\s+the\s+(?:role|impact|effect|influence|relationship|dynamics|interplay)\s+of\b/i, 'Generic "Exploring the role of" phrasing']
  ];
  const PREDATORY = /\binternational\s+journal\s+of\s+(?:advanced|innovative|modern|global|universal|emerging|progressive)\s+(?:research|studies|science|knowledge|engineering)\b|\b(?:ijarcsse|ijarcce|ijetae|ijeset|ijltemas)\b/i;

  function redFlags(entry, parsed) {
    const f = [];
    const y = parseInt(entry.year, 10), now = new Date().getFullYear();
    if (!entry.year) f.push('No year');
    else if (y < 1500 || y > now + 1) f.push(`Implausible year ${entry.year}`);
    const pg = (entry.pages || '').match(/^(\d+)\s*-+\s*(\d+)$/);
    if (pg && (+pg[2] < +pg[1] || +pg[2] - +pg[1] > 3000)) f.push(`Odd page range ${entry.pages}`);
    if (!(entry.authors || []).length) f.push('No authors');
    if ((entry.authors || []).length > 40) f.push(`Very many authors (${entry.authors.length})`);
    const venue = entry.journal || entry.booktitle || '';
    if (PREDATORY.test(venue)) f.push(`Venue name matches a predatory-journal pattern: "${venue}"`);
    for (const [re, msg] of STYLE_PATTERNS) if (re.test(parsed.title || entry.title || '')) f.push(msg);
    return f;
  }

  AC.match = { tokens, jaccard, coverage, scoreCandidate, redFlags, exactTitle };
  if (typeof module !== 'undefined' && module.exports) module.exports = AC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
