# Reelsmith branding

| Asset | File | Notes |
|---|---|---|
| App icon (source) | `assets/branding/reelsmith-icon.svg` | 1024×1024. Ember 9:16 reel card with a play mark and two caption lines, a forge spark, on a deep ink tile |
| App icon (web, in-app `BrandMark`) | `public/reelsmith-icon.png` | 512×512, generated |
| App icon (macOS) | `assets/branding/reelsmith-icon.icns` | generated |
| Favicon | `assets/favicon.svg` | copy of the source SVG |
| Word mark | `ReelsmithWordmark` in `src/components/icons.tsx` | "reel" in the text colour, "smith" in the ember gradient |
| README banner | `assets/branding/reelsmith-banner.svg` | icon + word mark + tagline |

**Palette:** ink `#211638` → `#0d0918`; ember gradient `#ffb347` → `#ff6a3d` → `#f0306a`; spark `#fffbe8` / `#ffd27a`.

**Tagline:** "Story, footage and a song in. A finished Reel out."

UI text: English strings that name OpenChatCut are rewritten to "Reelsmith" by `src/i18n/dict/en/reelsmithBranding.ts` (merged last in the EN dictionary), so upstream dictionary files stay untouched. Protocol identifiers (`X-OpenChatCut-*` headers, the `openchatcut` MCP server name, `occ` CLI, internal function names) are kept so upstream merges and existing MCP configs keep working.

## Regenerate the icons after editing the SVG

```bash
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
SET=$(mktemp -d)/icon.iconset && mkdir -p "$SET"
node -e "
const sharp=require('sharp');const svg='assets/branding/reelsmith-icon.svg';
(async()=>{
  await sharp(svg).resize(512,512).png({compressionLevel:9}).toFile('public/reelsmith-icon.png');
  for (const s of [16,32,128,256,512]) {
    await sharp(svg).resize(s,s).png().toFile('$SET/icon_'+s+'x'+s+'.png');
    await sharp(svg).resize(s*2,s*2).png().toFile('$SET/icon_'+s+'x'+s+'@2x.png');
  }
})()"
iconutil -c icns "$SET" -o assets/branding/reelsmith-icon.icns
cp assets/branding/reelsmith-icon.svg assets/favicon.svg
```
