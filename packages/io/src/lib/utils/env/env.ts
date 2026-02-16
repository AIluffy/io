import { ioGlobal } from './global.js';

export const isServerEnv = !ioGlobal?.window && !ioGlobal?.document;
