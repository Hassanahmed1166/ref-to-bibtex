# AuthentiCite — References → verified BibTeX

Paste references in any common style, get BibTeX, and **check every entry side by side** against the text you pasted.
Runs entirely in the browser (static files, no backend). The only network traffic is lookups to the public
[Crossref](https://www.crossref.org/), [OpenAlex](https://openalex.org/) and [Semantic Scholar](https://www.semanticscholar.org/) APIs.

**Live demo:** https://hassanahmed1166.github.io/ref-to-bibtex/

## How it works

1. **Split & parse** – the pasted block is split into references (numbered `[1]`/`1.`, blank-line separated, or one per line)
   and each is parsed locally (IEEE, APA, Harvard, MLA, Chicago, Vancouver, bare DOI / arXiv id).
2. **Resolve** – DOI / arXiv ids are looked up directly; otherwise Crossref and OpenAlex are searched (raw text, then
   title + author, then a year-filtered search), with Semantic Scholar as the last resort. Requests are rate-limited,
   retried with back-off, cached, and a host that keeps failing is skipped for a minute.
3. **Score** – every candidate is scored on title, authors **and** year (0–100 %). The title is also compared with the raw text,
   so a mis-parsed title does not sink a correct match; short generic titles are discounted.
4. **Review** – each reference is shown next to its BibTeX. Words that appear in both are highlighted green; words that are in the
   BibTeX but not in your text are amber. You can accept/reject a row, pick one of the other candidate matches, fix the text and
   re-check it, or edit the BibTeX by hand.
5. **Export** – copy or download a `.bib` of everything except rejected rows (or verified/accepted only). Unverified entries are
   preceded by a `% NOT VERIFIED` comment.

### Statuses

| Status | Meaning |
|---|---|
| **Verified** | A record matched on title, authors and year |
| **Check this** | A plausible record was found but something differs (year, authors, loose title…) — look at the pair |
| **Not found** | No record matched. It may be a book, report, web page or unindexed source — or may not exist |
| **Lookup failed** | The databases could not be reached |

Flags such as "DOI resolves to a different paper" or "predatory-journal pattern" are **hints for a human**, not proof of fabrication.

## Features

- Side-by-side reference ↔ BibTeX review with word-level highlighting, per-row accept / reject / edit / retry
- Alternative candidates per reference ("Use this")
- Filters (verified / check / not found / rejected) and "accept all verified"
- LaTeX-safe output: `& % $ # _` escaped, acronyms protected (`{UAV}`), `--` page ranges, HTML/JATS tags and entities stripped,
  organisation authors, name particles (`van`, `de`…), unique citation keys (`smith2020deep`, `smith2020deepb`)
- Options: databases on/off, matching strictness, key style, parallelism, optional contact e-mail for the "polite" API pools
- Open a `.txt` file or drag it onto the box; draft and settings are remembered locally
- Light/dark theme (follows the OS), keyboard shortcut `Ctrl+Enter`, responsive, print-friendly

## Project layout

```
index.html          converter page
about.html, suggestions.html
css/converter.css   converter styles (shared tokens live in style.css)
js/parser.js        splitting + local parsing
js/lookup.js        Crossref / OpenAlex / Semantic Scholar clients + resolver
js/match.js         candidate scoring + red-flag heuristics
js/bibtex.js        escaping, keys, BibTeX writer
js/app.js           UI
js/theme.js         shared light/dark handling
tests/              open tests/index.html (served over http) for the unit tests
```

No build step: `python -m http.server` in the repo root and open <http://localhost:8000>.

## Privacy

Reference text is sent only to the three APIs above. Settings, your draft and usage counters stay in `localStorage`.
The optional e-mail in *Options* is sent only to Crossref/OpenAlex as a `mailto` parameter.

## Limitations

- Books, theses, reports, web pages and non-DOI conference papers are poorly covered by these databases and often land in *Not found* or *Check this*.
- Parsing unusual or heavily abbreviated styles can fail; use **Edit text** on the row and re-check.
- Semantic Scholar may rate-limit or block browser requests; the tool then relies on Crossref and OpenAlex.

MIT licensed.
