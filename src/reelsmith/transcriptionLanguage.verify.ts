import assert from 'node:assert/strict';
import { DEFAULT_TRANSCRIPTION_LANGUAGE, transcriptionLanguageOrDefault } from './transcriptionLanguage.ts';
import { preferredTranscriptionLanguage } from '../transcript/provider.ts';

assert.equal(DEFAULT_TRANSCRIPTION_LANGUAGE, 'en', 'never Chinese by default');
assert.equal(transcriptionLanguageOrDefault(undefined), 'en');
assert.equal(transcriptionLanguageOrDefault('  '), 'en');
assert.equal(transcriptionLanguageOrDefault(' hi '), 'hi');
assert.equal(preferredTranscriptionLanguage(), 'en', 'no saved setting (and no localStorage) -> English');
console.log('transcriptionLanguage.verify ok');
