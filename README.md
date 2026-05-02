# Ref → BibTeX · AI Source Authenticator & Citation Converter

> **Verify, authenticate, and convert academic references** — paste any citation format and get clean BibTeX with real-time legitimacy scores, AI hallucination detection, and triple-API cross-verification.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-hassanahmed1166.github.io-00d4aa?style=for-the-badge)](https://hassanahmed1166.github.io/ref-to-bibtex/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Made with JavaScript](https://img.shields.io/badge/Made%20with-Vanilla%20JS-f59e0b?style=for-the-badge)](https://hassanahmed1166.github.io/ref-to-bibtex/)
[![Author](https://img.shields.io/badge/Author-Hassan%20Ahmed-7c6ff7?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/hassanahmed1166/)

---

## What Is This?

**ref→bib** is a browser-based **academic reference verifier, source authenticator, and BibTeX converter** — built for researchers, students, and academics who need to:

- **Verify that cited sources actually exist** before submitting a paper
- **Detect AI-hallucinated or fabricated references** in manuscripts
- **Convert any citation format** (APA, IEEE, MLA, Chicago, Vancouver, Harvard) to BibTeX
- **Authenticate scholarly sources** against three independent academic databases
- **Identify predatory journals** and fake citation patterns automatically

No sign-up. No backend. No data leaves your browser — except queries to open academic APIs.

---

## 🔴 The Problem This Solves

Large language models confidently generate **fake citations** — papers that look legitimate but do not exist. Journals, institutions, and supervisors are increasingly encountering:

- Fabricated DOIs that resolve to nothing
- Realistic-looking author names attached to nonexistent papers
- AI-template titles ("A comprehensive review of…", "Towards a framework for…")
- Plausible-sounding journals that were never published

**This tool cross-references every citation against Crossref, Semantic Scholar, and OpenAlex** in real time — flagging anything that cannot be verified with a clear score and explanation.

---

## ✨ Features

### 🔍 Triple-API Source Authentication
Every reference is simultaneously verified against **three independent scholarly databases**:

| Database | Coverage | Strength |
|----------|----------|----------|
| **Crossref** | 150M+ records | DOI resolution, journal metadata |
| **Semantic Scholar** | 200M+ papers | CS, AI, biomedical, preprints |
| **OpenAlex** | 240M+ works | Open access, global coverage |

A reference that cannot be found in any of these three sources is flagged with a legitimacy score and a clear explanation of why.

### 🧠 Smart Multi-Strategy Search (v4)
Unlike naive implementations that give up if the parsed title doesn't match exactly, **ref→bib v4 tries multiple search strategies per reference**:

1. **DOI fast-path** — If a DOI is present, all 3 APIs are queried in parallel. Guaranteed exact match.
2. **arXiv fast-path** — arXiv IDs are resolved directly via Semantic Scholar.
3. **Parsed title + first author** — Clean extracted metadata is used for targeted search.
4. **Raw reference string** — The full citation text is sent as a bibliographic query (Crossref is optimized for this).
5. **Title-only search** — In case author/year noise muddles the query.
6. **Author + year fallback** — Last resort for minimally-structured references.

All three APIs are queried **in parallel** for each strategy — dramatically reducing wait times.

### 🔤 Semantic Abbreviation Expansion
Academic citations routinely use abbreviations that break naive string matching. v4 expands them before comparison:

```
"UAVs" ↔ "Unmanned Aerial Vehicles"
"IoT"  ↔ "Internet of Things"
"NLP"  ↔ "Natural Language Processing"
"IDS"  ↔ "Intrusion Detection System"
"MANET" ↔ "Mobile Ad Hoc Network"
```

50+ domain-specific mappings covering CS, networking, AI/ML, and engineering.

### 🤖 AI Hallucination Detection
Every reference title is analyzed for patterns that appear overwhelmingly in LLM-generated (fake) citations:

- `"A comprehensive/systematic review of…"` — AI survey template
- `"Exploring the role/impact/effect of…"` — AI causal study template
- `"Towards a framework/model/understanding of…"` — AI proposal template
- `"The nexus/interplay/intersection of…"` — AI buzzword combination
- `"Unveiling/Navigating/Harnessing the [era/landscape/ecosystem] of AI…"` — AI hype language
- `"Challenges and opportunities in…"` — classic AI filler title
- Short, generic titles like "A Study on X" or "Research on Y"

Detection is **suppressed for IEEE venues** — legitimate survey papers in IEEE journals use similar phrasing.

### 📊 Legitimacy Score (0–100%)
Each reference receives a score and one of four verdicts:

| Verdict | Badge | Meaning |
|---------|-------|---------|
| **Verified** | `✔ 87%` | Found in an API with strong title match — likely real |
| **Warning** | `⚠ 64%` | Found but with caveats — check manually |
| **Suspect** | `? 41%` | Not confirmed, unusual metadata — investigate |
| **Fake** | `✕ FAKE` | Not found anywhere + AI title signals — do not cite |

**Score components:**

| Check | Weight |
|-------|--------|
| API verification | 35 pts |
| Title match strictness | 20 pts |
| DOI validity | 10 pts |
| AI title pattern clean | 10 pts |
| Year plausibility | 8 pts |
| Author plausibility | 7 pts |
| Journal/venue check | 5 pts |
| Page range validity | 3 pts |
| Cross-field consistency | 2 pts |

### 📋 Universal Format Support
Paste references in **any format** — even mixed — in a single paste:

| Format | Example |
|--------|---------|
| **IEEE** | `[1] H. Shakhatreh et al., "Unmanned aerial vehicles (UAVs)," IEEE Access, vol. 7, pp. 48572–48634, 2019.` |
| **APA** | `Shakhatreh, H. (2019). Unmanned aerial vehicles. IEEE Access, 7, 48572–48634.` |
| **MLA** | `Shakhatreh, Hazim. "Unmanned Aerial Vehicles." IEEE Access 7 (2019): 48572–48634.` |
| **Chicago** | `Shakhatreh, Hazim. 2019. "Unmanned Aerial Vehicles." IEEE Access 7: 48572–48634.` |
| **Vancouver** | `1. Shakhatreh H et al. Unmanned aerial vehicles. IEEE Access. 2019;7:48572–634.` |
| **Harvard** | `Shakhatreh, H. (2019) 'Unmanned aerial vehicles', IEEE Access, 7, pp. 48572–48634.` |
| **Raw/Mixed** | Unstructured text, copy-pasted from PDFs, Google Scholar exports |

### 🛡️ LLM Structural Validator (Fallback)
For references that pass the parser and fail all API lookups, an LLM structural check assesses:
- Is the volume/year combination plausible for this journal?
- Does the page range make sense for this article type?
- Do the author names follow real-world formatting conventions?
- Does the journal/venue name look real or hallucinated?

This catches cases where a paper may be too recent, too obscure, or from a conference not yet indexed — preventing legitimate references from being incorrectly flagged.

### ⚡ Smart Preprocessing
Before any parsing occurs, the input is:
- Stripped of Word smart quotes (`"` → `"`, `'` → `'`)
- Cleaned of zero-width Unicode characters (common when copy-pasting from PDFs)
- Normalized whitespace and line breaks
- Scanned for DOIs via regex before any parsing begins (DOI fast-path)
- Scanned for arXiv IDs (`arXiv:2410.02827`)

---

## 🚀 Live Demo

**[https://hassanahmed1166.github.io/ref-to-bibtex/](https://hassanahmed1166.github.io/ref-to-bibtex/)**

Paste your references, click **Convert & Verify**, and get:
- BibTeX output with syntax highlighting
- Per-reference legitimacy badges
- Flagged/unresolved panel for anything suspicious
- One-click copy or `.bib` download

---

## 📖 How to Use

### 1. Paste references
Drop in any number of references — from a reference list, a PDF, Google Scholar, or your notes. Mixed formats are fine.

```
[1] Hazim Shakhatreh et al. Unmanned aerial vehicles (uavs): A survey on civil
    applications and key research challenges. IEEE access, 7:48572–48634, 2019.

Smith, J. (2023). Deep learning for intrusion detection in IoT. IEEE Transactions
    on Services Computing, 16(4), 1800–1815. https://doi.org/10.1109/TSC.2023.XXXX

arXiv:2410.02827
```

### 2. Select format (optional)
Leave on **Auto-detect** (recommended) or choose a specific format if all your references share one style.

### 3. Click Convert & Verify
Watch real-time progress as each reference is resolved. The strategy used (DOI, raw string, title search, etc.) is shown per reference.

### 4. Review results
- **Green badges** → safe to use
- **Yellow badges** → double-check the source
- **Red FAKE badges** → do not include in your manuscript
- Flagged references appear in the bottom panel with specific reasons

### 5. Export
Copy to clipboard or download as `references.bib`.

---

## 🛠️ Technical Architecture

```
Input (raw reference text)
        │
        ▼
┌─────────────────────┐
│   Preprocessing     │  Sanitize → Extract DOI/arXiv → Split references
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Format Detection   │  IEEE / APA / MLA / Chicago / Vancouver / Harvard / Unknown
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Query Strategies   │  DOI → arXiv → Title+Author → Raw string → Title-only → Author+Year
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│         Parallel API Resolution              │
│  Crossref ──┐                                │
│  Semantic Scholar ──┤──→ Best match selected │
│  OpenAlex ──┘                                │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Similarity Scoring │  Jaccard + abbreviation expansion + adaptive threshold
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Legitimacy Verify  │  Score 0–100, AI pattern check, journal check, field checks
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  LLM Fallback       │  Structural consistency check via Claude Haiku (local only)
└──────────┬──────────┘
           │
           ▼
     BibTeX + Verdicts
```

### Key Design Decisions

**Why lower the Jaccard threshold to 0.45–0.62?**
The previous threshold of 0.78 was rejecting legitimate references. A title like *"Unmanned aerial vehicles (UAVs): A survey"* scores ~0.05 Jaccard against the full expanded title because the abbreviation "UAVs" matches nothing. After abbreviation expansion, the same comparison scores 0.89.

**Why send the raw string as a query?**
Crossref's `query.bibliographic` endpoint is specifically designed to accept raw citation strings and return the most likely match. This is more reliable than relying on a correctly-parsed title field when the reference format is unusual.

**Why parallel API calls?**
Sequential fallback (try Crossref, if fail try Semantic Scholar, if fail try OpenAlex) adds 9–27 seconds per unresolved reference. Parallel calls reduce this to ~3 seconds regardless of how many APIs return results.

---

## 🔒 Privacy

- All processing runs **entirely in your browser**
- References are only sent to: Crossref API, Semantic Scholar API, OpenAlex API (all public, free, no-auth scholarly databases)
- The LLM structural check calls the Anthropic API (only for references not found in any database)
- No data is stored, logged, or retained anywhere

---

## 📦 File Structure (v4 — single file)

```
ref-to-bibtex/
├── ref2bib_v4.html     ← Everything in one file: UI, parser, lookup, verifier
└── README.md
```

v4 consolidates all modules into a single self-contained HTML file for easy deployment, GitHub Pages hosting, and offline use.

---

## 🔄 Changelog

### v4 (current) — Smart Multi-Strategy Resolver
- **Semantic abbreviation expansion** — 50+ academic abbreviation mappings (UAV, IoT, IDS, MANET, NLP, etc.)
- **Adaptive similarity thresholds** — 0.45 for abbreviated titles, 0.50 for short titles, 0.62 for regular
- **Multi-strategy parallel search** — 6 query strategies × 3 APIs = up to 18 lookup paths per reference
- **Raw string search** — sends full citation text to Crossref's bibliographic query endpoint
- **arXiv fast-path** — direct resolution via Semantic Scholar
- **Best-candidate selection** — when multiple APIs respond, picks highest-similarity result
- **Smart preprocessing** — strips Word artifacts, zero-width chars, normalizes encoding
- **Single-file architecture** — all modules consolidated into `ref2bib_v4.html`

### v3
- IEEE-specific fixes: blank `no.` field, journal extraction, quarter/season notation
- KNOWN_LEGITIMATE_VENUES expanded with IEEE/ACM abbreviated names
- LLM structural validator added for local fallbacks
- OpenAlex added as third API source

### v2
- Crossref + Semantic Scholar dual-API lookup
- Rule-based legitimacy scoring
- AI hallucination title pattern detection
- Dark/light theme

### v1
- Local parser only, no API lookup
- Basic APA/IEEE/MLA support

---

## 🧪 Example: Real vs. Fake References

### ✅ Legitimate reference (all 4 from your test pass in v4)
```
[1] Hazim Shakhatreh, Ahmad H Sawalmeh, AlaAl-Fuqaha et al. Unmanned aerial 
    vehicles (uavs): A survey on civil applications and key research challenges. 
    IEEE access, 7:48572–48634, 2019.
```
**Result:** `✔ 91% · via Crossref · strategy: raw reference string`

```
[3] Abdulaziz A Alzubaidi. Systematic literature review for detecting intrusions 
    in unmanned aerial vehicles using machine and deep learning. IEEE Access, 2025.
```
**Result:** `✔ 83% · via Semantic Scholar · strategy: title + author`

### ❌ AI-hallucinated reference (correctly flagged)
```
[X] John Smith, "Exploring the Role of Deep Learning in Enhancing Cybersecurity 
    Frameworks: A Comprehensive Review," International Journal of Advanced 
    Innovative Research, vol. 12, no. 4, pp. 1–15, 2023.
```
**Result:** `✕ FAKE · Not found in any API · AI template: "Exploring the role of" · Predatory journal pattern`

---

## 🤝 Contributing

Issues, PRs, and feature requests are welcome. Areas for improvement:
- Additional abbreviation mappings (`ABBREV_MAP` in the source)
- Additional known-legitimate venue patterns (`KNOWN_LEGITIMATE_VENUES`)
- Additional citation format parsers
- Better handling of non-English references

---

## 👤 Author

**Hassan Ahmed**
- LinkedIn: [linkedin.com/in/hassanahmed1166](https://www.linkedin.com/in/hassanahmed1166/)
- Live demo: [hassanahmed1166.github.io/ref-to-bibtex](https://hassanahmed1166.github.io/ref-to-bibtex/)

---

## 📄 License

MIT — free to use, fork, and modify. Attribution appreciated.

---

## 🔎 Keywords

*academic reference verifier · citation authenticator · AI hallucination detector · fake reference checker · BibTeX converter · reference validator · source verification tool · citation integrity checker · scholarly source authenticator · APA to BibTeX · IEEE to BibTeX · MLA to BibTeX · Chicago to BibTeX · Vancouver to BibTeX · Harvard to BibTeX · Crossref lookup · Semantic Scholar API · OpenAlex API · reference format converter · bibliography generator · LaTeX bibliography · academic integrity tool · citation fraud detection · predatory journal detector · AI-generated citation detector · reference list verifier · doi lookup · bibtex generator online · free bibtex converter · open access citation tool · research paper verifier · citation checker online · bibliography validator · fake citation detector · LLM hallucination references*
