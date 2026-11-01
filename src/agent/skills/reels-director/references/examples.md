# Worked example: the AMK "Earned" reel

## Treatment

```json treatment
{
  "story": "bro lied to me that it would be easy hike but instead took me to hardest hike in Maharashtra AMK (Alang Madan Kulang)..2 days full of adventure",
  "concepts": [
    { "name": "The betrayal", "idea": "Comic: open on bro with an arrow, cut hard to the brutal climb on the drop, end on the summit." },
    { "name": "Earned", "idea": "Royal: the lie as a quiet setup, the rope climb as the test with a velocity slam on the drop, AMK rising from behind the peaks, a gold title over the view." }
  ],
  "chosen": 1, "tone": "royal",
  "heroes": ["#2@6", "#8@3", "#4@10", "#3@1"],
  "parts": [
    { "role": "hook", "beats": 4, "move": "strips-reveal", "clips": ["#4@10", "#2", "#6", "#1"], "line": "bro lied to me", "purpose": "the setup: we were promised an easy hike" },
    { "role": "build", "beats": 6, "move": "hold", "clips": ["#9@1.5"], "line": "it would be easy hike", "idea": "the arrow on bro", "purpose": "who lied: bro, marked" },
    { "role": "drop", "beats": 8, "move": "velocity", "clips": ["#2@6"], "line": "hardest hike in Maharashtra", "purpose": "the turn: it is brutal" },
    { "role": "peak", "beats": 6, "move": "break-in", "clips": ["#5@12", "#7@3"], "purpose": "the scale of the climb" },
    { "role": "payoff", "beats": 4, "move": "hold", "clips": ["#3@1"], "line": "AMK", "purpose": "the payoff: we made it to AMK" },
    { "role": "ending", "beats": 12, "move": "cards-finale", "clips": ["#8@3", "#4", "#6", "#1", "#5", "#7"], "line": "2 days full of adventure", "purpose": "the whole trip in one look" }
  ],
  "signature": "velocity slam on the rope climb (#2@6) on the drop, with a zoom-blur hit",
  "textStyles": ["rise-lines", "landscape-title", "shine"],
  "transitions": ["light-dissolve", "zoom-through"],
  "effects": ["zoom-blur", "light-rays"],
  "graphics": ["annotate"]
}
```

## Plan

The "Earned" treatment above on a 130 bpm song (dropAtBeat 10):

```json
{
  "ratio": "9:16", "music": "<song assetId>", "musicStart": 58.8,
  "sections": [
    { "move": "strips-reveal", "beats": 4, "clips": ["#4@10", "#2", "#6", "#1"], "text": "bro lied to me", "textStyle": "rise-lines" },
    { "move": "hold", "beats": 6, "clips": ["#9@1.5"], "text": "it would be easy hike", "textStyle": "rise-lines", "transition": "light-dissolve", "effects": [{ "id": "zoom-blur", "timing": "build", "strength": 0.5 }] },
    { "move": "velocity", "beats": 8, "clips": ["#2@6"], "text": "hardest hike in Maharashtra", "textStyle": "rise-lines", "transition": "zoom-through", "effects": [{ "id": "zoom-blur", "timing": "drop", "strength": 0.7 }] },
    { "move": "break-in", "beats": 6, "params": { "every": 3, "kind": "wide" }, "clips": ["#5@12", "#7@3"] },
    { "move": "hold", "beats": 4, "clips": ["#3@1"], "text": "AMK", "textStyle": "landscape-title" },
    { "move": "cards-finale", "beats": 12, "clips": ["#8@3", "#4", "#6", "#1", "#5", "#7"], "text": "2 days full of adventure", "textStyle": "shine", "effects": [{ "id": "light-rays", "timing": "fade", "strength": 0.6 }] }
  ],
  "graphics": [{ "graphic": "annotate", "from": 1, "beat": 1, "beats": 4, "text": "bro", "params": { "shape": "arrow", "who": "back" } }]
}
```

The reveal opens on movement with four words; the arrow names bro on a calm hold; the velocity slam lands on the drop (4 + 6 = beat 10) with a zoom-blur hit after a build; AMK rises from behind the peaks; the gold title closes over the grid. 40 beats, 18.5 s, three typefaces, two transitions, both at a change.

