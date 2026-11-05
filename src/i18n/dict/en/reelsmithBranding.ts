// Reelsmith branding for the EN dictionary: every upstream English string that names
// "OpenChatCut" is shown as "Reelsmith". Derived, so new upstream strings are covered
// without editing the upstream field files. Merged last in ./index.ts.
export function rebrandEntries(dict: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(dict)) {
    if (value.includes('OpenChatCut')) out[key] = value.replaceAll('OpenChatCut', 'Reelsmith');
  }
  return out;
}
