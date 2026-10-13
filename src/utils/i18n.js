// Traducciones: los textos viven en _locales/<idioma>/messages.json
// y Chrome elige el idioma según el del navegador.
export function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
}

// Traduce los elementos marcados con data-i18n (texto), data-i18n-html,
// data-i18n-title y data-i18n-placeholder
export function localizePage(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}
