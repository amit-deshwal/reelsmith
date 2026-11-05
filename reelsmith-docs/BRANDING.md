# Reelsmith branding

| Asset | File | Notes |
|---|---|---|
| App icon (source) | `assets/branding/reelsmith-icon.svg` | 1024×1024. Three fanned 9:16 reels (violet behind, ember in front with a play mark) and a forge spark on a deep ink tile |
| App icon (web, in-app `BrandMark`) | `public/reelsmith-icon.png` | 512×512, generated |
| App icon (macOS) | `assets/branding/reelsmith-icon.icns` | generated |
| Favicon | `assets/favicon.svg` | copy of the source SVG |
| Word mark | `ReelsmithWordmark` in `src/components/icons.tsx` | "reel" in the text colour, "smith" in the ember gradient |
| README banner | `assets/branding/reelsmith-banner.svg` | icon + word mark + tagline |

**Palette:** ink `#2a1a4a` → `#0c0817`; ember `#ffc35a` → `#ff6a3d` → `#e8236b`; back reels `#b8327a`→`#5a1d6e`, `#6b2a8a`→`#2f1650`; spark `#fffbe8` / `#ffd27a`.

**Tagline:** "Story, footage and a song in. A finished Reel out."

UI text: English strings that name OpenChatCut are rewritten to "Reelsmith" by `src/i18n/dict/en/reelsmithBranding.ts` (merged last in the EN dictionary), so upstream dictionary files stay untouched. Protocol identifiers (`X-OpenChatCut-*` headers, the `openchatcut` MCP server name, `occ` CLI, internal function names) are kept so upstream merges and existing MCP configs keep working.

## Regenerate the icons after editing the SVG

The macOS `.icns` follows Apple's icon grid: the tile is 824/1024 of the canvas, centred, with a soft shadow, so it sits at the same size as other apps in the Dock. The web PNG and favicon are full-bleed.

```bash
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
SET=$(mktemp -d)/icon.iconset && mkdir -p "$SET"
SET="$SET" node --input-type=module -e "
import sharp from 'sharp';
const svg = 'assets/branding/reelsmith-icon.svg', SET = process.env.SET;
async function mac(size) {
  const tile = Math.round(size * 824 / 1024), off = Math.round((size - tile) / 2);
  const art = await sharp(svg).resize(tile, tile).png().toBuffer();
  const shade = Buffer.from('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"' + size + '\" height=\"' + size + '\"><rect x=\"' + off + '\" y=\"' + (off + size * 0.01) + '\" width=\"' + tile + '\" height=\"' + tile + '\" rx=\"' + tile * 0.2227 + '\" fill-opacity=\"0.35\"/></svg>');
  const shadow = await sharp(shade).blur(Math.max(0.3, size * 0.012)).png().toBuffer();
  return sharp(shadow).composite([{ input: art, left: off, top: off }]).png().toBuffer();
}
await sharp(svg).resize(512, 512).png({ compressionLevel: 9 }).toFile('public/reelsmith-icon.png');
for (const s of [16, 32, 128, 256, 512]) {
  await sharp(await mac(s)).toFile(SET + '/icon_' + s + 'x' + s + '.png');
  await sharp(await mac(s * 2)).toFile(SET + '/icon_' + s + 'x' + s + '@2x.png');
}"
iconutil -c icns "$SET" -o assets/branding/reelsmith-icon.icns
cp assets/branding/reelsmith-icon.svg assets/favicon.svg
```

The README banner (`assets/branding/reelsmith-banner.svg`) embeds a copy of the icon's shapes at `translate(96 72) scale(0.25)`; paste the new icon body there too.

## README infographics

`assets/branding/director-mode.svg` and `architecture.svg` are the sources; the README shows the PNGs (rendered at 2x so text looks the same on every machine):

```bash
node -e "const sharp=require('sharp');(async()=>{for(const n of ['director-mode','architecture'])await sharp('assets/branding/'+n+'.svg',{density:144}).png({compressionLevel:9}).toFile('assets/branding/'+n+'.png')})()"
```
