# Architecture and maintenance guide

## Product boundary

Decision Lab is a static browser application for user-defined decisions. The
starting model is empty. The app contains no bundled personal profile, names of
real people, résumé details, or example decision. It has no account, telemetry,
backend, or network calls. The browser stores a model locally; JSON and CSV are
created only when the user requests an export.

## Runtime flow

```text
index.html
  ├─ src/data.js  → empty schema-versioned model (AHP_SEED)
  ├─ src/model.js → dynamic model edits and comparison remapping (AHPModel)
  ├─ src/ahp.js   → pure calculations and model validation (AHPEngine)
  └─ src/app.js   → editor, persistence, pairwise inputs, result views
                        ├─ localStorage: browser's current working model
                        ├─ JSON: editable decision backup / import
                        └─ CSV: calculated scores and consistency values
```

Keep the script order. `app.js` expects the model, editing, and calculation
globals loaded first. No build,
installation, or network connection is needed. The app can be opened directly
from disk or served as static files.

## Responsibilities

| File | Responsibility |
|---|---|
| `index.html` | Accessible page structure and product explanations |
| `styles.css` | Existing visual system plus product setup and responsive layout |
| `src/data.js` | Empty model template and schema version |
| `src/model.js` | DOM-free add/remove/rename operations and comparison remapping |
| `src/ahp.js` | Matrix validation/construction, solvers, consistency, ranking, sensitivity |
| `src/app.js` | User-defined items, events, local storage, rendering, import/export |
| `tests/ahp.test.js` | Mathematical behavior and malformed-model cases |
| `docs/assumptions.md` | Scale and method assumptions shown to maintainers |

## Model format

The JSON object uses `schemaVersion: 1` and these fields:

- `criteria`: ordered objects with stable unique `id` and editable `name`.
- `alternatives`: ordered objects with stable unique `id` and editable `name`.
- `criteriaPairs`: upper-triangle comparison values keyed by `"i-j"`.
- `alternativePairs`: one upper-triangle comparison map per criterion ID.
- `judgmentNotes`: optional notes keyed by comparison scope and pair index.

For `n` items, there are `n(n−1)/2` stored comparisons. A value at `"0-2"`
means the first ordered item is preferred to the third by that ratio; the engine
creates the reciprocal cell and unit diagonal. Indices refer to current array
order. When the UI adds or removes an item, `src/model.js` remaps existing
comparisons that still refer to the same item IDs. New pairs start equal at 1.
Renaming does not change pair judgments. These operations are tested without a
browser.

The engine and import validator support an empty workspace, up to 10 options and
10 criteria. The UI only presents analysis when there are at least two of each.
The JSON format intentionally accepts different item IDs and names; it is not
bound to one example hierarchy.

## Calculation sequence

1. `toMatrix` expands upper-triangle values into a positive reciprocal matrix.
2. `analyzeMatrix` derives normalized priorities by power iteration or row
   geometric means.
3. It estimates the principal eigenvalue and computes CI and CR. CR is a
   consistency screen, not a measure of truth.
4. `calculate` weights each option's local priorities by criterion priorities,
   sums the contributions, and returns a stable descending ranking.
5. `sensitivity` recalculates the weighted sum while varying one criterion
   weight and preserving proportions among the others.

`src/ahp.js` has no DOM dependency and exports the same API to the browser and
Node.js. This lets UI and tests use exactly the same math.

## Editing and verification

- Keep user-facing markup in `index.html`, presentation in `styles.css`, state
  and interactions in `src/app.js`, structural model edits in `src/model.js`,
  and all math in `src/ahp.js`.
- Escape user-provided text before adding it to HTML. Continue validating
  imported JSON before storing or calculating it.
- Bump `schemaVersion` only when the portable JSON shape changes; coordinate
  migration and import handling if that happens.
- Run `node --test --test-isolation=none tests/ahp.test.js` after calculation or
  model validation changes. Syntax checks are listed in the README.
- Keep tests independent of any real person's data; construct synthetic models
  inside tests as `tests/ahp.test.js` does.

## Storage and privacy

The app stores the current model under `ahp-decision-lab-model-v2` in the
current browser profile. Reset removes that key. Import validates then stores a
user-supplied model. Exported JSON contains names and notes the user entered;
users should handle the file accordingly. Clearing browser storage does not
remove files previously downloaded.

## Known limits

The application is a single-user local tool, not an encrypted vault or shared
collaboration service. The CR guideline cannot detect coherent bias. The
criteria and comparisons remain the user's responsibility, and rankings can
change when they change.
