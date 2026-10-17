// RS-501: upstream falls back to Chinese ('zh') when no transcription language is set, which turns
// English, Hindi and Hinglish speech into nonsense. Reelsmith is English-first; Hindi/Marathi are set in Settings.
export const DEFAULT_TRANSCRIPTION_LANGUAGE = 'en';

/** Languages Whisper handles that this app targets (Settings > Transcription language takes the code). */
export const TRANSCRIPTION_LANGUAGE_HINTS = { en: 'English', hi: 'Hindi', mr: 'Marathi' } as const;

export function transcriptionLanguageOrDefault(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : DEFAULT_TRANSCRIPTION_LANGUAGE;
}
