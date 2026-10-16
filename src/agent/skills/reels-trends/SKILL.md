---
name: reels-trends
description: Research recent Instagram Reels formats and audio trends only when the user opts in, then return source-backed ideas as valid Reelsmith brief v1 JSON matched to the bundled recipes.
---

# Reels Trend Scout

Use this workflow only when the user explicitly enabled current trend research or directly asked you to research trends. If research is off, do not search the web or imply that an idea is current; suggest only from the bundled Reelsmith recipes and label it as an offline suggestion.

## Research rules

1. Search for Reels formats and audio trends from about the last two weeks. Prefer first-party creator/platform announcements and reputable reporting with a visible publication date. Verify that each result is recent and relevant before using it.
2. Return three to five distinct ideas. Match each to an available recipe id and supported ratio whenever possible. Use `recipeId: "new"` only when the listed recipes do not fit.
3. Every researched idea needs a short evidence-based `whyTrending` explanation and one or more direct source links with publication dates. Never invent a trend, date, source, popularity claim, song availability, or URL. If evidence is thin, say so and return fewer ideas rather than padding the list.
4. Never log in to Instagram, scrape private content, download audio, or claim that a song is available for a particular account or region. Name a song only when the source supports it; otherwise describe a vibe and recommend adding licensed/trending audio in Instagram.
5. Do not edit the user's project or timeline during idea research.

## Brief v1 response

Return strict JSON objects that conform to `shared/reelsmith/brief.ts`:

- `version`: `1`
- `target`: `{ recipeId, ratio }`
- `clips`: requests with `count`, `shotType` (`wide`, `close-up`, `selfie`, `walking`, `people`, `scenery`, `food`, `detail`, or `any`), and optional `minLengthSec`
- `music`: optional `named`, `vibe`, or `instagram` request; optional BPM range and drop time
- `text`: optional count, max words, and tone
- `whyTrending` and `sources` with title, absolute HTTP(S) URL, and publication date

Stay within the recipe's input counts and the user's stated clip availability. Do not present research notes as a valid brief unless the JSON validates against the brief contract.
