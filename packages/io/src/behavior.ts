export { withBehaviors } from './lib/extensions/with-behaviors.js';
export { schedule } from './lib/extensions/behaviors/schedule.js';
export { throttle } from './lib/extensions/behaviors/throttle.js';
export { debounce } from './lib/extensions/behaviors/debounce.js';
export { effect } from './lib/extensions/behaviors/effect.js';
export { persist } from './lib/extensions/behaviors/persist.js';
export { devtools } from './lib/extensions/behaviors/devtools.js';
export type {
  IoBehavior,
  IoView,
} from './lib/extensions/types.js';
export type { ThrottleBehaviorOptions } from './lib/extensions/behaviors/throttle.js';
export type { DebounceBehaviorOptions } from './lib/extensions/behaviors/debounce.js';
export type { EffectBehaviorOptions } from './lib/extensions/behaviors/effect.js';
