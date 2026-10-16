// RS-406: cells of the chosen layout drawn over the preview; drop a media asset on a cell to fill it.
import { useState } from 'react';
import { fillSlots, type FillLayoutId } from '../layoutFill';
import { hasCompatibleMediaDrag, parseMediaAssetDrag } from '../../media/drag';
import type { SlotRect } from '../../editor/layouts';

export function LayoutFillOverlay({ layout, onDropAsset }: { layout: FillLayoutId; onDropAsset: (assetId: string, slot: SlotRect) => void }) {
  const [over, setOver] = useState<number | null>(null);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {fillSlots(layout).map((s, i) => (
        <div key={i} data-testid={`fill-cell-${i}`}
          style={{
            position: 'absolute', left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%`,
            boxSizing: 'border-box', border: '1px dashed rgba(255,255,255,0.85)', pointerEvents: 'auto',
            background: over === i ? 'rgba(80,160,255,0.35)' : 'rgba(0,0,0,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12,
          }}
          onDragOver={(e) => { if (!hasCompatibleMediaDrag(e, 'video')) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; setOver(i); }}
          onDragLeave={() => setOver((v) => (v === i ? null : v))}
          onDrop={(e) => {
            setOver(null);
            const id = parseMediaAssetDrag(e);
            if (!id) return;
            e.preventDefault(); e.stopPropagation();
            onDropAsset(id, s);
          }}>
          <span style={{ background: 'rgba(0,0,0,0.5)', borderRadius: 3, padding: '1px 5px' }}>{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
