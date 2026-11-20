/*
 * Transparent Analytic Hierarchy Process (AHP) calculation engine.
 *
 * This module has no browser or third-party dependencies. It can be loaded as
 * a browser global (AHPEngine) or imported with CommonJS by the audit script
 * and tests. Input judgments are preferences, not measurements of quality.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AHPEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Saaty's Random Index values are used to scale the consistency index.
  const RI = Object.freeze({
    1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12,
    6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49,
  });
  const SAATY = Object.freeze([
    1 / 9, 1 / 8, 1 / 7, 1 / 6, 1 / 5, 1 / 4, 1 / 3, 1 / 2,
    1, 2, 3, 4, 5, 6, 7, 8, 9,
  ]);

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function normalize(values) {
    const sum = values.reduce((total, value) => total + value, 0);
    assert(sum > 0 && Number.isFinite(sum), 'Cannot normalize vector');
    return values.map(value => value / sum);
  }

  /** Check that a matrix is square, positive, unit-diagonal and reciprocal. */
  function validateMatrix(matrix) {
    assert(
      Array.isArray(matrix) && matrix.length >= 1 && matrix.length <= 10,
      'Matrix dimension must be 1–10',
    );
    const size = matrix.length;
    for (let row = 0; row < size; row += 1) {
      assert(Array.isArray(matrix[row]) && matrix[row].length === size, 'Matrix must be square');
      assert(Math.abs(matrix[row][row] - 1) < 1e-10, 'Diagonal entries must be 1');
      for (let column = 0; column < size; column += 1) {
        assert(
          matrix[row][column] > 0 && Number.isFinite(matrix[row][column]),
          'Pairwise entries must be positive and finite',
        );
        assert(
          Math.abs(matrix[row][column] * matrix[column][row] - 1) < 1e-9,
          'Matrix must be reciprocal',
        );
      }
    }
    return true;
  }

  /** Expand upper-triangle keys such as "0-1" into a reciprocal matrix. */
  function toMatrix(size, pairs) {
    assert(Number.isInteger(size) && size >= 1 && size <= 10, 'Unsupported matrix size');
    const matrix = Array.from({ length: size }, () => Array(size).fill(1));
    for (let row = 0; row < size; row += 1) {
      for (let column = row + 1; column < size; column += 1) {
        const key = `${row}-${column}`;
        assert(Object.prototype.hasOwnProperty.call(pairs, key), `Missing comparison ${key}`);
        const value = Number(pairs[key]);
        assert(value > 0 && Number.isFinite(value), `Invalid comparison ${key}`);
        matrix[row][column] = value;
        matrix[column][row] = 1 / value;
      }
    }
    validateMatrix(matrix);
    return matrix;
  }

  function multiply(matrix, vector) {
    return matrix.map(row => row.reduce((sum, value, index) => sum + value * vector[index], 0));
  }

  /** Compute normalized row geometric means (RGMM). */
  function geometricMeanVector(matrix) {
    validateMatrix(matrix);
    const size = matrix.length;
    const means = matrix.map(row => Math.exp(
      row.reduce((sum, value) => sum + Math.log(value), 0) / size,
    ));
    return normalize(means);
  }

  /** Approximate the principal right eigenvector by power iteration. */
  function principalEigenvector(matrix) {
    validateMatrix(matrix);
    let weights = Array(matrix.length).fill(1 / matrix.length);
    let iterations = 0;
    let change = Infinity;

    for (let step = 0; step < 20000; step += 1) {
      const next = normalize(multiply(matrix, weights));
      change = next.reduce((sum, value, index) => sum + Math.abs(value - weights[index]), 0);
      weights = next;
      iterations = step + 1;
      if (change < 1e-13) break;
    }
    assert(change < 1e-9, 'Power iteration did not converge');
    return { weights, iterations, residual: change };
  }

  /** Calculate priorities and conventional AHP consistency statistics. */
  function analyzeMatrix(matrix, method = 'eigen') {
    validateMatrix(matrix);
    assert(method === 'eigen' || method === 'rgmm', 'Unknown method');
    const solution = method === 'eigen'
      ? principalEigenvector(matrix)
      : { weights: geometricMeanVector(matrix), iterations: null, residual: null };
    const { weights } = solution;
    const weightedSum = multiply(matrix, weights);
    const lambdaMax = weightedSum.reduce(
      (sum, value, index) => sum + value / weights[index], 0,
    ) / matrix.length;
    const consistencyIndex = matrix.length <= 2
      ? 0
      : Math.max(0, (lambdaMax - matrix.length) / (matrix.length - 1));
    const randomIndex = RI[matrix.length];
    const consistencyRatio = randomIndex ? consistencyIndex / randomIndex : 0;

    return {
      weights,
      Aw: weightedSum,
      lambdaMax,
      CI: consistencyIndex,
      RI: randomIndex,
      CR: consistencyRatio,
      acceptable: consistencyRatio <= 0.1,
      iterations: solution.iterations,
      method,
    };
  }

  /** Calculate criterion priorities, local priorities, scores and ranking. */
  function calculate(model, method = 'eigen') {
    const criteria = analyzeMatrix(
      toMatrix(model.criteria.length, model.criteriaPairs), method,
    );
    const locals = model.criteria.map(criterion => analyzeMatrix(
      toMatrix(model.alternatives.length, model.alternativePairs[criterion.id]), method,
    ));
    const scores = aggregate(criteria.weights, locals.map(result => result.weights));
    return { criteria, locals, scores, ranking: rank(scores), method };
  }

  /** Weighted sum of alternative priorities across all criteria. */
  function aggregate(criteriaWeights, localWeights) {
    assert(criteriaWeights.length === localWeights.length, 'Criterion/local mismatch');
    assert(localWeights.length > 0, 'At least one criterion is required');
    const alternativeCount = localWeights[0].length;
    const scores = Array(alternativeCount).fill(0);
    for (let criterion = 0; criterion < criteriaWeights.length; criterion += 1) {
      assert(localWeights[criterion].length === alternativeCount, 'Alternative count mismatch');
      for (let alternative = 0; alternative < alternativeCount; alternative += 1) {
        scores[alternative] += criteriaWeights[criterion] * localWeights[criterion][alternative];
      }
    }
    return scores;
  }

  /** Sort scores descending; preserve original order when scores tie. */
  function rank(scores) {
    return scores
      .map((score, index) => ({ index, score }))
      .sort((left, right) => right.score - left.score || left.index - right.index);
  }

  /** Set one criterion to target while scaling all remaining weights evenly. */
  function reweightOne(baseWeights, index, target) {
    assert(index >= 0 && index < baseWeights.length, 'Invalid index');
    assert(target >= 0 && target <= 1, 'Target must be 0..1');
    const remainder = baseWeights.reduce(
      (sum, weight, position) => sum + (position === index ? 0 : weight), 0,
    );
    assert(remainder > 0, 'No other criteria to reallocate');
    return baseWeights.map((weight, position) => (
      position === index ? target : (weight / remainder) * (1 - target)
    ));
  }

  /** Sample aggregate scores as one criterion weight moves from 0 to 1. */
  function sensitivity(result, index, steps = 100) {
    assert(Number.isInteger(steps) && steps > 0, 'Steps must be a positive integer');
    const samples = [];
    for (let step = 0; step <= steps; step += 1) {
      const target = step / steps;
      const weights = reweightOne(result.criteria.weights, index, target);
      const scores = aggregate(weights, result.locals.map(local => local.weights));
      samples.push({ weight: target, scores, winner: rank(scores)[0].index });
    }
    return samples;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** Validate the model structure and ensure every required comparison exists. */
  function validateModel(model) {
    assert(model && model.schemaVersion === 1, 'Incompatible model format');
    assert(
      Array.isArray(model.criteria) && model.criteria.length <= 10
        && Array.isArray(model.alternatives) && model.alternatives.length <= 10,
      'Criteria and options must be arrays with no more than 10 items each',
    );
    const criterionIds = new Set(model.criteria.map(criterion => criterion.id));
    const alternativeIds = new Set(model.alternatives.map(alternative => alternative.id));
    assert(criterionIds.size === model.criteria.length, 'Duplicate criterion ids');
    assert(alternativeIds.size === model.alternatives.length, 'Duplicate option ids');
    assert(
      model.criteria.every(criterion => criterion && typeof criterion.id === 'string' && criterion.id.length > 0)
        && model.alternatives.every(alternative => alternative && typeof alternative.id === 'string' && alternative.id.length > 0),
      'Every criterion and option needs a non-empty string id',
    );
    assert(
      model.criteria.every(criterion => typeof criterion.name === 'string' && criterion.name.length <= 100)
        && model.alternatives.every(alternative => typeof alternative.name === 'string' && alternative.name.length <= 100),
      'Every criterion and option needs a name of at most 100 characters',
    );
    assert(model.criteriaPairs && typeof model.criteriaPairs === 'object', 'Criteria comparisons are required');
    assert(model.alternativePairs && typeof model.alternativePairs === 'object', 'Option comparisons are required');
    assert(
      model.judgmentNotes === undefined
        || (model.judgmentNotes && typeof model.judgmentNotes === 'object' && !Array.isArray(model.judgmentNotes)),
      'Judgment notes must be an object',
    );
    if (model.criteria.length >= 2) toMatrix(model.criteria.length, model.criteriaPairs);
    for (const criterion of model.criteria) {
      const pairs = model.alternativePairs[criterion.id];
      assert(pairs && typeof pairs === 'object', `Missing option comparisons for criterion ${criterion.id}`);
      if (model.alternatives.length >= 2) toMatrix(model.alternatives.length, pairs);
    }
    return true;
  }

  return {
    RI, SAATY, toMatrix, validateMatrix, geometricMeanVector,
    principalEigenvector, analyzeMatrix, calculate, aggregate, rank,
    reweightOne, sensitivity, validateModel, clone,
  };
});
