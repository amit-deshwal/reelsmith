// RS-703: first-use notice in the chat panel, and the per-project frames switch (always visible, compact).
import { useState, useSyncExternalStore } from 'react';
import { theme } from '../../theme';
import {
  framesAllowed, markPrivacyNoticeSeen, PRIVACY_NOT_SENT, PRIVACY_NOTICE_LINES, privacyNoticeSeen, setFramesAllowed, subscribePrivacy,
} from '../framePrivacy';

export function AgentPrivacyNotice({ projectId }: { projectId: string }) {
  const seen = useSyncExternalStore(subscribePrivacy, privacyNoticeSeen, privacyNoticeSeen);
  const allowed = useSyncExternalStore(subscribePrivacy, () => framesAllowed(projectId), () => true);
  const [open, setOpen] = useState(false);
  const box: React.CSSProperties = { margin: '8px 12px 0', padding: '8px 10px', borderRadius: 8, border: `0.5px solid ${theme.border}`, background: theme.panelAlt, fontSize: 12, color: theme.text };
  const toggle = (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: theme.textDim, cursor: 'pointer' }}>
      <input type="checkbox" checked={allowed} onChange={(e) => setFramesAllowed(projectId, e.target.checked)} />
      Allow frames to be sent to my agent (this project)
    </label>
  );
  if (seen && !open) {
    return (
      <div style={{ margin: '6px 12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {toggle}
        <button type="button" onClick={() => setOpen(true)} style={{ fontSize: 11, color: theme.textDim, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>What is sent?</button>
      </div>
    );
  }
  return (
    <div style={box} role="note">
      <b>What your agent sees</b>
      <div style={{ color: theme.textDim, margin: '4px 0' }}>Chat runs through your own Claude subscription (the claude CLI). Each turn sends Anthropic:</div>
      <ul style={{ margin: '0 0 6px', paddingLeft: 18, display: 'grid', gap: 2 }}>
        {PRIVACY_NOTICE_LINES.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <div style={{ color: theme.textDim, marginBottom: 6 }}>{PRIVACY_NOT_SENT}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {toggle}
        <button type="button" onClick={() => { markPrivacyNoticeSeen(); setOpen(false); }}
          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', background: theme.accent, color: theme.onAccent, cursor: 'pointer' }}>Got it</button>
      </div>
    </div>
  );
}
