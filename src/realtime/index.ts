/**
 * WorkerScript Real-time Features
 * 
 * Phase 1: Keyboard Input (MVP)
 * - K=$ system variable for non-blocking key input
 * - Raw mode terminal control
 * - Safe exit handling
 */

export { KeyboardInput, getGlobalKeyboardInput, resetGlobalKeyboardInput } from './KeyboardInput';
export { RealTimeCLIRunner, type RealTimeCLIRunnerConfig } from './RealTimeCLIRunner';
export { GridDiffRenderer, type GridChange } from './GridDiffRenderer';
export { SplitScreenRenderer } from './SplitScreenRenderer';
export type { KeyboardInputOptions } from './KeyboardInput';

// Phase 2以降で追加予定:
// export { GridDiffRenderer } from './GridDiffRenderer';
// export { RealTimeRunner } from './RealTimeRunner';
