# Model assumptions

The application starts with an empty model and no preselected criteria, options,
or pairwise judgments. Users decide what belongs in their own decision.

## Shared scale

The interface uses Saaty's reciprocal 1–9 scale:

| Value | Meaning |
|---:|---|
| 1 | Equal preference |
| 3 | Moderate preference for the left item |
| 5 | Strong preference for the left item |
| 7 | Very strong preference for the left item |
| 9 | Extreme preference for the left item |
| 2, 4, 6, 8 | Intermediate preference |
| Reciprocal, such as 1/3 | Preference for the right item |

Each value records the user's relative judgment for one pair. The reverse matrix
cell is its reciprocal. Equal judgments are the default for newly created pairs;
they mean "no preference entered yet," not verified equivalence.

## Calculation assumptions

- Criteria priorities and each criterion's option priorities are normalized to
  sum to one.
- Option totals use a weighted sum of local priorities.
- A consistency ratio of 0.10 or below is a commonly used review guideline. It
  checks internal coherence, not factual accuracy or freedom from bias.
- Sensitivity reweights one criterion and proportionally rescales all other
  criteria. This is a scenario calculation, not a new AHP matrix.
- At most 10 criteria and 10 options are allowed by the product interface and
  model validator.

Users should keep the criteria relevant and distinct, write down the evidence
behind important judgments, and review whether a small change in assumptions
changes the result.
