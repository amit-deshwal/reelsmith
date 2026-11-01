# Shot lists (the user's own edit)

A brief that lists timed shots ("0.0–3.0s misty Zunjar Machi, slow motion 50%. Text: …"), the kind written for other AI editors, is the user's edit, already directed. Build it as written; your job is casting the right clip for each line and the craft. The treatment check turns into shot-list mode by itself when the story has three or more timed shots (or set `shotList: true`): it drops the rules about hooks, lengths, moves and promo copy.

Stage 1 as usual (with `brandUrl` when they name a site; the brand kit is only for facts). Then:

- **Treatment:** `story` is their whole brief, word for word. One concept (theirs), `shotList: true`, their tone. One part per listed shot, in their order, `beats` = its seconds x 2 without a song (0.0–3.0s = 6 beats). No `signature` of yours.
- **Plan:** one section per listed shot with `seconds` (their exact length), so the reel matches their clock.
  - Moves: `cut` for one shot, `hold` for a shot they want to linger on (a pan, a view). No zoom-punch, flash-cuts or velocity unless they ask. Plain cuts get no punch-in and holds no extra push in a shot list.
  - **Slow motion** they ask for ("slow motion 50%") is section `speed: 0.5`, on those shots only; slowed footage is silent. Real speed everywhere else.
  - **Lines:** exactly their words, emoji and case, on the section they belong to; a shot with no text has no line.
  - **Text style** from their description: "bold white text with a soft shadow, centred" is `caption` with `params.center: true`; a plain subtitle low in frame is `caption`. Never `punch-caps` or orange key words unless they ask.
  - **Transitions:** only those they name; "hard cuts only" means none. A reveal they describe ("the palm moves away from the lens and the top appears") is the cut between those two shots, on the time they gave.
  - **Grade:** "natural", "no heavy filters" is no look; a named look only when they ask for one. No effects or graphics they did not ask for (a promo end card only when their list has one; their last line carries the call to action).
  - **Sound:** "no music, keep the clips' audio muted" is `sfx: "off"`; tell them in the report to tick "No music" on export. "Export 1080x1920, 60fps" is the export dialog, not the plan.
- **Casting:** each section gets the clip that shows what their line names ("Konkan Darwaja", "Menghai Devi temple", "a palm covers the lens"). When the log has no such shot, the treatment returns a question: ask it, or use the nearest true shot and say which one in the report. Never put their line over a shot of something else.
- **Critique:** the checklist checks the build against their list (picture, words, timing, speed, their style rules), not against our taste. Fix only departures from the list.
- **Report:** which listed shots used which clips, any line moved or left out and why, and the export settings they asked for.
