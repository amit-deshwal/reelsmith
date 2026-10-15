// Startup preflight for packaged installs.
//
// Every asset checked here is read during boot, before the first window exists:
// the embedded server serves resources/dist, ensureWritableBundle copies
// resources/remotion-bundle into userData, and on Windows ensureRemotionBinaries
// mirrors the static ffmpeg.exe next to the compositor
// (desktop/remotion-binaries.ts:94-96). If any of them is gone, boot() rejects
// and main.ts exits — a packaged double-click has no console, so the user sees
// nothing happen at all. That is issue #140: three separate ENOENT/ERR_MODULE
// failures, zero windows, zero dialogs.
//
// An install can lose files without any packaging bug: antivirus quarantines the
// bundled FFmpeg (the app is already reported as a false positive, issue #144),
// or a 650 MB NSIS extraction is interrupted. So name the missing files instead
// of dying silently, and keep the checks pure so they can be verified in Node.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RuntimeAssetCheck {
  /** Human-readable subject of the check, used in the failure dialog. */
  readonly label: string;
  readonly path: string;
  /** Required assets stop the launch; optional ones only degrade a feature. */
  readonly required: boolean;
}

export interface PackagedAssetInput {
  readonly resourcesPath: string;
  readonly platform: NodeJS.Platform;
  /** Resolved ffmpeg binary (server/media-binaries.ts ffmpegBin()). */
  readonly ffmpegPath: string;
}

export function packagedRuntimeAssetChecks(input: PackagedAssetInput): RuntimeAssetCheck[] {
  const checks: RuntimeAssetCheck[] = [
    { label: 'editor UI', path: join(input.resourcesPath, 'dist', 'index.html'), required: true },
    {
      label: 'Remotion render bundle',
      path: join(input.resourcesPath, 'remotion-bundle', 'index.html'),
      required: true,
    },
    {
      label: 'headless render browser',
      path: join(input.resourcesPath, 'chrome-headless-shell'),
      required: false,
    },
  ];
  // Only Windows swaps the compositor's ffmpeg for the static build at first
  // launch, so only there does a quarantined ffmpeg.exe block startup.
  if (input.platform === 'win32') {
    checks.push({ label: 'bundled FFmpeg', path: input.ffmpegPath, required: true });
  }
  return checks;
}

export function missingRuntimeAssets(
  checks: readonly RuntimeAssetCheck[],
  exists: (path: string) => boolean = existsSync,
): RuntimeAssetCheck[] {
  return checks.filter((check) => !exists(check.path));
}

/** Shared by the asset preflight and the entry bundle's load failure. */
export const RUNTIME_ASSET_ADVICE = [
  'Most often antivirus software quarantined part of the install, or the',
  'installer did not finish. Reinstall Reelsmith, and add the installation',
  'directory to your antivirus exclusions if the files disappear again.',
].join('\n');

export function describeMissingRuntimeAssets(missing: readonly RuntimeAssetCheck[]): string {
  const lines = missing.map((check) => `- ${check.label}${check.required ? '' : ' (optional)'}\n  ${check.path}`);
  return [
    `This install is missing ${missing.length} bundled file(s):`,
    '',
    ...lines,
    '',
    RUNTIME_ASSET_ADVICE,
  ].join('\n');
}

/** The blocking failure text, or null when nothing required is missing. */
export function runtimeAssetFailure(missing: readonly RuntimeAssetCheck[]): string | null {
  return missing.some((check) => check.required) ? describeMissingRuntimeAssets(missing) : null;
}
