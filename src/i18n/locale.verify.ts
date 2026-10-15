import assert from 'node:assert/strict';

const documentElement = { lang: 'en' };
let persistedLocale = 'it';
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: () => persistedLocale,
    setItem: (_key: string, value: string) => { persistedLocale = value; },
  },
});
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { documentElement },
});

const { getLocale, setLocale } = await import('./locale');
// Reelsmith is English-only: a saved language from an older build is ignored.
assert.equal(getLocale(), 'en');
assert.equal(documentElement.lang, 'en', 'English must set the initial document language');
setLocale('zh');
assert.equal(persistedLocale, 'zh');
assert.equal(documentElement.lang, 'zh-CN');

console.log('locale.verify: starts in English; changed locales update the document language');
