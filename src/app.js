/*
 * Product UI for the generic, local-first AHP Decision Lab.
 * The user defines all options and criteria. AHPEngine owns the mathematics.
 */
(function () {
  'use strict';

  const Engine = window.AHPEngine;
  const DecisionModel = window.AHPModel;
  const I18n = window.AHPI18n;
  const blankModel = window.AHP_SEED;
  const STORAGE_KEY = 'ahp-decision-lab-model-v2';
  const LEGACY_STORAGE_KEY = 'tmu-ahp-decision-lab-v1';
  const LANGUAGE_KEY = 'ahp-decision-lab-language-v1';
  const MAX_ITEMS = DecisionModel.MAX_ITEMS;
  const COLORS = ['#0c908a', '#507fae', '#c29252', '#ae6aa9', '#839b5e', '#cf6b54', '#557d68', '#8c78b2', '#b17c47', '#497e91'];
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const t = (key, values) => I18n.t(key, values);
  const format = (value, digits = 1) => new Intl.NumberFormat(I18n.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
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
      showToast(t('message.storageUnavailable'));
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
    return item.name.trim() || t('items.untitled');
  }

  function renderDefinitions() {
    $('options-list').innerHTML = model.alternatives.map((option, index) => `
      <div class="definition-row">
        <label class="visually-hidden" for="option-${escapeHTML(option.id)}">${escapeHTML(t('options.nameLabel', { number: format(index + 1, 0) }))}</label>
        <input id="option-${escapeHTML(option.id)}" data-item-name="option" data-id="${escapeHTML(option.id)}" maxlength="100" value="${escapeHTML(option.name)}" placeholder="${escapeHTML(t('options.namePlaceholder', { number: format(index + 1, 0) }))}" />
        <button class="remove-item" type="button" data-remove="option" data-id="${escapeHTML(option.id)}" aria-label="${escapeHTML(t('options.remove', { name: nameOf(option) }))}">${escapeHTML(t('action.remove'))}</button>
      </div>`).join('');
    $('criteria-list').innerHTML = model.criteria.map((criterion, index) => `
      <div class="definition-row">
        <label class="visually-hidden" for="criterion-${escapeHTML(criterion.id)}">${escapeHTML(t('criteria.nameLabel', { number: format(index + 1, 0) }))}</label>
        <input id="criterion-${escapeHTML(criterion.id)}" data-item-name="criterion" data-id="${escapeHTML(criterion.id)}" maxlength="100" value="${escapeHTML(criterion.name)}" placeholder="${escapeHTML(t('criteria.namePlaceholder', { number: format(index + 1, 0) }))}" />
        <button class="remove-item" type="button" data-remove="criterion" data-id="${escapeHTML(criterion.id)}" aria-label="${escapeHTML(t('criteria.remove', { name: nameOf(criterion) }))}">${escapeHTML(t('action.remove'))}</button>
      </div>`).join('');

    $('add-option').disabled = model.alternatives.length >= MAX_ITEMS;
    $('add-criterion').disabled = model.criteria.length >= MAX_ITEMS;
    const ready = model.alternatives.length >= 2 && model.criteria.length >= 2;
    $('workspace').classList.toggle('hidden', !ready);
    $('setup-hint').textContent = ready
      ? t('setup.complete', {
        options: format(model.alternatives.length, 0),
        criteria: format(model.criteria.length, 0),
        comparisons: format(comparisonCount(), 0),
      })
      : t('setup.incomplete', {
        options: format(model.alternatives.length, 0),
        criteria: format(model.criteria.length, 0),
      });
  }

  function comparisonCount() {
    const n = model.criteria.length;
    const m = model.alternatives.length;
    return n * (n - 1) / 2 + n * m * (m - 1) / 2;
  }

  function ratioLabel(value) {
    if (Math.abs(value - 1) < 1e-8) return t('scale.equalValue');
    const amount = value < 1 ? 1 / value : value;
    const strength = amount === 3 ? t('scale.moderate')
      : amount === 5 ? t('scale.strong')
        : amount === 7 ? t('scale.veryStrong')
          : amount === 9 ? t('scale.extreme') : '';
    const ratioValue = Number.isInteger(amount) ? format(amount, 0) : format(amount, 1);
    const ratio = value < 1 ? t('scale.reciprocal', { value: ratioValue }) : format(value, 0);
    return t(value < 1 ? 'scale.right' : 'scale.left', { ratio, strength });
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
    return `<table class="matrix-table"><thead><tr><th>${escapeHTML(t('matrix.corner'))}</th>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
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
        html += `<div class="pair-row"><div class="pair-head"><span class="pair-label">${escapeHTML(nameOf(items[left]))}</span><div class="pair-control"><select aria-label="${escapeHTML(t('judgments.pairLabel', { left: nameOf(items[left]), right: nameOf(items[right]) }))}" data-pair="${key}" data-scope="${escapeHTML(scope)}">${comparisonOptions(pairs[key])}</select><small>${escapeHTML(t('judgments.leftRight'))}</small></div><span class="pair-label right">${escapeHTML(nameOf(items[right]))}</span></div><input type="text" class="comparison-note" data-note="${escapeHTML(noteId)}" data-scope="${escapeHTML(scope)}" maxlength="300" value="${escapeHTML(model.judgmentNotes[noteKey] || '')}" placeholder="${escapeHTML(t('judgments.notePlaceholder'))}" aria-label="${escapeHTML(t('judgments.noteLabel', { left: nameOf(items[left]), right: nameOf(items[right]) }))}" /></div>`;
      }
    }
    $('pair-list').innerHTML = html || `<p class="muted">${escapeHTML(t('judgments.noComparisons'))}</p>`;
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
    $('criterion-cr').textContent = t('results.consistency', { value: percent(result.criteria.CR, 2) });
    $('criterion-cr').className = result.criteria.acceptable ? 'ok' : 'warn';
    $('mode-label').textContent = t(scenarioEnabled ? 'results.scenarioShares' : 'results.shares');
    $('ranking').innerHTML = ranking.map((entry, order) => {
      const option = model.alternatives[entry.index];
      const color = COLORS[entry.index % COLORS.length];
      return `<div><div class="rank-head"><span class="rank-id">${format(order + 1, 0)}</span><div><div class="rank-name">${escapeHTML(nameOf(option))}</div></div><div class="rank-percent">${percent(entry.score)}</div></div><div class="rank-trackline"><div class="rank-fill" style="background:${color};width:${100 * entry.score}%"></div></div></div>`;
    }).join('');
    const weights = scenarioWeights();
    const header = `<tr><th>${escapeHTML(t('results.criterionWeight'))}</th>${model.alternatives.map(option => `<th>${escapeHTML(nameOf(option))}</th>`).join('')}</tr>`;
    const rows = model.criteria.map((criterion, index) => `<tr><td>${escapeHTML(nameOf(criterion))} (${percent(weights[index])})</td>${model.alternatives.map((option, optionIndex) => `<td title="${escapeHTML(t('results.localPriority', { value: percent(result.locals[index].weights[optionIndex]) }))}">${percent(weights[index] * result.locals[index].weights[optionIndex])}</td>`).join('')}</tr>`).join('');
    const totals = `<tr class="total"><td>${escapeHTML(t('results.finalPreference'))}</td>${scores.map(score => `<td>${percent(score)}</td>`).join('')}</tr>`;
    $('contributions').innerHTML = `<table class="contribution-table"><thead>${header}</thead><tbody>${rows}${totals}</tbody></table>`;
    $('consistency').innerHTML = [{ name: t('audit.criteriaLabel'), analysis: result.criteria }, ...model.criteria.map((criterion, index) => ({ name: nameOf(criterion), analysis: result.locals[index] }))]
      .map(entry => `<div class="consistency-row"><span>${escapeHTML(entry.name)}</span><strong class="${entry.analysis.acceptable ? 'ok' : 'warn'}">${percent(entry.analysis.CR, 2)} ${entry.analysis.acceptable ? '✓' : escapeHTML(t('results.review'))}</strong></div>`).join('');
    $('result-caveat').textContent = scenarioEnabled
      ? t('results.scenarioCaveat')
      : t('results.caveat');
  }

  function renderSensitivity() {
    const index = criterionIndex();
    const criterion = model.criteria[index];
    const baseWeight = result.criteria.weights[index];
    if (scenarioPercent === null) scenarioPercent = Math.round(baseWeight * 100);
    $('scenario-criterion').innerHTML = model.criteria.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === scenarioCriterion ? 'selected' : ''}>${escapeHTML(nameOf(item))}</option>`).join('');
    $('scenario-weight-name').textContent = t('scenario.criterionWeightName', { name: nameOf(criterion) });
    $('scenario-slider').value = String(scenarioPercent);
    $('scenario-percent').textContent = percent(scenarioPercent / 100, 0);
    $('scenario-toggle').checked = scenarioEnabled;
    const samples = Engine.sensitivity(result, index, 100);
    const width = 900, height = 274, left = 55, right = 24, top = 18, bottom = 39;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const x = value => left + plotWidth * value;
    const y = value => top + plotHeight * (1 - value);
    let svg = `<svg role="img" aria-label="${escapeHTML(t('scenario.chartLabel'))}" direction="${I18n.direction}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;
    for (let value = 0; value <= 1.00001; value += 0.2) {
      svg += `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" stroke="#e7eef2"/><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end" font-size="11" fill="#8194a2">${percent(value, 0)}</text>`;
    }
    for (let value = 0; value <= 1.0001; value += 0.25) {
      svg += `<line x1="${x(value)}" y1="${top}" x2="${x(value)}" y2="${height - bottom}" stroke="#f0f4f7"/><text x="${x(value)}" y="${height - 14}" text-anchor="middle" font-size="11" fill="#8194a2">${percent(value, 0)}</text>`;
    }
    model.alternatives.forEach((option, optionIndex) => {
      const path = samples.map((sample, sampleIndex) => `${sampleIndex ? 'L' : 'M'} ${format(x(sample.weight), 2)} ${format(y(sample.scores[optionIndex]), 2)}`).join(' ');
      svg += `<path d="${path}" fill="none" stroke="${COLORS[optionIndex % COLORS.length]}" stroke-width="3" stroke-linejoin="round"/>`;
    });
    svg += `<line x1="${x(baseWeight)}" y1="${top}" x2="${x(baseWeight)}" y2="${height - bottom}" stroke="#8f9eb0" stroke-dasharray="5 5"/><text x="${Math.min(width - 110, x(baseWeight) + 6)}" y="${top + 11}" font-size="10" fill="#657789">${escapeHTML(t('scenario.baseLabel', { value: percent(baseWeight, 0) }))}</text>`;
    if (scenarioEnabled) {
      model.alternatives.forEach((option, optionIndex) => {
        svg += `<circle cx="${x(scenarioPercent / 100)}" cy="${y(scores[optionIndex])}" r="5" fill="${COLORS[optionIndex % COLORS.length]}" stroke="white" stroke-width="2"/>`;
      });
    }
    svg += `<text x="${left + plotWidth / 2}" y="${height - 2}" font-size="11" fill="#6a7e8c" text-anchor="middle">${escapeHTML(t('scenario.axisLabel', { name: nameOf(criterion) }))}</text></svg>`;
    $('sensitivity-chart').innerHTML = svg;
    $('chart-legend').innerHTML = model.alternatives.map((option, index) => `<span><i class="legend-color" style="background:${COLORS[index % COLORS.length]}"></i>${escapeHTML(nameOf(option))}</span>`).join('');
    const changes = [];
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index].winner !== samples[index - 1].winner) changes.push(samples[index]);
    }
    const note = changes.length
      ? t('scenario.leaderChanges', { values: changes.map(sample => percent(sample.weight, 0)).join(t('list.separator')) })
      : t('scenario.leaderStable');
    $('sensitivity-note').innerHTML = `${escapeHTML(t('scenario.baseWeight', { value: percent(baseWeight) }))} ${escapeHTML(note)}`;
  }

  function renderAudit() {
    $('audit-method').textContent = t(method === 'eigen' ? 'results.eigen' : 'results.rgmm');
    $('audit-summary').innerHTML = `<div class="audit-summary-line"><span><b>${escapeHTML(t('audit.solver'))}</b> ${escapeHTML(t(method === 'eigen' ? 'audit.powerIteration' : 'audit.rowGeometricMean'))}</span><span><b>${escapeHTML(t('audit.criteriaLambda'))}</b> ${format(result.criteria.lambdaMax, 6)}</span><span><b>${escapeHTML(t('audit.ci'))}</b> ${format(result.criteria.CI, 6)}</span><span><b>${escapeHTML(t('audit.ri'))}</b> ${format(result.criteria.RI, 2)}</span><span><b>${escapeHTML(t('audit.cr'))}</b> ${percent(result.criteria.CR, 3)}</span></div>`;
    const groups = [
      { title: t('audit.criteriaComparisons'), items: model.criteria, pairs: model.criteriaPairs, analysis: result.criteria },
      ...model.criteria.map((criterion, index) => ({
        title: t('audit.optionsFor', { name: nameOf(criterion) }),
        items: model.alternatives,
        pairs: model.alternativePairs[criterion.id],
        analysis: result.locals[index],
      })),
    ];
    $('all-matrices').innerHTML = groups.map(group => {
      const matrix = Engine.toMatrix(group.items.length, group.pairs);
      const rows = group.items.map((item, index) => `<tr><td>${escapeHTML(nameOf(item))}</td><td>${format(group.analysis.weights[index], 6)}</td><td>${format(group.analysis.Aw[index], 6)}</td><td>${format(group.analysis.Aw[index] / group.analysis.weights[index], 6)}</td></tr>`).join('');
      const consistency = group.analysis.acceptable ? t('audit.consistent') : t('audit.reviewComparisons');
      const stats = t('audit.stats', {
        lambda: format(group.analysis.lambdaMax, 6),
        ci: format(group.analysis.CI, 6),
        ri: format(group.analysis.RI, 2),
        cr: percent(group.analysis.CR, 3),
        consistency,
      });
      return `<div class="audit-matrix-group"><h3>${escapeHTML(group.title)}</h3><p>${escapeHTML(stats)}</p><div class="table-scroll">${matrixTable(matrix, group.items)}<table class="diagnostic-table"><thead><tr><th>${escapeHTML(t('audit.item'))}</th><th>${escapeHTML(t('audit.priority'))}</th><th>${escapeHTML(t('audit.aw'))}</th><th>${escapeHTML(t('audit.awPriority'))}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
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
    const rows = [[t('csv.criterion'), t('csv.criterionWeight'), ...model.alternatives.map(option => nameOf(option))]];
    model.criteria.forEach((criterion, index) => rows.push([
      nameOf(criterion), weights[index], ...result.locals[index].weights,
    ]));
    rows.push([t('csv.finalPreference'), 1, ...scores]);
    rows.push([t('csv.solver'), t(method === 'eigen' ? 'results.eigen' : 'results.rgmm'), t('csv.scenarioActive'), scenarioEnabled ? t('common.yes') : t('common.no')]);
    rows.push([t('csv.criteriaConsistency'), result.criteria.CR]);
    model.criteria.forEach((criterion, index) => rows.push([t('csv.criterionConsistency', { name: nameOf(criterion) }), result.locals[index].CR]));
    download(rows.map(row => row.map(csvCell).join(',')).join('\n'), t('file.resultsCsv'), 'text/csv;charset=utf-8');
    showToast(t('message.csvExported'));
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
    download(JSON.stringify(model, null, 2), t('file.decisionJson'), 'application/json');
    showToast(t('message.jsonExported'));
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
      showToast(t('message.imported'));
    } catch (error) {
      console.error(error);
      showToast(t('message.importFailed'));
    } finally {
      event.target.value = '';
    }
  });
  $('download-csv').addEventListener('click', exportCSV);
  $('language-select').addEventListener('change', async event => {
    const requestedLocale = event.target.value;
    try {
      await I18n.load(requestedLocale);
      try {
        localStorage.setItem(LANGUAGE_KEY, requestedLocale);
      } catch (error) {
        console.warn(error);
      }
      render();
    } catch (error) {
      console.error(error);
      event.target.value = I18n.locale;
      showToast(t('message.localeLoadFailed'));
    }
  });
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
      console.warn(error);
    }
    render();
    showToast(t('message.workspaceCleared'));
  });

  async function initialize() {
    let preferredLocale = 'en';
    try {
      preferredLocale = localStorage.getItem(LANGUAGE_KEY)
        || (navigator.language?.toLowerCase().startsWith('fa') ? 'fa' : 'en');
    } catch (error) {
      console.warn(error);
    }
    try {
      await I18n.load(preferredLocale);
    } catch (error) {
      console.error(error);
      await I18n.load('en');
    }
    $('language-select').value = I18n.locale;
    // A completely blank workspace is a valid product starting state.
    render();
  }

  initialize();
})();
