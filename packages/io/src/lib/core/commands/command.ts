import type { IoMutationOp, IoPatch } from '../../utils/types.js';

/** 所有树变异操作的统一契约 */
export interface TreeCommand<TState> {
  readonly op: IoMutationOp;
  execute(state: TState): IoPatch[];
  validate?(state: TState): void;
}

/** validate 阶段表示"无需执行"的控制流异常 */
export class SkipExecution extends Error {
  readonly skip = true as const;

  constructor() {
    super('skip');
  }
}
