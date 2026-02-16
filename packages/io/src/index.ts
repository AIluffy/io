export { io } from './lib/core/api/io.js';
export { derived } from './lib/core/api/derived.js';
export { batch } from './lib/utils/reactive/batch.js';
export { isServerEnv } from './lib/utils/env/env.js';
export { scheduleTask } from './lib/utils/reactive/schedule.js';
export { onError, onMutation } from './lib/utils/debug/debug.js';
export { relocate } from './lib/extensions/relocate.js';
export { link } from './lib/utils/internal/link.js';
export { getLinkInfo } from './lib/utils/internal/link-info.js';
export type { IoLinkInfo } from './lib/utils/internal/link-info.js';
export { createHistory } from './lib/utils/patches/history.js';
export type {
  IoArrayUnit,
  IoDerived,
  IoErrorHandler,
  IoErrorHandlerFor,
  IoHistory,
  IoHistoryOptions,
  IoMutationOp,
  IoNode,
  IoPatch,
  IoPathOf,
  IoPathValue,
  Path,
  IoResult,
  IoScope,
  IoTreeArrayUnit,
  IoTreeNode,
  IoTreeScope,
  IoUnit,
  IoUpdate,
  IoLink,
  Primitive,
  UnwrapIo,
} from './lib/utils/types/types.js';
export type { IoSchedule } from './lib/utils/reactive/schedule.js';
export {
  applyUpdate,
  mergeUpdates,
  replay,
  undoUpdate,
} from './lib/utils/patches/updates.js';
