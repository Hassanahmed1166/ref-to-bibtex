p='tests/tests.js'
s=open(p,encoding='utf8').read()
a="  out.textContent += `\n${pass} passed, ${fail} failed\n`;"
assert a in s
new = r"""  // ── ideas ported from CiteVerify ──
  // reference section inside a whole manuscript + layout clean-up
  const paper = ['Title of paper', 'Abstract', 'We study things.', '1. Introduction', 'Text text text.', 'More text here.', 'And more text.', 'Even more.', 'Still more.', 'Methods follow.', 'Results follow.', 'Discussion.', 'References', '[1] A. Smith, "Hyphen-', 'ated words in titles," J. Stuff, vol. 1, pp. 1-2, 2020.', '12', '[2] B. Jones, "Another paper here," J. Other, 2019, doi:10.1000/abc.', 'def123', 'Acknowledgements', 'Thanks to everyone.'].join('\n');
  const prep = AC.prepareInput(paper);
  eq('section found', prep.foundSection, true);
  eq('section excludes ack', /Thanks/.test(prep.text), false);
  eq('page number dropped', /^12$/m.test(prep.text), false);
  eq('hyphen rejoined', /Hyphenated words/.test(prep.text.replace(/\n/g, ' ')) || /Hyphen-ated/.test(prep.text) === false, true);
  eq('split DOI rejoined', /10\.1000\/abcdef123/.test(prep.text), true);
  eq('split from paper = 2 refs', AC.splitReferences(paper).length, 2);
  eq('bare list unchanged', AC.prepareInput('[1] A. One, "T1 title here," J, 2000.').foundSection, false);

  // ISBN / kind / title hypotheses
  eq('isbn13', AC.extractISBN('Press, 2018. ISBN 978-0-262-03561-3.'), '9780262035613');
  eq('isbn10', AC.extractISBN('ISBN: 0-262-03293-7'), '0262032937');
  eq('isbn none', AC.extractISBN('pp. 1234-5678, 2019'), '');
  r = P('Goodfellow, I., Bengio, Y., & Courville, A. (2016). Deep Learning. MIT Press. ISBN 978-0262035613.');
  eq('book kind', [r.kind, r.type, r.isbn], ['book', 'book', '9780262035613']);
  r = P('[2] Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436-444, 2015.');
  eq('article kind', r.kind, 'article');
  r = P('Akhtar, S., & Scarf, P. (2012). Forecasting test cricket match outcomes in play. International Journal of Forecasting, 28(3), 632-643.');
  eq('hypotheses include real title', r.titleCandidates.some(t => /Forecasting test cricket match outcomes in play/.test(t)), true);

  // subtitle-tolerant title matching
  eq('contains subtitle', M.containsTitle('Deep learning for image recognition', 'Deep learning for image recognition: a survey of methods'), true);
  eq('short titles never contain', M.containsTitle('Deep learning', 'Deep learning with python'), false);
  const sub = M.scoreCandidate(P('[1] A. Author, "Deep learning for image recognition," J. X, 2020.'), { title: 'Deep learning for image recognition: a survey of methods', authors: ['Author, A.'], year: '2020' });
  eq('subtitle variant scores high', sub.score > 0.85 && sub.contained && !sub.exact, true);
  const wrongBook = M.scoreCandidate(P('Smith, J. (2020). A very specific monograph on sparrows. Press.'), { title: 'Cooking for beginners', authors: ['Lee, K.'], year: '2020', type: 'book' });
  eq('unrelated book low', wrongBook.score < 0.5, true);

  // catalogue + CSL normalisers
  const L = AC.lookup;
  const ol = L.openlibraryToCand({ title: 'Deep Learning', author_name: ['Ian Goodfellow', 'Yoshua Bengio'], first_publish_year: 2016, publisher: ['MIT Press'], isbn: ['9780262035613'], key: '/works/OL1W' });
  eq('openlibrary cand', [ol.type, ol.authors, ol.year, ol.publisher, ol.isbn], ['book', ['Goodfellow, Ian', 'Bengio, Yoshua'], '2016', 'MIT Press', '9780262035613']);
  const gb = L.googlebooksToCand({ volumeInfo: { title: 'Deep Learning', subtitle: 'Adaptive Computation', authors: ['Ian Goodfellow'], publishedDate: '2016-11-10', publisher: 'MIT Press', industryIdentifiers: [{ type: 'ISBN_10', identifier: '0262035618' }, { type: 'ISBN_13', identifier: '9780262035613' }] } });
  eq('googlebooks cand', [gb.title, gb.year, gb.isbn], ['Deep Learning: Adaptive Computation', '2016', '9780262035613']);
  const csl = L.cslToCand({ type: 'article-journal', title: 'A thing', author: [{ family: 'Doe', given: 'Jane' }], issued: { 'date-parts': [[2021]] }, 'container-title': 'Journal Z', volume: '3', page: '1-9', DOI: '10.5555/XYZ' });
  eq('csl cand', [csl.source, csl.type, csl.authors, csl.journal, csl.doi], ['doiresolver', 'article', ['Doe, Jane'], 'Journal Z', '10.5555/xyz']);
  eq('bibtex isbn', AC.bibtex.entryToBibtex({ type: 'book', authors: ['Goodfellow, I.'], title: 'Deep Learning', publisher: 'MIT Press', year: '2016', isbn: '9780262035613' }, 'k').includes('isbn = {9780262035613}'), true);

"""
s=s.replace(a,new+a)
open(p,'w',encoding='utf8').write(s)
