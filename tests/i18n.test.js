const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I18n = require('../src/i18n.js');

const root = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('English and Persian catalogs have the same complete key set', () => {
  const english = readJson('locales/en.json');
  const persian = readJson('locales/fa.json');
  assert.deepEqual(Object.keys(persian).sort(), Object.keys(english).sort());
  assert.equal(english.locale, 'en');
  assert.equal(english.direction, 'ltr');
  assert.equal(persian.locale, 'fa');
  assert.equal(persian.direction, 'rtl');
  for (const catalog of [english, persian]) {
    for (const [key, value] of Object.entries(catalog)) {
      assert.equal(typeof value, 'string', `${key} should be text`);
      assert.notEqual(value.trim(), '', `${key} should not be empty`);
    }
  }
});

test('translation catalogs contain no duplicate keys and have matching placeholders', () => {
  const rawCatalogs = ['locales/en.json', 'locales/fa.json'].map(file => (
    fs.readFileSync(path.join(root, file), 'utf8')
  ));
  for (const raw of rawCatalogs) {
    const keys = [...raw.matchAll(/"([^"\\]+)"\s*:/g)].map(match => match[1]);
    assert.equal(new Set(keys).size, keys.length, 'locale has duplicate keys');
  }
  const english = readJson('locales/en.json');
  const persian = readJson('locales/fa.json');
  for (const key of Object.keys(english)) {
    const placeholders = value => [...value.matchAll(/\{([A-Za-z]+)\}/g)]
      .map(match => match[1]).sort();
    assert.deepEqual(placeholders(persian[key]), placeholders(english[key]), `${key} placeholders differ`);
  }
});

test('all locale keys referenced by the page and app exist in both catalogs', () => {
  const english = readJson('locales/en.json');
  const persian = readJson('locales/fa.json');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const pageKeys = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map(match => match[1]);
  const appKeys = [...app.matchAll(/\bt\('([^']+)'/g)].map(match => match[1]);
  const usedKeys = new Set([...pageKeys, ...appKeys]);
  for (const key of usedKeys) {
    assert.ok(Object.hasOwn(english, key), `English catalog is missing ${key}`);
    assert.ok(Object.hasOwn(persian, key), `Persian catalog is missing ${key}`);
  }
});

test('message interpolation replaces named values without changing unmatched tokens', () => {
  const english = readJson('locales/en.json');
  const persian = readJson('locales/fa.json');
  assert.equal(I18n.interpolate(english['setup.complete'], {
    options: '2', criteria: '3', comparisons: '12',
  }), '2 options · 3 criteria · 12 pairwise judgments');
  assert.equal(I18n.interpolate(persian['options.remove'], { name: 'گزینهٔ الف' }), 'حذف گزینهٔ الف');
  assert.equal(I18n.interpolate('Value: {known}; missing: {unknown}', { known: '7' }), 'Value: 7; missing: {unknown}');
});

test('loading a locale sets document language, direction, and localized attributes', async () => {
  const previousDocument = global.document;
  const previousFetch = global.fetch;
  const htmlElements = [{ dataset: { i18n: 'hero.title' }, textContent: '' }];
  const placeholders = [{ dataset: { i18nPlaceholder: 'options.namePlaceholder' }, placeholder: '' }];
  const ariaLabels = [{
    dataset: { i18nAriaLabel: 'brand.home' },
    setAttribute(name, value) { this[name] = value; },
  }];
  const titles = [{ dataset: { i18nTitle: 'judgments.scaleHelp' }, title: '' }];
  const content = [{ dataset: { i18nContent: 'meta.description' }, content: '' }];
  global.document = {
    documentElement: {},
    querySelectorAll(selector) {
      return {
        '[data-i18n]': htmlElements,
        '[data-i18n-placeholder]': placeholders,
        '[data-i18n-aria-label]': ariaLabels,
        '[data-i18n-title]': titles,
        '[data-i18n-content]': content,
      }[selector] || [];
    },
  };
  global.fetch = async url => ({
    ok: true,
    async json() { return readJson(url); },
  });
  try {
    await I18n.load('fa');
    assert.equal(global.document.documentElement.lang, 'fa');
    assert.equal(global.document.documentElement.dir, 'rtl');
    assert.equal(htmlElements[0].textContent, readJson('locales/fa.json')['hero.title']);
    assert.equal(placeholders[0].placeholder, 'گزینهٔ {number}');
    assert.equal(ariaLabels[0]['aria-label'], readJson('locales/fa.json')['brand.home']);
    assert.equal(titles[0].title, readJson('locales/fa.json')['judgments.scaleHelp']);
    assert.equal(content[0].content, readJson('locales/fa.json')['meta.description']);
    assert.equal(I18n.t('items.untitled'), 'بدون عنوان');
  } finally {
    await I18n.load('en');
    global.document = previousDocument;
    global.fetch = previousFetch;
  }
});
