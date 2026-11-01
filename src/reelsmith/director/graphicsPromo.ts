// RS-1239: graphics for promo reels (a club, a shop, a page): an end card with the name, one action and the link line,
// and a small handle tag that stays in a corner. Seen in Kino's 2026-11-01 run on the user's trek footage ("this looks so
// basic... add real hooks for instagram"): what made its second pass read as an Instagram reel was the hook and the end
// card asking for one thing. Both stay inside Instagram's safe area (graphicsKit.ts has the props every graphic gets).
import { graphicComponent } from './graphicsKit';

/** The fixed engagement lines an end card may carry (never invented copy: these are the platform's own asks). */
export const CTA_ASKS: Record<string, string> = {
  none: '',
  save: 'SAVE THIS FOR LATER',
  share: 'SEND THIS TO A FRIEND',
  follow: 'FOLLOW FOR MORE',
  'save-share': 'SAVE THIS · SEND IT TO A FRIEND',
  'save-tag': 'SAVE THIS + TAG A FRIEND',
};

export const CTA_CARD_CODE = graphicComponent('CtaCard', String.raw`
  const ASKS = ${JSON.stringify(CTA_ASKS)};
  const name = items[0] || '';
  const action = items[1] || '';
  const sub = items[2] || '';
  const ask = ASKS[P.ask] || '';
  // the button's words read on any brand colour: dark text on a light button, white on a dark one
  const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return 0.6; const n = parseInt(m[1], 16); const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => { v /= 255; return v <= 0.04 ? v / 12.9 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const onAccent = lum(accent) > 0.3 ? '#111' : '#fff';
  const solid = P.solid === true;
  const bg = P.background || '#0f2a1d';
  // 9:16 keeps out of the top bar and the caption/buttons strip (bottom ~22%, right ~14%)
  const cx = tall ? W * 0.46 : W * 0.5;
  const top = H * (P.y != null && P.y >= 0 ? P.y : tall ? 0.3 : 0.24);
  const fsName = S * (tall ? (name.length > 14 ? 0.1 : 0.13) : 0.09);
  const fs = S * (tall ? 0.044 : 0.032);
  const nameIn = backOut(t / 0.45);
  const actIn = backOut((t - 0.35) / 0.4);
  const subIn = smooth((t - 0.7) / 0.3);
  const askIn = smooth((t - 1.0) / 0.3);
  // the button breathes on the beat once it has landed
  const beatPhase = beatList ? (() => { let k = 0; while (k + 1 < beatList.length && beatList[k + 1] <= t) k += 1; return clamp((t - beatList[k]) / 0.25, 0, 1); })() : (t % 0.5) / 0.5;
  const pulse = t > 0.8 ? 1 + 0.05 * (1 - outCubic(beatPhase)) : 1;
  const backdrop = solid
    ? h(AbsoluteFill, { style: { background: 'radial-gradient(circle at 50% 40%, ' + bg + ' 0%, ' + bg + ' 55%, rgba(0,0,0,0.9) 140%)', opacity: smooth(t / 0.25) } })
    : h(AbsoluteFill, { style: { background: 'rgba(0,0,0,' + (0.55 * smooth(t / 0.3)).toFixed(3) + ')' } });
  const col = box({ left: cx - W * 0.42, width: W * 0.84, top, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }, [
    P.kicker ? h('div', { key: 'kk', style: { marginBottom: fs * 0.5, fontFamily: 'Inter', fontWeight: 700, fontSize: fs * 0.72, color, opacity: 0.95 * smooth(t / 0.25), textShadow: solid ? 'none' : shadow } }, P.kicker) : null,
    name ? h('div', { key: 'n', style: { fontFamily: 'Anton', fontWeight: 400, fontSize: fsName, lineHeight: 1, letterSpacing: fsName * 0.02, color, textTransform: 'uppercase', textShadow: solid ? 'none' : shadow,
      transform: 'translateY(' + ((1 - nameIn) * fsName * 0.6).toFixed(1) + 'px) scale(' + (0.85 + 0.15 * nameIn).toFixed(3) + ')', opacity: smooth(t / 0.2) } }, name) : null,
    P.tagline ? h('div', { key: 'tg', style: { marginTop: fs * 0.45, fontFamily: 'Inter', fontWeight: 800, fontSize: fs * 0.6, letterSpacing: fs * 0.08, color: lum(accent) > 0.3 ? accent : color, textTransform: 'uppercase', opacity: smooth((t - 0.25) / 0.25) } }, P.tagline) : null,
    action ? h('div', { key: 'a', style: { marginTop: fs * 1.1, padding: (fs * 0.55).toFixed(1) + 'px ' + (fs * 1.2).toFixed(1) + 'px', borderRadius: fs * 2, background: accent, color: onAccent, border: lum(accent) < 0.08 && !solid ? '2px solid rgba(255,255,255,0.85)' : 'none', fontFamily: 'Inter', fontWeight: 900, fontSize: fs * 1.05,
      boxShadow: '0 ' + (fs * 0.25).toFixed(1) + 'px ' + (fs * 0.9).toFixed(1) + 'px rgba(0,0,0,0.4)', transform: 'scale(' + (Math.max(0, actIn) * pulse).toFixed(3) + ')', opacity: smooth((t - 0.35) / 0.12) } }, action) : null,
    sub ? h('div', { key: 's', style: { marginTop: fs * 0.9, fontFamily: 'Inter', fontWeight: 700, fontSize: fs * 0.8, letterSpacing: fs * 0.04, color, opacity: 0.92 * subIn, textShadow: solid ? 'none' : shadow,
      transform: 'translateY(' + ((1 - subIn) * fs * 0.5).toFixed(1) + 'px)' } }, sub) : null,
    ask ? h('div', { key: 'k', style: { marginTop: fs * 1.6, padding: (fs * 0.3).toFixed(1) + 'px ' + (fs * 0.6).toFixed(1) + 'px', borderRadius: fs * 0.25, background: color, color: solid ? bg : '#111', fontFamily: 'Inter', fontWeight: 900, fontSize: fs * 0.62,
      letterSpacing: fs * 0.08, opacity: askIn, transform: 'translateY(' + ((1 - askIn) * fs * 0.5).toFixed(1) + 'px)' } }, ask) : null,
  ]);
  return h(AbsoluteFill, { style: { opacity: leave } }, backdrop, col);`);

export const HANDLE_TAG_CODE = graphicComponent('HandleTag', String.raw`
  const label = items[0] || '';
  const fs = S * (tall ? 0.03 : 0.024);
  // top-left, under Instagram's top bar on 9:16
  const x = W * (P.x != null && P.x >= 0 ? P.x : 0.05);
  const y = H * (P.y != null && P.y >= 0 ? P.y : tall ? 0.1 : 0.06);
  const inQ = outCubic(t / 0.4);
  const dot = P.dot !== false;
  return h(AbsoluteFill, { style: { opacity: leave * smooth(t / 0.25) } },
    box({ left: x, top: y, display: 'flex', alignItems: 'center', padding: (fs * 0.35).toFixed(1) + 'px ' + (fs * 0.7).toFixed(1) + 'px', borderRadius: fs, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)',
      transform: 'translateX(' + ((1 - inQ) * -fs * 2).toFixed(1) + 'px)' }, [
      dot ? h('div', { key: 'd', style: { width: fs * 0.45, height: fs * 0.45, borderRadius: '50%', background: accent, marginRight: fs * 0.45 } }) : null,
      h('div', { key: 'l', style: { fontFamily: 'Inter', fontWeight: 800, fontSize: fs, letterSpacing: fs * 0.06, color, textTransform: P.upper === false ? 'none' : 'uppercase' } }, label),
    ]));`);
