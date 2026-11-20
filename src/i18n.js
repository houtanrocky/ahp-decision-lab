/* Loads locale JSON files and applies them to the static page shell. */
(function (root) {
  'use strict';

  const SUPPORTED_LOCALES = ['en', 'fa'];
  let activeLocale = 'en';
  let messages = {};

  function interpolate(message, values = {}) {
    return message.replace(/\{([A-Za-z]+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
    ));
  }

  function translate(key, values = {}) {
    let message = messages[key];
    if (typeof message !== 'string') return key;
    return interpolate(message, values);
  }

  async function load(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) throw new Error('unsupported_locale');
    const response = await fetch(`locales/${locale}.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error('locale_file_unavailable');
    const nextMessages = await response.json();
    if (nextMessages.locale !== locale || !['ltr', 'rtl'].includes(nextMessages.direction)) {
      throw new Error('locale_file_malformed');
    }
    activeLocale = locale;
    messages = nextMessages;
    document.documentElement.lang = locale;
    document.documentElement.dir = nextMessages.direction;
    apply(document);
    return activeLocale;
  }

  function apply(rootNode) {
    rootNode.querySelectorAll('[data-i18n]').forEach(element => {
      element.textContent = translate(element.dataset.i18n);
    });
    rootNode.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      element.placeholder = translate(element.dataset.i18nPlaceholder, element.i18nValues || {});
    });
    rootNode.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
      element.setAttribute('aria-label', translate(element.dataset.i18nAriaLabel, element.i18nValues || {}));
    });
    rootNode.querySelectorAll('[data-i18n-title]').forEach(element => {
      element.title = translate(element.dataset.i18nTitle);
    });
    rootNode.querySelectorAll('[data-i18n-content]').forEach(element => {
      element.content = translate(element.dataset.i18nContent);
    });
  }

  root.AHPI18n = {
    load,
    t: translate,
    interpolate,
    get locale() { return activeLocale; },
    get direction() { return messages.direction || 'ltr'; },
    supportedLocales: SUPPORTED_LOCALES,
  };
  if (typeof module === 'object' && module.exports) module.exports = root.AHPI18n;
})(typeof globalThis !== 'undefined' ? globalThis : this);
