import type { IoMutationOp, IoPatch } from '../../utils/types/types.js';

/** 所有树变异操作的统一契约 */
export interface TreeCommand<TState> {
  readonly op: IoMutationOp;
  execute(state: TState): IoPatch[] | null;
  validate?(state: TState): boolean;
}
