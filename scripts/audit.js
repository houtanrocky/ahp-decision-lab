#!/usr/bin/env node
/*
 * Print a reproducible calculation trace for a user-exported decision.
 * Usage: node scripts/audit.js path/to/decision.json [eigen|rgmm]
 */
const fs = require('node:fs');
const path = require('node:path');
const AHP = require('../src/ahp.js');

const [modelPath, requestedMethod = 'eigen'] = process.argv.slice(2);
if (!modelPath) {
  throw new Error('Pass a complete exported decision JSON file.');
}
if (!['eigen', 'rgmm'].includes(requestedMethod)) {
  throw new Error('Method must be eigen or rgmm.');
}

const model = JSON.parse(fs.readFileSync(path.resolve(modelPath), 'utf8'));
AHP.validateModel(model);
if (model.criteria.length < 2 || model.alternatives.length < 2) {
  throw new Error('The decision needs at least two criteria and two options before it can be audited.');
}

const result = AHP.calculate(model, requestedMethod);
const percent = value => `${(100 * value).toFixed(3)}%`;
const fixed = value => Number(value).toFixed(6);
const nameOf = item => item.name?.trim() || 'Untitled';

function printMatrixSection(title, items, pairs, analysis) {
  const matrix = AHP.toMatrix(items.length, pairs);
  console.log(`\n${title}`);
  console.log(`Order: ${items.map(nameOf).join(' | ')}`);
  matrix.forEach(row => console.log(row.map(fixed).join('  ')));
  console.log('Priorities:');
  analysis.weights.forEach((weight, index) => console.log(`  ${nameOf(items[index])}: ${percent(weight)}`));
  console.log(`lambdaMax=${fixed(analysis.lambdaMax)}, CI=${fixed(analysis.CI)}, RI=${fixed(analysis.RI)}, CR=${percent(analysis.CR)} (${analysis.acceptable ? 'OK' : 'REVIEW'})`);
}

console.log('AHP DECISION AUDIT');
console.log(`File: ${path.basename(modelPath)} · Solver: ${requestedMethod}`);
console.log('All scores are conditional on the judgments in this file.');
printMatrixSection('Criteria comparisons', model.criteria, model.criteriaPairs, result.criteria);
model.criteria.forEach((criterion, index) => {
  printMatrixSection(
    `Options for ${nameOf(criterion)}`,
    model.alternatives,
    model.alternativePairs[criterion.id],
    result.locals[index],
  );
});

console.log('\nOption contributions and final preference shares:');
model.alternatives.forEach((option, optionIndex) => {
  const contributions = model.criteria.map((criterion, criterionIndex) => (
    `${percent(result.criteria.weights[criterionIndex])} × ${percent(result.locals[criterionIndex].weights[optionIndex])}`
  ));
  console.log(`${nameOf(option)}: ${contributions.join(' + ')} = ${percent(result.scores[optionIndex])}`);
});
console.log('\nRanking:');
result.ranking.forEach((entry, index) => {
  console.log(`${index + 1}. ${nameOf(model.alternatives[entry.index])}: ${percent(entry.score)}`);
});
