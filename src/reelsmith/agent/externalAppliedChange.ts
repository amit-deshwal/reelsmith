// RS-701: what ExternalBridgeRuntime.onApplied reports after an agent edit is committed, so the chat can offer "Revert this turn".
import type { Operation } from '../../agent/proposal';
import type { ProjectDoc } from '../../editor/types';

export interface ExternalAppliedChange {
  readonly summary: string;
  readonly operations: readonly Operation[];
  readonly previous: ProjectDoc;
  readonly result: ProjectDoc;
}
