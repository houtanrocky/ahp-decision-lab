/*
 * Product UI for the generic, local-first AHP Decision Lab.
 * The user defines all options and criteria. AHPEngine owns the mathematics.
 */
(function () {
  'use strict';

  const Engine = window.AHPEngine;
  const DecisionModel = window.AHPModel;
  const blankModel = window.AHP_SEED;
  const STORAGE_KEY = 'ahp-decision-lab-model-v2';
  const LEGACY_STORAGE_KEY = 'tmu-ahp-decision-lab-v1';
  const MAX_ITEMS = DecisionModel.MAX_ITEMS;
  const COLORS = ['#0c908a', '#507fae', '#c29252', '#ae6aa9', '#839b5e', '#cf6b54', '#557d68', '#8c78b2', '#b17c47', '#497e91'];
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const format = (value, digits = 1) => Number(value).toFixed(digits);
  const percent = (value, digits = 1) => `${format(value * 100, digits)}%`;

  function emptyModel() {
    return Engine.clone(blankModel);
  }

  function loadModel() {
    try {
      // Remove the old case-study workspace so the generic product retains no
      // imported personal/faculty decision data from an earlier app version.
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        Engine.validateModel(parsed);
        parsed.judgmentNotes ||= {};
        return parsed;
      }
    } catch (error) {
      console.warn('Saved decision could not be loaded; opening a blank workspace.', error);
    }
    return emptyModel();
  }

  let model = loadModel();
  let method = 'eigen';
  let comparisonLevel = 'criteria';
  let activeCriterion = model.criteria[0]?.id ?? '';
  let scenarioCriterion = activeCriterion;
  let scenarioPercent = null;
  let scenarioEnabled = false;
  let result = null;
  let scores = [];
  let toastTimer = null;
  let idCounter = 0;

  function saveModel() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
    } catch (error) {
      showToast('Browser storage is unavailable. Export your decision to keep a copy.');
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.add('show');
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200);
  }

  function makeId() {
    idCounter += 1;
    return `item-${Date.now().toString(36)}-${idCounter}`;
  }

  function nameOf(item) {
    return item.name.trim() || 'Untitled';
  }

  function renderDefinitions() {
    $('options-list').innerHTML = model.alternatives.map((option, index) => `
      <div class="definition-row">
        <label class="visually-hidden" for="option-${escapeHTML(option.id)}">Option ${index + 1} name</label>
        <input id="option-${escapeHTML(option.id)}" data-item-name="option" data-id="${escapeHTML(option.id)}" maxlength="100" value="${escapeHTML(option.name)}" placeholder="Option ${index + 1}" />
        <button class="remove-item" type="button" data-remove="option" data-id="${escapeHTML(option.id)}" aria-label="Remove ${escapeHTML(nameOf(option))}">Remove</button>
      </div>`).join('');
    $('criteria-list').innerHTML = model.criteria.map((criterion, index) => `
      <div class="definition-row">
        <label class="visually-hidden" for="criterion-${escapeHTML(criterion.id)}">Criterion ${index + 1} name</label>
        <input id="criterion-${escapeHTML(criterion.id)}" data-item-name="criterion" data-id="${escapeHTML(criterion.id)}" maxlength="100" value="${escapeHTML(criterion.name)}" placeholder="Criterion ${index + 1}" />
        <button class="remove-item" type="button" data-remove="criterion" data-id="${escapeHTML(criterion.id)}" aria-label="Remove ${escapeHTML(nameOf(criterion))}">Remove</button>
      </div>`).join('');

    $('add-option').disabled = model.alternatives.length >= MAX_ITEMS;
    $('add-criterion').disabled = model.criteria.length >= MAX_ITEMS;
    const ready = model.alternatives.length >= 2 && model.criteria.length >= 2;
    $('workspace').classList.toggle('hidden', !ready);
    $('setup-hint').textContent = ready
      ? `${model.alternatives.length} options · ${model.criteria.length} criteria · ${comparisonCount()} pairwise judgments`
      : `Add at least two options and two criteria to begin comparing. (Currently ${model.alternatives.length} options and ${model.criteria.length} criteria.)`;
  }

  function comparisonCount() {
    const n = model.criteria.length;
    const m = model.alternatives.length;
    return n * (n - 1) / 2 + n * m * (m - 1) / 2;
  }

  function ratioLabel(value) {
    if (Math.abs(value - 1) < 1e-8) return '1';
    const amount = value < 1 ? 1 / value : value;
    const strength = amount === 3 ? 'Moderate' : amount === 5 ? 'Strong' : amount === 7 ? 'Very strong' : amount === 9 ? 'Extreme' : '';
    const ratio = value < 1 ? `1/${Number.isInteger(amount) ? amount : format(amount, 1)}` : String(value);
    const direction = value < 1 ? 'Right' : 'Left';
    return `${ratio} · ${direction}${strength ? ` / ${strength}` : ''}`;
  }

  function comparisonOptions(selectedValue) {
    return Engine.SAATY.map(value => `<option value="${value}" ${Math.abs(value - selectedValue) < 1e-10 ? 'selected' : ''}>${escapeHTML(ratioLabel(value))}</option>`).join('');
  }

  function comparisonConfig() {
    if (comparisonLevel === 'criteria') {
      return { items: model.criteria, pairs: model.criteriaPairs, scope: 'criteria' };
    }
    return {
      items: model.alternatives,
      pairs: model.alternativePairs[activeCriterion],
      scope: activeCriterion,
    };
  }

  function matrixTable(matrix, items) {
    const headers = items.map(item => `<th title="${escapeHTML(nameOf(item))}">${escapeHTML(nameOf(item))}</th>`).join('');
    const rows = matrix.map((row, index) => `<tr><th>${escapeHTML(nameOf(items[index]))}</th>${row.map((value, column) => `<td class="${index === column ? 'diag' : index < column ? 'upper' : ''}">${escapeHTML(ratioLabel(value))}</td>`).join('')}</tr>`).join('');
    return `<table class="matrix-table"><thead><tr><th>Comparison</th>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderPairs() {
    const criteriaLevel = comparisonLevel === 'criteria';
    $('type-criteria').classList.toggle('active', criteriaLevel);
    $('type-alternatives').classList.toggle('active', !criteriaLevel);
    $('criterion-picker').classList.toggle('hidden', criteriaLevel);
    $('criterion-select').innerHTML = model.criteria.map(criterion => `<option value="${escapeHTML(criterion.id)}" ${criterion.id === activeCriterion ? 'selected' : ''}>${escapeHTML(nameOf(criterion))}</option>`).join('');
    const { items, pairs, scope } = comparisonConfig();
    let html = '';
    for (let left = 0; left < items.length; left += 1) {
      for (let right = left + 1; right < items.length; right += 1) {
        const key = `${left}-${right}`;
        const noteId = JSON.stringify([items[left].id, items[right].id]);
        const noteKey = `${scope}/${noteId}`;
        html += `<div class="pair-row"><div class="pair-head"><span class="pair-label">${escapeHTML(nameOf(items[left]))}</span><div class="pair-control"><select aria-label="${escapeHTML(nameOf(items[left]))} versus ${escapeHTML(nameOf(items[right]))}" data-pair="${key}" data-scope="${escapeHTML(scope)}">${comparisonOptions(pairs[key])}</select><small>Left : Right</small></div><span class="pair-label right">${escapeHTML(nameOf(items[right]))}</span></div><input type="text" class="comparison-note" data-note="${escapeHTML(noteId)}" data-scope="${escapeHTML(scope)}" maxlength="300" value="${escapeHTML(model.judgmentNotes[noteKey] || '')}" placeholder="Reason or evidence (optional)" aria-label="Reason for ${escapeHTML(nameOf(items[left]))} versus ${escapeHTML(nameOf(items[right]))}" /></div>`;
      }
    }
    $('pair-list').innerHTML = html || '<p class="muted">No comparisons to show.</p>';
    $('editable-matrix').innerHTML = matrixTable(Engine.toMatrix(items.length, pairs), items);
  }

  function calculate() {
    Engine.validateModel(model);
    result = Engine.calculate(model, method);
  }

  function criterionIndex() {
    return Math.max(0, model.criteria.findIndex(criterion => criterion.id === scenarioCriterion));
  }

  function scenarioWeights() {
    return scenarioEnabled
      ? Engine.reweightOne(result.criteria.weights, criterionIndex(), scenarioPercent / 100)
      : result.criteria.weights;
  }

  function currentScores() {
    const weights = scenarioWeights();
    return Engine.aggregate(weights, result.locals.map(local => local.weights));
  }

  function renderRanking() {
    scores = currentScores();
    const ranking = Engine.rank(scores);
    $('criterion-cr').textContent = `Criteria CR ${percent(result.criteria.CR, 2)}`;
    $('criterion-cr').className = result.criteria.acceptable ? 'ok' : 'warn';
    $('mode-label').textContent = scenarioEnabled ? 'Scenario-adjusted preference shares' : 'Calculated preference shares';
    $('ranking').innerHTML = ranking.map((entry, order) => {
      const option = model.alternatives[entry.index];
      const color = COLORS[entry.index % COLORS.length];
      return `<div><div class="rank-head"><span class="rank-id">${String(order + 1).padStart(2, '0')}</span><div><div class="rank-name">${escapeHTML(nameOf(option))}</div></div><div class="rank-percent">${percent(entry.score)}</div></div><div class="rank-trackline"><div class="rank-fill" style="background:${color};width:${100 * entry.score}%"></div></div></div>`;
    }).join('');
    const weights = scenarioWeights();
    const header = `<tr><th>Criterion (weight)</th>${model.alternatives.map(option => `<th>${escapeHTML(nameOf(option))}</th>`).join('')}</tr>`;
    const rows = model.criteria.map((criterion, index) => `<tr><td>${escapeHTML(nameOf(criterion))} (${percent(weights[index])})</td>${model.alternatives.map((option, optionIndex) => `<td title="Local priority: ${percent(result.locals[index].weights[optionIndex])}">${percent(weights[index] * result.locals[index].weights[optionIndex])}</td>`).join('')}</tr>`).join('');
    const totals = `<tr class="total"><td>Final preference</td>${scores.map(score => `<td>${percent(score)}</td>`).join('')}</tr>`;
    $('contributions').innerHTML = `<table class="contribution-table"><thead>${header}</thead><tbody>${rows}${totals}</tbody></table>`;
    $('consistency').innerHTML = [{ name: 'Criteria', analysis: result.criteria }, ...model.criteria.map((criterion, index) => ({ name: nameOf(criterion), analysis: result.locals[index] }))]
      .map(entry => `<div class="consistency-row"><span>${escapeHTML(entry.name)}</span><strong class="${entry.analysis.acceptable ? 'ok' : 'warn'}">${percent(entry.analysis.CR, 2)} ${entry.analysis.acceptable ? '✓' : 'Review'}</strong></div>`).join('');
    $('result-caveat').textContent = scenarioEnabled
      ? 'Scenario scores change one criterion weight directly. They do not describe a new set of pairwise comparisons.'
      : 'Shares summarize your stated preferences. They are not probabilities, predictions, or guarantees.';
  }

  function renderSensitivity() {
    const index = criterionIndex();
    const criterion = model.criteria[index];
    const baseWeight = result.criteria.weights[index];
    if (scenarioPercent === null) scenarioPercent = Math.round(baseWeight * 100);
    $('scenario-criterion').innerHTML = model.criteria.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === scenarioCriterion ? 'selected' : ''}>${escapeHTML(nameOf(item))}</option>`).join('');
    $('scenario-weight-name').textContent = `${nameOf(criterion)} weight`;
    $('scenario-slider').value = String(scenarioPercent);
    $('scenario-percent').textContent = `${scenarioPercent}%`;
    $('scenario-toggle').checked = scenarioEnabled;
    const samples = Engine.sensitivity(result, index, 100);
    const width = 900, height = 274, left = 55, right = 24, top = 18, bottom = 39;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const x = value => left + plotWidth * value;
    const y = value => top + plotHeight * (1 - value);
    let svg = `<svg role="img" aria-label="Scenario preference scores as criterion weight changes" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;
    for (let value = 0; value <= 1.00001; value += 0.2) {
      svg += `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" stroke="#e7eef2"/><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end" font-size="11" fill="#8194a2">${Math.round(value * 100)}%</text>`;
    }
    for (let value = 0; value <= 1.0001; value += 0.25) {
      svg += `<line x1="${x(value)}" y1="${top}" x2="${x(value)}" y2="${height - bottom}" stroke="#f0f4f7"/><text x="${x(value)}" y="${height - 14}" text-anchor="middle" font-size="11" fill="#8194a2">${Math.round(value * 100)}%</text>`;
    }
    model.alternatives.forEach((option, optionIndex) => {
      const path = samples.map((sample, sampleIndex) => `${sampleIndex ? 'L' : 'M'} ${format(x(sample.weight), 2)} ${format(y(sample.scores[optionIndex]), 2)}`).join(' ');
      svg += `<path d="${path}" fill="none" stroke="${COLORS[optionIndex % COLORS.length]}" stroke-width="3" stroke-linejoin="round"/>`;
    });
    svg += `<line x1="${x(baseWeight)}" y1="${top}" x2="${x(baseWeight)}" y2="${height - bottom}" stroke="#8f9eb0" stroke-dasharray="5 5"/><text x="${Math.min(width - 110, x(baseWeight) + 6)}" y="${top + 11}" font-size="10" fill="#657789">Base ${percent(baseWeight, 0)}</text>`;
    if (scenarioEnabled) {
      model.alternatives.forEach((option, optionIndex) => {
        svg += `<circle cx="${x(scenarioPercent / 100)}" cy="${y(scores[optionIndex])}" r="5" fill="${COLORS[optionIndex % COLORS.length]}" stroke="white" stroke-width="2"/>`;
      });
    }
    svg += `<text x="${left + plotWidth / 2}" y="${height - 2}" font-size="11" fill="#6a7e8c" text-anchor="middle">Weight assigned to “${escapeHTML(nameOf(criterion))}”</text></svg>`;
    $('sensitivity-chart').innerHTML = svg;
    $('chart-legend').innerHTML = model.alternatives.map((option, index) => `<span><i class="legend-color" style="background:${COLORS[index % COLORS.length]}"></i>${escapeHTML(nameOf(option))}</span>`).join('');
    const changes = [];
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index].winner !== samples[index - 1].winner) changes.push(samples[index]);
    }
    $('sensitivity-note').innerHTML = `Base weight: <strong>${percent(baseWeight)}</strong>. ${changes.length ? `The leader changes near ${changes.map(sample => percent(sample.weight, 0)).join(', ')}.` : 'The leader stays the same across the 0–100% scenario range.'}`;
  }

  function renderAudit() {
    $('audit-method').textContent = method === 'eigen' ? 'Principal eigenvector' : 'Row geometric mean';
    $('audit-summary').innerHTML = `<div class="audit-summary-line"><span><b>Solver</b> ${method === 'eigen' ? 'Power iteration' : 'Row geometric mean'}</span><span><b>Criteria λmax</b> ${format(result.criteria.lambdaMax, 6)}</span><span><b>CI</b> ${format(result.criteria.CI, 6)}</span><span><b>RI</b> ${format(result.criteria.RI, 2)}</span><span><b>CR</b> ${percent(result.criteria.CR, 3)}</span></div>`;
    const groups = [
      { title: 'Criteria comparisons', items: model.criteria, pairs: model.criteriaPairs, analysis: result.criteria },
      ...model.criteria.map((criterion, index) => ({
        title: `Options for ${nameOf(criterion)}`,
        items: model.alternatives,
        pairs: model.alternativePairs[criterion.id],
        analysis: result.locals[index],
      })),
    ];
    $('all-matrices').innerHTML = groups.map(group => {
      const matrix = Engine.toMatrix(group.items.length, group.pairs);
      const rows = group.items.map((item, index) => `<tr><td>${escapeHTML(nameOf(item))}</td><td>${format(group.analysis.weights[index], 6)}</td><td>${format(group.analysis.Aw[index], 6)}</td><td>${format(group.analysis.Aw[index] / group.analysis.weights[index], 6)}</td></tr>`).join('');
      return `<div class="audit-matrix-group"><h3>${escapeHTML(group.title)}</h3><p>λmax ${format(group.analysis.lambdaMax, 6)} · CI ${format(group.analysis.CI, 6)} · RI ${format(group.analysis.RI, 2)} · CR ${percent(group.analysis.CR, 3)} (${group.analysis.acceptable ? 'consistent by common guideline' : 'review comparisons'})</p><div class="table-scroll">${matrixTable(matrix, group.items)}<table class="diagnostic-table"><thead><tr><th>Item</th><th>Priority</th><th>Aw</th><th>Aw / priority</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }).join('');
  }

  function renderAnalysis() {
    calculate();
    renderPairs();
    renderRanking();
    renderSensitivity();
    renderAudit();
  }

  function render() {
    renderDefinitions();
    if (model.criteria.length >= 2 && model.alternatives.length >= 2) renderAnalysis();
  }

  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function csvCell(value) {
    return `"${String(value).replaceAll('"', '""')}"`;
  }

  function exportCSV() {
    const weights = scenarioWeights();
    const rows = [[ 'Criterion', 'Criterion weight', ...model.alternatives.map(option => nameOf(option)) ]];
    model.criteria.forEach((criterion, index) => rows.push([
      nameOf(criterion), weights[index], ...result.locals[index].weights,
    ]));
    rows.push(['FINAL PREFERENCE', 1, ...scores]);
    rows.push(['Solver', method, 'Scenario active', scenarioEnabled]);
    rows.push(['Criteria consistency ratio', result.criteria.CR]);
    model.criteria.forEach((criterion, index) => rows.push([`CR: ${nameOf(criterion)}`, result.locals[index].CR]));
    download(rows.map(row => row.map(csvCell).join(',')).join('\n'), 'decision-results.csv', 'text/csv;charset=utf-8');
    showToast('Results CSV exported');
  }

  function updateAfterEdit() {
    const validNotes = new Set();
    const addScopeNotes = (scope, items) => {
      for (let left = 0; left < items.length; left += 1) {
        for (let right = left + 1; right < items.length; right += 1) {
          validNotes.add(`${scope}/${JSON.stringify([items[left].id, items[right].id])}`);
        }
      }
    };
    addScopeNotes('criteria', model.criteria);
    model.criteria.forEach(criterion => addScopeNotes(criterion.id, model.alternatives));
    model.judgmentNotes = Object.fromEntries(
      Object.entries(model.judgmentNotes || {}).filter(([key]) => validNotes.has(key)),
    );
    saveModel();
    render();
  }

  $('add-option').addEventListener('click', () => {
    if (model.alternatives.length >= MAX_ITEMS) return;
    DecisionModel.addOption(model, { id: makeId(), name: '' });
    updateAfterEdit();
    $('options-list').lastElementChild?.querySelector('input')?.focus();
  });

  $('add-criterion').addEventListener('click', () => {
    if (model.criteria.length >= MAX_ITEMS) return;
    const criterion = { id: makeId(), name: '' };
    DecisionModel.addCriterion(model, criterion);
    activeCriterion = criterion.id;
    scenarioCriterion = activeCriterion;
    scenarioPercent = null;
    updateAfterEdit();
    $('criteria-list').lastElementChild?.querySelector('input')?.focus();
  });

  $('options-list').addEventListener('input', event => {
    const input = event.target.closest('[data-item-name="option"]');
    if (!input) return;
    DecisionModel.renameItem(model.alternatives, input.dataset.id, input.value);
    saveModel();
  });
  $('options-list').addEventListener('change', render);
  $('criteria-list').addEventListener('input', event => {
    const input = event.target.closest('[data-item-name="criterion"]');
    if (!input) return;
    DecisionModel.renameItem(model.criteria, input.dataset.id, input.value);
    saveModel();
  });
  $('criteria-list').addEventListener('change', render);

  document.querySelectorAll('.definition-list').forEach(list => list.addEventListener('click', event => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    if (button.dataset.remove === 'option') {
      DecisionModel.removeOption(model, button.dataset.id);
    } else {
      DecisionModel.removeCriterion(model, button.dataset.id);
      if (!model.criteria.some(item => item.id === activeCriterion)) activeCriterion = model.criteria[0]?.id ?? '';
      if (!model.criteria.some(item => item.id === scenarioCriterion)) scenarioCriterion = model.criteria[0]?.id ?? '';
      scenarioPercent = null;
    }
    updateAfterEdit();
  }));

  $('pair-list').addEventListener('change', event => {
    const target = event.target;
    if (target.matches('select[data-pair]')) {
      const pair = target.dataset.pair;
      if (target.dataset.scope === 'criteria') model.criteriaPairs[pair] = Number(target.value);
      else model.alternativePairs[target.dataset.scope][pair] = Number(target.value);
      saveModel();
      renderAnalysis();
    } else if (target.matches('input[data-note]')) {
      model.judgmentNotes[`${target.dataset.scope}/${target.dataset.note}`] = target.value;
      saveModel();
    }
  });
  $('pair-list').addEventListener('input', event => {
    const input = event.target;
    if (input.matches('input[data-note]')) {
      model.judgmentNotes[`${input.dataset.scope}/${input.dataset.note}`] = input.value;
      saveModel();
    }
  });

  $('type-criteria').addEventListener('click', () => { comparisonLevel = 'criteria'; renderPairs(); });
  $('type-alternatives').addEventListener('click', () => { comparisonLevel = 'alternatives'; renderPairs(); });
  $('criterion-select').addEventListener('change', event => { activeCriterion = event.target.value; renderPairs(); });
  $('method-select').addEventListener('change', event => { method = event.target.value; renderAnalysis(); });
  $('scenario-criterion').addEventListener('change', event => {
    scenarioCriterion = event.target.value;
    scenarioPercent = Math.round(result.criteria.weights[criterionIndex()] * 100);
    renderRanking();
    renderSensitivity();
  });
  $('scenario-slider').addEventListener('input', event => {
    scenarioPercent = Number(event.target.value);
    renderRanking();
    renderSensitivity();
  });
  $('scenario-toggle').addEventListener('change', event => {
    scenarioEnabled = event.target.checked;
    renderRanking();
    renderSensitivity();
  });

  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('active', content.id === button.dataset.tab));
  }));

  $('export-json').addEventListener('click', () => {
    download(JSON.stringify(model, null, 2), 'my-decision.json', 'application/json');
    showToast('Decision exported as JSON');
  });
  $('import-json').addEventListener('click', () => $('json-file').click());
  $('json-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      Engine.validateModel(imported);
      imported.judgmentNotes ||= {};
      model = imported;
      activeCriterion = model.criteria[0]?.id ?? '';
      scenarioCriterion = activeCriterion;
      scenarioPercent = null;
      scenarioEnabled = false;
      saveModel();
      render();
      showToast('Decision imported');
    } catch (error) {
      showToast(`Import failed: ${error.message}`);
    } finally {
      event.target.value = '';
    }
  });
  $('download-csv').addEventListener('click', exportCSV);
  $('reset-all').addEventListener('click', () => {
    model = emptyModel();
    comparisonLevel = 'criteria';
    activeCriterion = '';
    scenarioCriterion = '';
    scenarioPercent = null;
    scenarioEnabled = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Could not clear browser storage.', error);
    }
    render();
    showToast('Workspace cleared');
  });

  // A completely blank workspace is a valid product starting state.
  render();
})();
