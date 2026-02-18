export { createHistory } from './lib/utils/patches/history.js';
export type {
  IoHistory,
  IoHistoryOptions,
  IoMutationOp,
  IoPatch,
  IoUpdate,
} from './lib/utils/types/types.js';
export {
  applyUpdate,
  mergeUpdates,
  replay,
  undoUpdate,
} from './lib/utils/patches/updates.js';
