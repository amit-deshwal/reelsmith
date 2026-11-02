# Lyric reels (the song's words on screen)

The lyric-video look: a song with singing, each sung word alone on screen as it is sung, huge and heavy, sitting **behind** the person so their head passes in front of the letters. Use it when the user asks for lyrics on screen, a lyric edit, a "song video", or shares a reference that does it.

The plan:
- `lyrics`: `true`, or `{ text, language, color, style }`, with `music` set to the song.
  - `text`: the lyrics in order, in the language they are sung (Hindi in Devanagari: "दीवाना हुआ कैसा होगा जादूगर"). Speech-to-text hears singing badly but its timing well, so the build lays these words onto the sung timing. **Ask the user for the lyrics** unless they gave them; without `text` the reel shows what the transcriber heard.
  - `language`: what the song is sung in (`hi`, `mr`, `en`); Hindi is assumed when `text` is Devanagari. Set it when there is no `text`, or the song is heard in the wrong language.
  - `color`: one bold colour against the night or the scene (the reference look is red `#e8141b`); white by default.
  - `style`: a caption style id; default `lyrics-behind` (one word at a time, behind the person). `behind-speaker` shows two words.
- Hindi and Marathi words get the bundled Devanagari face on their own; do not change fonts for them.
- **Shots under the sung lines**: one clear person, big in frame, the head around the middle (the words sit across it): a slow orbit or walk around them, a close-up from behind, a profile. Hold these shots (a `hold` or slow `cut`, 4-8 beats); fast cuts make the words jump between backgrounds. Save the busy cuts (`flash-cuts` with the flash off, wide dance shots, cutaways) for where the song has no words.
- No section `text` or overlays while words are sung: the lyrics are the text. A title in an instrumental gap or the end card is fine.
- The voiceover's captions give way to the lyrics; a reel has one of the two.
- In the report, say where the words came from (the user's lyrics on the sung timing, or the transcript) and the language.
