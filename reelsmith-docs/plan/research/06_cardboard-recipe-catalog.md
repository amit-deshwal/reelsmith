# Cardboard public recipe catalogue — metadata index

Source: https://www.cardboard.ai/recipes (structured recipe data embedded in the page payload, fetched 2026-10-15) and per-recipe Markdown pages (Accept: text/markdown).
Recipes found: **80**. Only factual metadata is listed (name, category, aspect, length class, declared inputs, availability). Marketing descriptions, posters and preview videos are Cardboard assets and are NOT copied.

Categories: Effect 23, Viral trends 13, Product showcase 10, Launch video 7, Vlog 5, Travel montage 5, Clipping 5, Talking-head 4, UGC 3, Aftermovie 3, Explainer 2
Aspect ratios: 16:9 35, 9:16 35, 4:3 6, 4:5 2, 1:1 1, 3:4 1
Mac-only (onWeb=false): 18; available on both: 62

Observed public input schema (field names as published): recipe keys = aspectRatio, category, description, highlights, id, inputs, isTrending, length, name, onMac, onWeb, slug; input keys = accept, default, hint, id, kind, label, max, maxLength, min, optional, options, placeholder, prompt; input kinds = media, select, text.

| Name | Category | Aspect | Length | Inputs (id:kind[accept] min-max, opt) | Web/Mac | Link |
|---|---|---|---|---|---|---|
| Event Aftermovie | Aftermovie | 16:9 | long | clips:media[video,image] 8-60; event:text; line:text opt; narration:text opt; about:text opt | Y/Y | https://www.cardboard.ai/recipes/event-aftermovie |
| Festival Aftermovie | Aftermovie | 9:16 | short | clips:media[video,image,audio] 3-60; topic:text; brief:text opt | N/Y | https://www.cardboard.ai/recipes/festival-aftermovie |
| Sundance Event Recap | Aftermovie | 16:9 | short | clips:media[video,image] 8-60; event:text; edition:text opt; year:text opt | Y/Y | https://www.cardboard.ai/recipes/sundance-event-aftermovie |
| Competition Teaser | Clipping | 9:16 | short | clips:media[video,image,audio] 1-20; topic:text; brief:text opt | N/Y | https://www.cardboard.ai/recipes/competition-teaser |
| Cut-out Podcast Clip | Clipping | 9:16 | short | media:media[video,image] 1-25; moment:text opt | Y/Y | https://www.cardboard.ai/recipes/cutout-podcast-clip-guide |
| Future Talks Clip | Clipping | 9:16 | short | clips:media[video,image,audio] 1-12; topic:text; brief:text opt | N/Y | https://www.cardboard.ai/recipes/future-talks-clip |
| MrBeast-style Clip | Clipping | 9:16 | short | clips:media[video,image,audio] 1-12; topic:text; brief:text opt | N/Y | https://www.cardboard.ai/recipes/mrbeast-style-clip |
| Podcast Highlight | Clipping | 9:16 | short | media:media[video,image] 1-12; idea:text opt; accent:text opt | Y/Y | https://www.cardboard.ai/recipes/podcast-highlight-guide |
| 3D Kinetic Typography Title | Effect | 16:9 | long | words:text | Y/Y | https://www.cardboard.ai/recipes/kinetic-typography-guide |
| ASCII Glow | Effect | 16:9 | short | media:media[video,audio] 1-5 | Y/Y | https://www.cardboard.ai/recipes/ascii-glow |
| Blob Tracking | Effect | 16:9 | short | clips:media[video] 1-8; labels:text opt; look:text opt | Y/Y | https://www.cardboard.ai/recipes/blob-tracking |
| Brain Explode 3D Graphics | Effect | 9:16 | short | media:media[image,audio] 1-16; name:text opt; words:text opt | Y/Y | https://www.cardboard.ai/recipes/brain-explode-guide |
| Card Breakout | Effect | 9:16 | short | video:media[video] 1-3 | Y/Y | https://www.cardboard.ai/recipes/object-into-frame |
| Continuous Mask | Effect | 4:5 | short | video:media[video] 1-1 | Y/Y | https://www.cardboard.ai/recipes/continuous-mask |
| Double Exposure | Effect | 4:3 | short | clips:media[video] 2-4 | Y/Y | https://www.cardboard.ai/recipes/double-exposure |
| Echo Print | Effect | 16:9 | short | video:media[video] 1-1 | Y/Y | https://www.cardboard.ai/recipes/echo-print |
| Frame Division | Effect | 16:9 | short | clips:media[video,image] 4-8 | Y/Y | https://www.cardboard.ai/recipes/frame-division |
| Invisible Man | Effect | 9:16 | short | video:media[video] 1-1 | Y/Y | https://www.cardboard.ai/recipes/invisible-man |
| Keyframed Portal | Effect | 16:9 | short | clips:media[video] 1-2 | Y/Y | https://www.cardboard.ai/recipes/keyframed-portal |
| Match Split | Effect | 16:9 | short | clips:media[video] 1-2; line:text opt | Y/Y | https://www.cardboard.ai/recipes/match-split |
| MixMedia Crayon | Effect | 4:3 | long | media:media[video,audio] 1-2; start:text opt | Y/Y | https://www.cardboard.ai/recipes/mixmedia-crayon-guide |
| Movie Title Reveal | Effect | 16:9 | long | — | Y/Y | https://www.cardboard.ai/recipes/movie-title-reveal |
| Orbital Screens | Effect | 4:5 | short | videos:media[video,image] 4-9 | Y/Y | https://www.cardboard.ai/recipes/orbital-screens |
| Photo Grid Reveal | Effect | 16:9 | short | photos:media[image] 4-11 | Y/Y | https://www.cardboard.ai/recipes/grid-matte-parle |
| Shades | Effect | 16:9 | long | product:media[image,video] 1-4; name:text; tagline:text opt; specs:text opt | Y/Y | https://www.cardboard.ai/recipes/shades-guide |
| Sketch Effect | Effect | 9:16 | short | video:media[video] 1-1 | Y/Y | https://www.cardboard.ai/recipes/sketch-effect |
| Subject Isolation | Effect | 9:16 | short | clips:media[video,image] 5-12 | Y/Y | https://www.cardboard.ai/recipes/subject-isolation-guide |
| Thermal Vision | Effect | 16:9 | short | video:media[video] 1-1 | Y/Y | https://www.cardboard.ai/recipes/thermal-vision |
| Water Ripple | Effect | 16:9 | short | video:media[video] 1-1 | Y/Y | https://www.cardboard.ai/recipes/water-ripple |
| Window Reveal | Effect | 16:9 | short | clip:media[video] 1-1 | Y/Y | https://www.cardboard.ai/recipes/window-trail-mask |
| Window Trail Glitch | Effect | 16:9 | short | clips:media[video] 3-12 | Y/Y | https://www.cardboard.ai/recipes/window-trail-glitch |
| Illustrated Film Explainer | Explainer | 4:3 | long | clips:media[video,image,audio] 0-80; topic:text; brief:text opt | N/Y | https://www.cardboard.ai/recipes/illustrated-film-explainer |
| Paper Desk Documentary | Explainer | 9:16 | short | topic:text; facts:text opt; media:media[image,video,audio] 3-13 | Y/Y | https://www.cardboard.ai/recipes/rap-documentary |
| Artsy Manifesto | Launch video | 16:9 | long | media:media[video,image] 4-15; brand:text; topic:text; verb:text opt | Y/Y | https://www.cardboard.ai/recipes/art-launch-video |
| Elemental Motion Graphic | Launch video | 4:3 | long | logo:media[image] 0-1; name:text; about:text; phrases:text opt; color:text opt; website:text opt | Y/Y | https://www.cardboard.ai/recipes/elemental-motion-graphic-guide |
| Flash-Cut Brand Teaser | Launch video | 9:16 | short | media:media[video,image] 2-12; brand:text | N/Y | https://www.cardboard.ai/recipes/launch-video-now |
| Founder Doc Reel | Launch video | 9:16 | short | photos:media[image,video,audio] 0-14; subject:text; angle:text opt; script:text opt | Y/Y | https://www.cardboard.ai/recipes/founder-video-guide |
| Founder Launch Film | Launch video | 16:9 | long | media:media[video,image,audio] 3-20; subject:text; story:text opt | N/Y | https://www.cardboard.ai/recipes/founder-launch-video |
| Launch Video MG | Launch video | 16:9 | long | media:media[image,video,audio] 0-16; brand:text; about:text opt; colors:text opt; script:text opt | N/Y | https://www.cardboard.ai/recipes/launch-video-mg-guide |
| Retro Browser Launch | Launch video | 16:9 | short | media:media[video,image] 0-2; brand:text; domain:text; tagline:text opt | Y/Y | https://www.cardboard.ai/recipes/launch-video-simple |
| Branding Intro | Product showcase | 16:9 | long | media:media[image,video,audio] 3-20; brand:text; about:text; colour:text opt; tagline:text opt | Y/Y | https://www.cardboard.ai/recipes/branding-intro-guide |
| Feature Explainer | Product showcase | 16:9 | long | media:media[video,image] 1-8; product:text; feature:text opt; site:text opt | Y/Y | https://www.cardboard.ai/recipes/solaire-forecast |
| Laptop Revolution | Product showcase | 16:9 | short | clips:media[video,image,audio] 1-20; topic:text; brief:text opt | N/Y | https://www.cardboard.ai/recipes/laptop-product-overview |
| Lip Oil Showcase | Product showcase | 9:16 | short | clips:media[video,image,audio] 1-12; topic:text; brief:text opt | Y/Y | https://www.cardboard.ai/recipes/lip-oil-showcase |
| Mac Screen Walkthrough | Product showcase | 16:9 | long | media:media[video] 1-3; product:text; site:text opt | Y/Y | https://www.cardboard.ai/recipes/mac-screen-demo |
| Mobile App Walkthrough | Product showcase | 9:16 | short | clips:media[video,image,audio] 3-20; topic:text; brief:text opt | N/Y | https://www.cardboard.ai/recipes/mobile-app-walkthrough |
| Music Player Reveal | Product showcase | 16:9 | short | clips:media[video,image,audio] 1-8; topic:text; brief:text opt | Y/Y | https://www.cardboard.ai/recipes/music-player-reveal |
| Podcast Product Review | Product showcase | 16:9 | short | clips:media[video,image,audio] 1-6; topic:text; brief:text opt | N/Y | https://www.cardboard.ai/recipes/podcast-product-review |
| Screen Product Demo | Product showcase | 16:9 | long | media:media[video] 1-2 | N/Y | https://www.cardboard.ai/recipes/screen-product-demo |
| Web App Walkthrough | Product showcase | 16:9 | short | screens:media[image] 3-8; presenter:media[video] 0-1; logo:media[image] 0-1; product:text; flow:text opt; cta:text opt; site:text opt; accent:text opt | Y/Y | https://www.cardboard.ai/recipes/saas-walkthrough |
| Claude News Reel | Talking-head | 9:16 | short | clips:media[video,image,audio] 1-20; topic:text; brief:text opt | N/Y | https://www.cardboard.ai/recipes/claude-tokens-reel |
| Presenter Tips Explainer | Talking-head | 9:16 | short | clips:media[video,image,audio] 1-12; topic:text; brief:text opt | N/Y | https://www.cardboard.ai/recipes/presenter-tips-explainer |
| Talking-head Meta Ad | Talking-head | 9:16 | short | clips:media[video,image,audio] 1-20; topic:text; brief:text opt | Y/Y | https://www.cardboard.ai/recipes/talking-head-meta-ad |
| Tech News Reel | Talking-head | 9:16 | short | clips:media[video,image,audio] 1-30; topic:text; brief:text opt | N/Y | https://www.cardboard.ai/recipes/tech-news-reel |
| Editorial City Title | Travel montage | 16:9 | short | photos:media[image] 4-8; place:text; trip:text opt; accent:text opt | Y/Y | https://www.cardboard.ai/recipes/motion-graphic-reel |
| Travel Collage | Travel montage | 16:9 | long | clips:media[video,image] 6-40; place:text | Y/Y | https://www.cardboard.ai/recipes/travel-collage-guide |
| Travel Diary | Travel montage | 16:9 | short | clips:media[video,image] 4-20; words:text opt | Y/Y | https://www.cardboard.ai/recipes/travel-diary |
| Travel Montage | Travel montage | 16:9 | long | clips:media[video,image] 6-40; title:text | Y/Y | https://www.cardboard.ai/recipes/travel-montage-guide |
| Travel Vlog | Travel montage | 9:16 | short | clips:media[video,image] 6-40; city:text; about:text opt | Y/Y | https://www.cardboard.ai/recipes/travel-vlog |
| Head-Locked Captions | UGC | 9:16 | short | media:media[video] 1-1; start:text opt | N/Y | https://www.cardboard.ai/recipes/head-locked-captions-guide |
| Simple UGC | UGC | 9:16 | short | video:media[video] 1-3; names:text opt | Y/Y | https://www.cardboard.ai/recipes/simple-ugc |
| Tracked Captions | UGC | 9:16 | short | video:media[video] 1-1; names:text opt | Y/Y | https://www.cardboard.ai/recipes/tracked-captions-guide |
| Bobblehead Avatar | Viral trends | 9:16 | short | photo:media[image] 1-2; obsessed:text; love:text; vibe:text opt | N/Y | https://www.cardboard.ai/recipes/minecraft-avatar |
| Character Edit | Viral trends | 16:9 | long | media:media[video,image] 3-30; title:text; who:text opt | N/Y | https://www.cardboard.ai/recipes/character-edit-guide |
| Double Exposure Credits | Viral trends | 16:9 | short | figures:media[video] 1-7; footage:media[video] 2-7; name:text; camera:text opt; roles:text opt | Y/Y | https://www.cardboard.ai/recipes/trend-outro |
| Falling Through the Feed | Viral trends | 9:16 | short | clip:media[video] 1-1; username:text opt | Y/Y | https://www.cardboard.ai/recipes/trend-falling |
| Fit Check Shuffle | Viral trends | 9:16 | short | fits:media[image] 4-9; logo:media[image] 0-1; brand:text opt | Y/Y | https://www.cardboard.ai/recipes/fashion-motion-edit |
| Footpath Gallery | Viral trends | 9:16 | short | photos:media[image,video] 1-21 | Y/Y | https://www.cardboard.ai/recipes/trend-footpath |
| HIMYM Intro | Viral trends | 16:9 | long | photos:media[image] 8-30; title:text; credit:text opt | Y/Y | https://www.cardboard.ai/recipes/himym-intro-guide |
| Light Trails | Viral trends | 1:1 | short | video:media[video] 1-3 | Y/Y | https://www.cardboard.ai/recipes/hail-mary-trend |
| Match-Cut SFX Edit | Viral trends | 4:3 | short | media:media[video] 4-20 | Y/Y | https://www.cardboard.ai/recipes/match-cut-sfx |
| Moving Painting | Viral trends | 9:16 | short | clip:media[video] 1-1 | Y/Y | https://www.cardboard.ai/recipes/trend-painting |
| Photo Collage Build | Viral trends | 4:3 | short | photos:media[image] 6-40 | Y/Y | https://www.cardboard.ai/recipes/trend-collage |
| Receipt Stop-Motion | Viral trends | 9:16 | short | clips:media[video] 1-3 | Y/Y | https://www.cardboard.ai/recipes/receipt-stopmotion |
| Texture Outfit | Viral trends | 3:4 | short | photo:media[image,video] 1-1; garment:text opt; texture:select | Y/Y | https://www.cardboard.ai/recipes/floral-shorts |
| Cinematic Story Vlog | Vlog | 9:16 | long | media:media[video,image] 1-15; about:text opt | Y/Y | https://www.cardboard.ai/recipes/photo-vlog |
| Clock Vlog | Vlog | 9:16 | short | clips:media[video,image] 1-40; day:text opt; about:text opt | Y/Y | https://www.cardboard.ai/recipes/clock-vlog |
| Day in My Life, Comical | Vlog | 9:16 | short | media:media[video,image] 4-20; name:text opt; story:text opt | Y/Y | https://www.cardboard.ai/recipes/day-in-a-comic |
| Gold Script Quote | Vlog | 9:16 | short | footage:media[video] 1-3; audio:media[audio] 0-1; words:text opt | Y/Y | https://www.cardboard.ai/recipes/life-i-made |
| Mini Vlog | Vlog | 9:16 | short | clips:media[video,image] 5-40; day:text opt; about:text opt | Y/Y | https://www.cardboard.ai/recipes/mini-vlog-guide |
