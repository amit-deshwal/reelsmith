// RS-302 V8 glue: render sample frames of the timeline with the editor's still renderer and compare them with the
// exported file. Failure to run the sample is reported as a WARN, never as a failed export.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// @ts-expect-error — plain .mjs render pipeline has no .d.ts
import { renderTimelineStills } from '../../remotion/render.mjs';
import { ffprobeBin } from '../media-binaries.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import type { Check } from './exportValidate.ts';
import { checkParity, sampleFrames } from './parityCheck.ts';

const run = promisify(execFile);

export async function exportParity(file: string, state: { fps: number } & Record<string, unknown>): Promise<Check> {
  try {
    const { stdout } = await run(ffprobeBin(), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', file]);
    const fps = state.fps;
    const total = Math.round(Number(stdout.trim()) * fps);
    const frames = sampleFrames(total);
    if (!frames.length) return { id: 'V8', status: 'WARN', detail: 'exported file has no video frames' };
    const submission = await acceptExportSubmission({ state: state as never, format: 'video', codec: 'h264' } as never);
    try {
      const stills = await renderTimelineStills({
        state: submission.plan.state, project: submission.plan.project, timelineId: submission.plan.timelineId, frames,
      }) as Array<{ frame: number; base64: string }>;
      return await checkParity({ file, fps, frames, stills });
    } finally {
      await submission.cleanup();
    }
  } catch (error) {
    return { id: 'V8', status: 'WARN', detail: `parity sample skipped: ${error instanceof Error ? error.message : String(error)}` };
  }
}
