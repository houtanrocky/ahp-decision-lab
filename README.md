# AHP Decision Lab

A private, local-first decision tool. Add your own options and criteria, compare
them in pairs, inspect the calculations, and export the result. The shipped
workspace is empty: it contains no résumé, faculty profiles, or sample personal
decision.

The interface supports English and Persian. The language picker switches the
text, number formatting, and left-to-right / right-to-left layout.

**Live app:** <https://houtanrocky.github.io/ahp-decision-lab/> · **Source:**
<https://github.com/houtanrocky/ahp-decision-lab>

## Use it

1. Open the [live app](https://houtanrocky.github.io/ahp-decision-lab/) or serve
   this folder over HTTP. No installation or build step is required.
2. Choose English or فارسی in the language menu. The app remembers your choice.
3. Add 2–10 options and 2–10 criteria. Rename or remove any item as needed.
4. Compare the criteria to set their relative importance.
5. Choose **Options by criterion** and compare the options for every criterion.
6. Review the ranking, contribution table, consistency ratios, calculation
   details, and sensitivity analysis.
7. Export the editable decision as JSON for backup or transfer. Export CSV for
   the calculated result table.

New comparisons begin equal (1:1). Adding or removing an item preserves
comparisons between existing items; comparisons involving a newly added item
start equal. Editing labels does not change judgments.

## Privacy

The app loads its English and Persian JSON language files from the same site.
Decision data is not sent to that site or any other service; it stays in local
storage in this browser profile. JSON export includes the option and
criterion names, judgments, and optional comparison notes, so treat exported
files as user data. Reset or clear local browser storage to remove the saved
workspace. Exported files must be deleted separately.

## How the result works

The Analytic Hierarchy Process (AHP) builds reciprocal matrices from pairwise
judgments, derives normalized priority weights, and combines option priorities
using the criterion weights. The app offers two solvers: principal right
eigenvector by power iteration and row geometric mean (RGMM). The consistency
ratio is a common coherence check; a low ratio does not prove that a judgment is
true. Final shares represent preferences conditional on the judgments, not
probabilities or guarantees.

Sensitivity analysis changes one criterion weight while preserving the
proportions between the others. It is a what-if scenario and does not modify the
pairwise matrices.

## Project map

| Path | Purpose |
|---|---|
| `index.html` | Product interface and method explanation |
| `styles.css` | Layout, components, and responsive styling |
| `src/app.js` | Blank workspace, editing, local persistence, rendering, import/export |
| `src/ahp.js` | Pure AHP math, matrix and model validation |
| `src/model.js` | Testable add/remove/rename operations for user-defined items |
| `src/data.js` | Empty schema-versioned starting model |
| `src/i18n.js` | Locale loading, interpolation, and document language/direction |
| `locales/en.json` | English interface translations |
| `locales/fa.json` | Persian interface translations |
| `scripts/audit.js` | Command-line audit of an exported decision JSON file |
| `tests/ahp.test.js` | Automated calculation, validation, and dynamic-model tests |
| `docs/architecture.md` | Data flow, model format, and maintenance guide |
| `tests/i18n.test.js` | Locale parity and translation placeholder tests |

## Development and tests

Requires Node.js 20 or later for the built-in test runner. No dependencies are
needed.

```bash
node --test tests/ahp.test.js
node --test tests/i18n.test.js
node --check src/ahp.js
node --check src/app.js
node --check src/model.js
node --check src/data.js
```

To print every matrix and intermediate calculation from an exported JSON file:

```bash
node scripts/audit.js path/to/my-decision.json eigen
```

In a restricted environment that blocks the test runner from spawning its
worker process, add `--test-isolation=none` before the test file paths to run
the same tests in the current process.

To run it locally, serve it over HTTP so the browser can load the locale JSON:

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

Opening the HTML file directly with `file://` is not supported because browsers
block loading the separate JSON language files from local files.

## Limits

- The model supports up to 10 options and 10 criteria. This bounds matrix size
  and keeps pairwise comparison effort manageable.
- Pairwise judgments are subjective. AHP makes assumptions visible and
  calculates their implications; it cannot choose criteria or supply evidence
  for the user.
- This is a single-user browser tool, not a collaborative service or an
  encrypted document manager. Anyone with access to the browser profile may be
  able to access its local workspace.

## License

The code is MIT licensed; see [LICENSE](LICENSE).
