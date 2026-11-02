# Voiceover reels (the user's own narration leads)

`reels_director_options` lists an imported file that is mostly speech under `voiceovers`, with its lines (`"3.7-6.3 No joining fee, nobody makes a profit."`, seconds of the file). Read the lines against the story: someone speaking about it (usually the user) is a voiceover; sung lyrics mean a song with dense vocals, so use it as `music` after all. A voiceover is never `music`, never cut to a beat grid, never turned down and never cut short. When the user says "my voiceover", "my voice" or "narration", or an imported audio file's lines tell their story, the reel is led by it.

The plan:
- `voiceover`: its assetId. It plays whole from the reel start at full level on its own track; its words become word-timed captions on their own (`captions`: a caption style id, default `highlight-word`; `false` only if the user asks for none). `voiceoverStart` skips a false start (seconds of the file).
- Two takes of the same script: use the one the user names; otherwise the complete, tighter one, and say which in the report.
- `music` is optional: a song the user imported plays under the voice, dipped wherever it speaks. With no other song, leave `music` out; never pick a library song unless they ask.
- **Cut to the lines, not to beats.** Give sections `seconds`, one section (or two) per line, starting where the line starts, so each line plays over shots of what it says: "nobody makes a profit" over the group, "strangers became close friends" over laughter and hugs, "see you on the trail" over the trail and the end card. The sections must add up to at least the voiceover's seconds plus 0.5 s (the build refuses a reel that would cut the last words). Hold the end card after the last word.
- Keep the hook: the first line plays over the most scroll-stopping moving shot; a `zoom-punch` burst under the first line still works.
- On-screen text is short and sits above the caption zone; it never repeats what the voice is saying (the captions already do). The intro title and the end card are fine; drop the user's suggested lines that the voice already says, or use them as the end card.
- No `naturalSound` while the voice speaks (the build leaves it off and says so); the clips' own sound can play only in a long pause. Sound effects default to `subtle`.
- In the report, say the voiceover runs whole with captions, and which take you used.
