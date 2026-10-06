// Serve the repo root (python -m http.server) and open tests/index.html — results print on the page and in window.__results.
(function () {
  const out = document.getElementById('out'); let pass = 0, fail = 0;
  const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    ok ? pass++ : fail++;
    out.textContent += (ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`) + '\n';
  };
  const P = AC.parseReference, S = AC.splitReferences;

  // splitting
  eq('split bracket', S('[1] A. One, "T1 title here," J, 2000.\n[2] B. Two, "T2 title here," J, 2001.').length, 2);
  eq('split soft-wrapped', S('[1] Hazim Shakhatreh, Ahmad Sawalmeh, "A long\ntitle that wraps," IEEE Access, 7:1-10,\n2019.\n[2] Next one here, "Another title," J, 2020.').length, 2);
  eq('split ignores stray number line', S('1. Smith, J. (2020). Title of a paper. Journal, 1(2), 3-4.\n10 Mbps links are fast in this wrapped line, 5-6.\n2. Doe, K. (2019). Other paper title. Journal, 5, 1-2.').length, 2);
  eq('split blank-line separated', S('Smith, J. (2020). Title of a paper. Journal, 1(2), 3-4.\n\nDoe, K. (2019). Other paper title. Journal, 5, 1-2.').length, 2);
  eq('split un-numbered one per line', S('Smith, J. (2020). Title of a paper here. Journal, 1(2), 3-4.\nDoe, K. (2019). Other paper title here. Journal, 5, 1-2.').length, 2);

  // IEEE quoted
  let r = P('[1] K. He, X. Zhang, S. Ren, and J. Sun, "Deep residual learning for image recognition," in Proc. IEEE Conf. Comput. Vis. Pattern Recognit. (CVPR), 2016, pp. 770-778.');
  eq('ieee title', r.title, 'Deep residual learning for image recognition');
  eq('ieee authors', r.authors, ['He, K.', 'Zhang, X.', 'Ren, S.', 'Sun, J.']);
  eq('ieee year/pages', [r.year, r.pages, r.type], ['2016', '770-778', 'inproceedings']);
  r = P('[2] Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436-444, 2015.');
  eq('ieee journal', [r.journal, r.volume, r.number, r.pages, r.year, r.type], ['Nature', '521', '7553', '436-444', '2015', 'article']);
  eq('ieee authors2', r.authors, ['LeCun, Y.', 'Bengio, Y.', 'Hinton, G.']);

  // APA
  r = P('Vaswani, A., Shazeer, N., Parmar, N., & Polosukhin, I. (2017). Attention is all you need. Advances in Neural Information Processing Systems, 30.');
  eq('apa authors', r.authors, ['Vaswani, A.', 'Shazeer, N.', 'Parmar, N.', 'Polosukhin, I.']);
  eq('apa title', r.title, 'Attention is all you need');
  eq('apa year', r.year, '2017');
  r = P('Smith, J. A. (2020). A study of things. Journal of Stuff, 10(2), 100-110. https://doi.org/10.1000/xyz123.');
  eq('apa doi/vol/pages', [r.doi, r.volume, r.number, r.pages, r.journal], ['10.1000/xyz123', '10', '2', '100-110', 'Journal of Stuff']);

  // Harvard single-quote title
  r = P("Goodfellow, I. et al. (2014) 'Generative adversarial nets', Advances in Neural Information Processing Systems, 27.");
  eq('harvard title', r.title, 'Generative adversarial nets');
  eq('harvard authors', r.authors, ['Goodfellow, I.', 'others']);

  // Vancouver
  r = P('1. Smith JA, Jones KB. Neural networks in medicine. Lancet. 2019;393(10):123-130.');
  eq('vancouver authors', r.authors, ['Smith, J. A.', 'Jones, K. B.']);
  eq('vancouver title', r.title, 'Neural networks in medicine');
  eq('vancouver vol/num/pages/year', [r.volume, r.number, r.pages, r.year, r.journal], ['393', '10', '123-130', '2019', 'Lancet']);

  // unquoted with full names + et al
  r = P('[4] Hazim Shakhatreh et al. Unmanned aerial vehicles (UAVs): A survey on civil applications and key research challenges. IEEE Access, 7:48572-48634, 2019.');
  eq('shakhatreh title', r.title, 'Unmanned aerial vehicles (UAVs): A survey on civil applications and key research challenges');
  eq('shakhatreh meta', [r.journal, r.volume, r.pages, r.year], ['IEEE Access', '7', '48572-48634', '2019']);
  eq('shakhatreh authors', r.authors, ['Shakhatreh, Hazim', 'others']);

  // Chicago
  r = P('Smith, John. 2020. "A Study of Things." Journal of Stuff 10 (2): 100-110.');
  eq('chicago title/year', [r.title, r.year], ['A Study of Things', '2020']);

  // DOI-only
  r = P('https://doi.org/10.1038/nature16961');
  eq('doi only', r.doi, '10.1038/nature16961');

  // names
  eq('particles', AC.personToBib('Ludwig van Beethoven'), 'van Beethoven, Ludwig');
  eq('suffix', AC.personToBib('Martin Luther King Jr.'), 'King Jr, Martin Luther');
  eq('org', AC.personToBib('{World Health Organization}'), '{World Health Organization}');

  // bibtex
  const B = AC.bibtex;
  eq('escape', B.entryToBibtex({ type: 'article', authors: ['Doe, J.'], title: 'R&D at 50% of UAV cost', journal: 'J', year: '2020', pages: '1-5' }, 'k').includes('{R\\&D} at 50\\% of {UAV} cost'), true);
  eq('pages en-dash', B.entryToBibtex({ type: 'article', authors: ['Doe, J.'], title: 't', year: '2020', pages: '10-20' }, 'k').includes('pages = {10--20}'), true);
  eq('clean html', B.cleanText('Fish &amp; <i>Chips</i> in H<sub>2</sub>O'), 'Fish & Chips in H2O');
  eq('unique keys', B.uniqueKeys([{ authors: ['A, B'], year: '2020', title: 'Deep nets' }, { authors: ['A, B'], year: '2020', title: 'Deep nets' }]), ['a2020deep', 'a2020deepb']);
  eq('key diacritics', B.makeCiteKey({ authors: ['Müller, K.'], year: '2019', title: 'The Zebra' }), 'muller2019zebra');
  eq('valid type', /^@misc\{/.test(B.entryToBibtex({ type: 'weird', authors: [], title: 't' }, 'k')), true);

  // matching
  const M = AC.match;
  const parsed = P('[2] Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436-444, 2015.');
  const good = { title: 'Deep learning', authors: ['LeCun, Yann', 'Bengio, Yoshua', 'Hinton, Geoffrey'], year: '2015' };
  const wrong = { title: 'Deep learning for tomographic image reconstruction', authors: ['Wang, Ge'], year: '2020' };
  eq('good score high', M.scoreCandidate(parsed, good).score > 0.9, true);
  eq('wrong score low', M.scoreCandidate(parsed, wrong).score < 0.45, true);
  const noTitleParse = { raw: 'He, K., Zhang, X., Ren, S., Sun, J. Deep residual learning for image recognition. CVPR 2016.', title: '', authors: [], year: '2016' };
  eq('raw coverage rescues bad parse', M.scoreCandidate(noTitleParse, { title: 'Deep Residual Learning for Image Recognition', authors: ['He, Kaiming'], year: '2016' }).score > 0.85, true);

  // crossref normaliser
  const c = AC.lookup.crossrefToCand({ type: 'journal-article', title: ['Deep <i>learning</i>'], author: [{ family: 'LeCun', given: 'Yann' }, { name: 'Some Consortium' }], issued: { 'date-parts': [[2015, 5]] }, 'container-title': ['Nature'], volume: '521', issue: '7553', page: '436--444', DOI: '10.1038/NATURE14539' });
  eq('crossref cand', [c.type, c.title, c.authors, c.year, c.pages, c.doi], ['article', 'Deep learning', ['LeCun, Yann', '{Some Consortium}'], '2015', '436-444', '10.1038/nature14539']);

  out.textContent += `\n${pass} passed, ${fail} failed\n`;
  window.__results = { pass, fail };
})();
