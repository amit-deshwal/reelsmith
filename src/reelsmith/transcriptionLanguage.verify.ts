import assert from 'node:assert/strict';
import { DEFAULT_TRANSCRIPTION_LANGUAGE, transcriptionLanguageOrDefault } from './transcriptionLanguage.ts';
import { preferredTranscriptionLanguage } from '../transcript/provider.ts';

assert.equal(DEFAULT_TRANSCRIPTION_LANGUAGE, 'en', 'never Chinese by default');
assert.equal(transcriptionLanguageOrDefault(undefined), 'en');
assert.equal(transcriptionLanguageOrDefault('  '), 'en');
assert.equal(transcriptionLanguageOrDefault(' hi '), 'hi');
assert.equal(preferredTranscriptionLanguage(), 'en', 'no saved setting (and no localStorage) -> English');

// the Settings dropdown shows the same default the code uses, offers Hindi and Marathi, and names them in English
const { localAsrPage } = await import('../components/settings/settingsMediaProviders.ts');
const { EN: en } = await import('../i18n/dict/en/index.ts');
const field = localAsrPage.fields.find((f) => f.name === 'TRANSCRIPTION_LANGUAGE');
assert.ok(field && field.kind === 'select', 'the language field exists');
assert.equal(field.defaultLabel, '英语（en）', 'the dropdown default is English, matching DEFAULT_TRANSCRIPTION_LANGUAGE');
const options = field.options ?? [];
const values = options.map((o) => o.value);
assert.equal(values[0], DEFAULT_TRANSCRIPTION_LANGUAGE, 'English is listed first');
assert.ok(values.includes('hi') && values.includes('mr'), 'Hindi and Marathi can be chosen');
for (const label of [field.defaultLabel, ...options.map((o) => o.label)]) assert.ok(en[label], `${label} has an English label`);
assert.equal(en['印地语（hi）'], 'Hindi (hi)');
assert.equal(en['马拉地语（mr）'], 'Marathi (mr)');
console.log('transcriptionLanguage.verify ok');
