/*
 * Generic decision-model editing helpers. These mutate only the supplied model
 * and contain no DOM or browser storage code, so structural edits are testable.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AHPModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_ITEMS = 10;

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function equalPairs(size) {
    const pairs = {};
    for (let left = 0; left < size; left += 1) {
      for (let right = left + 1; right < size; right += 1) pairs[`${left}-${right}`] = 1;
    }
    return pairs;
  }

  function remapPairs(oldItems, newItems, oldPairs) {
    const oldIndexById = new Map(oldItems.map((item, index) => [item.id, index]));
    const nextPairs = {};
    for (let left = 0; left < newItems.length; left += 1) {
      for (let right = left + 1; right < newItems.length; right += 1) {
        const oldLeft = oldIndexById.get(newItems[left].id);
        const oldRight = oldIndexById.get(newItems[right].id);
        const oldKey = `${oldLeft}-${oldRight}`;
        nextPairs[`${left}-${right}`] = oldLeft !== undefined && oldRight !== undefined
          ? oldPairs[oldKey]
          : 1;
      }
    }
    return nextPairs;
  }

  function addOption(model, option) {
    assert(model.alternatives.length < MAX_ITEMS, 'A decision can have at most 10 options');
    assert(option && typeof option.id === 'string' && option.id.length > 0, 'Option needs a unique id');
    assert(!model.alternatives.some(item => item.id === option.id), 'Duplicate option id');
    const previous = model.alternatives;
    const next = [...previous, option];
    for (const criterion of model.criteria) {
      model.alternativePairs[criterion.id] = remapPairs(
        previous,
        next,
        model.alternativePairs[criterion.id] || {},
      );
    }
    model.alternatives = next;
    return model;
  }

  function removeOption(model, id) {
    const previous = model.alternatives;
    assert(previous.some(option => option.id === id), 'Unknown option id');
    const next = previous.filter(option => option.id !== id);
    for (const criterion of model.criteria) {
      model.alternativePairs[criterion.id] = remapPairs(
        previous,
        next,
        model.alternativePairs[criterion.id] || {},
      );
    }
    model.alternatives = next;
    return model;
  }

  function addCriterion(model, criterion) {
    assert(model.criteria.length < MAX_ITEMS, 'A decision can have at most 10 criteria');
    assert(criterion && typeof criterion.id === 'string' && criterion.id.length > 0, 'Criterion needs a unique id');
    assert(!model.criteria.some(item => item.id === criterion.id), 'Duplicate criterion id');
    const previous = model.criteria;
    const next = [...previous, criterion];
    model.criteriaPairs = remapPairs(previous, next, model.criteriaPairs);
    model.criteria = next;
    model.alternativePairs[criterion.id] = equalPairs(model.alternatives.length);
    return model;
  }

  function removeCriterion(model, id) {
    const previous = model.criteria;
    assert(previous.some(criterion => criterion.id === id), 'Unknown criterion id');
    const next = previous.filter(criterion => criterion.id !== id);
    model.criteriaPairs = remapPairs(previous, next, model.criteriaPairs);
    model.criteria = next;
    delete model.alternativePairs[id];
    return model;
  }

  function renameItem(items, id, name) {
    const item = items.find(candidate => candidate.id === id);
    assert(item, 'Unknown item id');
    assert(typeof name === 'string' && name.length <= 100, 'Name must be a string of at most 100 characters');
    item.name = name;
    return item;
  }

  return { MAX_ITEMS, equalPairs, addOption, removeOption, addCriterion, removeCriterion, renameItem };
});
