# Ref → BibTeX

> Paste numbered references, get a clean `.bib` file — powered by live metadata lookup from Crossref & Semantic Scholar.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)
![Vanilla JS](https://img.shields.io/badge/built%20with-Vanilla%20JS-f7df1e)

**[▶ Live Demo](https://hassanahmed1166.github.io/ref-to-bibtex/)**

---

## What it does

Paste your numbered reference list (the kind you copy from a Word doc or paper):

```
[1]   S. Li, L. Da Xu, and S. Zhao, "5G internet of things: A survey," Journal of Industrial Information Integration, 2018.
[2]   M. Dumas, M. La Rosa, J. Mendling, and H. A. Reijers, Fundamentals of business process management. Springer, 2013.
[3]   V. Tsiatsis et al., "Chapter 3 - IoT – A Business Perspective," in Internet of Things. Academic Press, 2019, pp. 31-47.
```

Click **Fetch & Convert** and get a ready-to-use `.bib` file:

```bibtex
@article{li2018internet,
  author = {Li, Shancang and Da Xu, Li and Zhao, Shanshan},
  title = {5G Internet of Things: A Survey},
  journal = {Journal of Industrial Information Integration},
  volume = {10},
  pages = {1--9},
  doi = {10.1016/j.jii.2018.01.005},
  year = {2018}
}

@book{dumas2013fundamentals,
  author = {Dumas, Marlon and La Rosa, Marcello and Mendling, Jan and Reijers, Hajo A.},
  title = {Fundamentals of Business Process Management},
  publisher = {Springer},
  year = {2013}
}
```

---

## Features

- **Live metadata lookup** — queries [Crossref](https://www.crossref.org/) then [Semantic Scholar](https://www.semanticscholar.org/) for full, accurate bibliographic data
- **Full author names** — retrieves complete first and last names, not just initials
- **DOI included** — when available from the APIs
- **Smart fallback** — if a paper isn't found online, local parsing is used and flagged with a warning
- **Live progress UI** — see each reference resolve in real time with source attribution
- **Syntax-highlighted output** — colour-coded BibTeX preview
- **One-click download** — saves as `references.bib`
- **No server, no sign-up** — runs entirely in your browser
- **No API keys needed** — Crossref and Semantic Scholar are free public APIs

### Supported reference types

| Type | BibTeX entry |
|------|-------------|
| Journal articles | `@article` |
| Books | `@book` |
| Book chapters | `@incollection` |
| Conference papers | `@inproceedings` |
| Other / unrecognised | `@misc` |

---

## Getting started

### Option 1 — Use the live demo

Just open **[https://hassanahmed1166.github.io/ref-to-bibtex/](https://hassanahmed1166.github.io/ref-to-bibtex/)** in your browser. Nothing to install.

### Option 2 — Run locally

```bash
git clone https://github.com/YOUR-USERNAME/ref-to-bibtex.git
cd ref-to-bibtex
# Open index.html in your browser — no build step needed
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

> **Note:** The API lookups require an internet connection. The local parser fallback works fully offline.

---

## How the lookup pipeline works

```
Input reference
      │
      ▼
 ┌─────────────┐    match found    ┌──────────────────┐
 │  Crossref   │ ────────────────► │  Full metadata   │
 │    API      │                   │  + DOI           │
 └─────────────┘                   └──────────────────┘
      │ no match
      ▼
 ┌─────────────┐    match found    ┌──────────────────┐
 │  Semantic   │ ────────────────► │  Full metadata   │
 │  Scholar    │                   │  + author names  │
 └─────────────┘                   └──────────────────┘
      │ no match
      ▼
 ┌─────────────┐
 │  Local      │ ────────────────► Parsed entry (⚠ flagged)
 │  Parser     │
 └─────────────┘
```

1. **Crossref** — the primary source. Used by publishers worldwide; covers most journal articles, books, and conference papers with DOIs.
2. **Semantic Scholar** — strong coverage of CS, ML, and engineering papers. No key required.
3. **Local parser** — regex-based extraction from the raw reference string. Used as a last resort and flagged clearly in the UI.

---

## Project structure

```
ref-to-bibtex/
├── index.html      # App shell and UI markup
├── style.css       # Styling (DM Mono + Fraunces, dark theme)
├── parser.js       # Local reference parser (offline fallback)
├── lookup.js       # Crossref + Semantic Scholar API client
├── app.js          # UI controller and progress management
└── README.md
```

---

## Limitations

- **Google Scholar is not supported** — it actively blocks automated requests. Crossref and Semantic Scholar cover the majority of academic literature.
- **Older or obscure references** may fall back to local parsing if they aren't indexed by either API.
- **Rate limits** — a small delay is added between requests to respect API fair-use policies.
- Requires an internet connection for API lookups (local parsing works offline).

---

## Contributing

Contributions are welcome! Some ideas for improvements:

- Add [OpenAlex](https://openalex.org/) as a third lookup source
- Support DOI-prefixed references (e.g. `doi:10.1016/...`)
- Export to RIS or EndNote formats
- Dark/light theme toggle

To contribute:

1. Fork the repository
2. Create a branch (`git checkout -b feature/my-improvement`)
3. Commit your changes (`git commit -m 'Add my improvement'`)
4. Push to the branch (`git push origin feature/my-improvement`)
5. Open a Pull Request

---

## License

MIT © 2025 YOUR-USERNAME — see [LICENSE](LICENSE) for details.
