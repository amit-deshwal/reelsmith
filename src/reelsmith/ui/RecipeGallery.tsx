import { useMemo, useState } from 'react';
import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { RatioId } from '../../../shared/reelsmith/ratios';
import { theme } from '../../theme';
import { buildGallery, categoryLabel, previewUrl, type RecipeCard } from '../galleryModel';

const card: React.CSSProperties = {
  border: `0.5px solid ${theme.border}`, borderRadius: 8, background: theme.panelAlt, cursor: 'pointer',
  textAlign: 'left', color: theme.text, display: 'grid',
};
const label: React.CSSProperties = { fontSize: 11.5, color: theme.textDim };

export function RecipeGallery({ recipes, onSelect, disabled = false, aiMadeIds = new Set<string>() }: {
  recipes: Recipe[]; onSelect: (recipe: Recipe, ratio?: RatioId) => void; disabled?: boolean; aiMadeIds?: ReadonlySet<string>;
}) {
  const [category, setCategory] = useState<Recipe['category'] | 'all'>('all');
  const [ratio, setRatio] = useState<RatioId | 'all'>('all');
  const gallery = useMemo(() => buildGallery(recipes, { category, ratio }), [recipes, category, ratio]);
  return <div style={{ display: 'grid', gap: 12 }}>
    <div role="group" aria-label="Recipe categories" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {gallery.categories.map((c) => <button key={c.id} type="button" aria-pressed={category === c.id}
        onClick={() => setCategory(c.id)} style={{ padding: '6px 10px', borderRadius: 6, border: `0.5px solid ${theme.border}`,
          cursor: 'pointer', background: category === c.id ? theme.accent : theme.inset,
          color: category === c.id ? theme.onAccent : theme.text }}>{c.label} ({c.count})</button>)}
    </div>
    <div role="group" aria-label="Recipe aspect ratios" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {gallery.ratios.filter((r) => r.id === 'all' || r.count > 0).map((r) => <button key={r.id} type="button" aria-pressed={ratio === r.id}
        onClick={() => setRatio(r.id)} style={{ padding: '5px 9px', borderRadius: 6, border: `0.5px solid ${theme.border}`,
          cursor: 'pointer', background: ratio === r.id ? theme.accent : theme.inset,
          color: ratio === r.id ? theme.onAccent : theme.text }}>{r.id === 'all' ? 'All ratios' : r.id} ({r.count})</button>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
      {gallery.cards.map((c) => <RecipeCardView key={c.id} card={c} disabled={disabled} aiMade={aiMadeIds.has(c.id)}
        onOpen={() => onSelect(recipes.find((r) => r.id === c.id)!, ratio === 'all' ? undefined : ratio)} />)}
    </div>
  </div>;
}

/** Poster with a muted loop that plays while hovered (RS-102). */
export function RecipeCardView({ card: c, onOpen, disabled, aiMade = false }: { card: RecipeCard; onOpen: () => void; disabled?: boolean; aiMade?: boolean }) {
  const [hover, setHover] = useState(false);
  const poster = previewUrl(c.poster);
  const loop = previewUrl(c.loop);
  return (
    <button type="button" disabled={disabled} style={{ ...card, padding: 0, overflow: 'hidden', gap: 0 }} onClick={onOpen}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <div style={{ position: 'relative', aspectRatio: '9 / 16', background: theme.inset, width: '100%' }}>
        {poster && <img src={poster} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        {hover && loop && <video src={loop} muted autoPlay loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <span style={{ position: 'absolute', left: 6, top: 6, fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.55)', color: '#fff' }}>{categoryLabel(c.category)}</span>
        {aiMade && <span style={{ position: 'absolute', right: 6, top: 6, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: theme.accent, color: theme.onAccent }}>AI-made</span>}
      </div>
      <div style={{ display: 'grid', gap: 3, padding: '8px 9px 10px' }}>
        <b style={{ fontSize: 13 }}>{c.name}</b>
        <span style={label}>{c.ratios.join(' · ') || c.aspect}{c.typicalLength ? ` · ${c.typicalLength}` : ''}</span>
        <span style={{ ...label, color: theme.gold }}>Needs {c.requires}</span>
      </div>
    </button>
  );
}

