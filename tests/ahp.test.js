const test = require('node:test');
const assert = require('node:assert/strict');
const AHP = require('../src/ahp.js');
const blank = require('../src/data.js');
const Model = require('../src/model.js');

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
};

function makeModel(criterionCount, optionCount) {
  const criteria = Array.from({ length: criterionCount }, (_, index) => ({
    id: `criterion-${index}`,
    name: `Criterion ${index + 1}`,
  }));
  const alternatives = Array.from({ length: optionCount }, (_, index) => ({
    id: `option-${index}`,
    name: `Option ${index + 1}`,
  }));
  const makeEqualPairs = size => {
    const pairs = {};
    for (let left = 0; left < size; left += 1) {
      for (let right = left + 1; right < size; right += 1) pairs[`${left}-${right}`] = 1;
    }
    return pairs;
  };
  return {
    schemaVersion: 1,
    title: 'Test decision',
    criteria,
    alternatives,
    criteriaPairs: makeEqualPairs(criterionCount),
    alternativePairs: Object.fromEntries(criteria.map(item => [item.id, makeEqualPairs(optionCount)])),
    judgmentNotes: {},
  };
}

test('the shipped model is a valid, empty, privacy-safe workspace', () => {
  assert.equal(AHP.validateModel(blank), true);
  assert.deepEqual(blank.criteria, []);
  assert.deepEqual(blank.alternatives, []);
  assert.deepEqual(blank.criteriaPairs, {});
  assert.deepEqual(blank.alternativePairs, {});
});

test('dynamic option edits preserve existing comparisons and initialize new pairs equally', () => {
  const model = makeModel(2, 2);
  model.alternativePairs['criterion-0']['0-1'] = 5;
  model.alternativePairs['criterion-1']['0-1'] = 1 / 3;
  Model.addOption(model, { id: 'option-2', name: 'Option 3' });
  assert.deepEqual(model.alternativePairs['criterion-0'], { '0-1': 5, '0-2': 1, '1-2': 1 });
  assert.deepEqual(model.alternativePairs['criterion-1'], { '0-1': 1 / 3, '0-2': 1, '1-2': 1 });
  Model.removeOption(model, 'option-1');
  assert.deepEqual(model.alternatives.map(option => option.id), ['option-0', 'option-2']);
  assert.deepEqual(model.alternativePairs['criterion-0'], { '0-1': 1 });
});

test('dynamic criterion edits preserve priorities and create or remove local matrices', () => {
  const model = makeModel(2, 3);
  model.criteriaPairs['0-1'] = 7;
  const originalLocalPairs = model.alternativePairs['criterion-0'];
  Model.addCriterion(model, { id: 'criterion-2', name: 'Criterion 3' });
  assert.equal(model.criteriaPairs['0-1'], 7);
  assert.deepEqual(model.alternativePairs['criterion-2'], { '0-1': 1, '0-2': 1, '1-2': 1 });
  Model.removeCriterion(model, 'criterion-1');
  assert.deepEqual(model.criteria.map(criterion => criterion.id), ['criterion-0', 'criterion-2']);
  assert.equal(model.criteriaPairs['0-1'], 1);
  assert.equal(model.alternativePairs['criterion-0'], originalLocalPairs);
  assert.equal(Object.hasOwn(model.alternativePairs, 'criterion-1'), false);
});

test('item rename is independent of comparison judgments and enforces name size', () => {
  const model = makeModel(2, 2);
  const comparison = model.criteriaPairs['0-1'];
  Model.renameItem(model.criteria, 'criterion-0', 'Cost');
  assert.equal(model.criteria[0].name, 'Cost');
  assert.equal(model.criteriaPairs['0-1'], comparison);
  assert.throws(() => Model.renameItem(model.criteria, 'criterion-0', 'x'.repeat(101)), /at most 100/);
});

test('dynamic item editing enforces the 10-item product limit', () => {
  const model = makeModel(2, 10);
  assert.throws(() => Model.addOption(model, { id: 'extra', name: 'Extra' }), /at most 10 options/);
  const criteria = makeModel(10, 2);
  assert.throws(() => Model.addCriterion(criteria, { id: 'extra', name: 'Extra' }), /at most 10 criteria/);
});

test('reciprocal matrix construction creates inverse values and a unit diagonal', () => {
  const matrix = AHP.toMatrix(3, { '0-1': 2, '0-2': 4, '1-2': 0.5 });
  assert.deepEqual(matrix, [[1, 2, 4], [0.5, 1, 0.5], [0.25, 2, 1]]);
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix.length; column += 1) {
      approx(matrix[row][column] * matrix[column][row], 1);
    }
  }
});

test('both solvers recover consistent priorities for matrix sizes 2 through 10', () => {
  for (const size of [2, 3, 4, 6, 10]) {
    const expected = Array.from({ length: size }, (_, index) => index + 1);
    const matrix = expected.map(left => expected.map(right => left / right));
    for (const method of ['eigen', 'rgmm']) {
      const result = AHP.analyzeMatrix(matrix, method);
      const total = expected.reduce((sum, value) => sum + value, 0);
      result.weights.forEach((weight, index) => approx(weight, expected[index] / total, 1e-10));
      approx(result.CR, 0, 1e-9);
      approx(result.lambdaMax, size, 1e-8);
    }
  }
});

test('generic models calculate normalized scores with both solvers', () => {
  for (const dimensions of [[2, 2], [3, 4], [6, 3], [10, 10]]) {
    const model = makeModel(...dimensions);
    assert.equal(AHP.validateModel(model), true);
    for (const method of ['eigen', 'rgmm']) {
      const result = AHP.calculate(model, method);
      approx(result.scores.reduce((sum, score) => sum + score, 0), 1);
      approx(result.criteria.weights.reduce((sum, weight) => sum + weight, 0), 1);
      assert.equal(result.locals.length, dimensions[0]);
      assert.equal(result.scores.length, dimensions[1]);
      result.locals.forEach(local => approx(local.weights.reduce((sum, weight) => sum + weight, 0), 1));
    }
  }
});

test('aggregation applies criterion weights to local option priorities', () => {
  const scores = AHP.aggregate([0.75, 0.25], [[0.8, 0.2], [0.1, 0.9]]);
  approx(scores[0], 0.625);
  approx(scores[1], 0.375);
});

test('ranking is descending and keeps source order for ties', () => {
  assert.deepEqual(AHP.rank([0.4, 0.4, 0.2]), [
    { index: 0, score: 0.4 },
    { index: 1, score: 0.4 },
    { index: 2, score: 0.2 },
  ]);
});

test('one-criterion reweighting preserves other relative priorities and sums to one', () => {
  const model = makeModel(3, 3);
  model.criteriaPairs = { '0-1': 3, '0-2': 5, '1-2': 2 };
  const base = AHP.calculate(model);
  const adjusted = AHP.reweightOne(base.criteria.weights, 0, 0.65);
  approx(adjusted[0], 0.65);
  approx(adjusted.reduce((sum, weight) => sum + weight, 0), 1);
  approx(adjusted[1] / adjusted[2], base.criteria.weights[1] / base.criteria.weights[2]);
});

test('sensitivity endpoints equal local priorities at 100 percent and zero at 0 percent', () => {
  const result = AHP.calculate(makeModel(2, 3));
  const samples = AHP.sensitivity(result, 0, 100);
  approx(samples[0].weight, 0);
  approx(samples[100].weight, 1);
  samples[100].scores.forEach((score, index) => approx(score, result.locals[0].weights[index]));
  approx(samples[0].scores.reduce((sum, score) => sum + score, 0), 1);
});

test('changes to judgments change the calculated preferences', () => {
  const model = makeModel(2, 3);
  const baseline = AHP.calculate(model).scores;
  model.alternativePairs['criterion-0'] = { '0-1': 9, '0-2': 9, '1-2': 1 };
  const changed = AHP.calculate(model).scores;
  assert.ok(changed[0] > baseline[0]);
  assert.ok(changed[0] > changed[1]);
});

test('model validation rejects missing comparisons, duplicate ids and invalid dimensions', () => {
  const missing = makeModel(2, 2);
  delete missing.criteriaPairs['0-1'];
  assert.throws(() => AHP.validateModel(missing), /Missing comparison/);

  const duplicateOption = makeModel(2, 2);
  duplicateOption.alternatives[1].id = duplicateOption.alternatives[0].id;
  assert.throws(() => AHP.validateModel(duplicateOption), /Duplicate option ids/);

  const oversized = makeModel(11, 2);
  assert.throws(() => AHP.validateModel(oversized), /no more than 10/);
});

test('matrix and method validation reject malformed input', () => {
  assert.throws(() => AHP.validateMatrix([[1, 2], [3, 1]]), /reciprocal/);
  assert.throws(() => AHP.toMatrix(2, { '0-1': 0 }), /Invalid comparison/);
  assert.throws(() => AHP.analyzeMatrix([[1, 2], [0.5, 1]], 'unknown'), /Unknown method/);
  assert.throws(() => AHP.sensitivity(AHP.calculate(makeModel(2, 2)), 0, 0), /positive integer/);
});
