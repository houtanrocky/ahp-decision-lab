/*
 * Empty, generic starting workspace for the AHP Decision Lab.
 * No personal, faculty, or example decision data is bundled with the product.
 */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  root.AHP_SEED = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    schemaVersion: 1,
    title: 'AHP Decision Lab',
    criteria: [],
    alternatives: [],
    criteriaPairs: {},
    alternativePairs: {},
    judgmentNotes: {},
  };
});
