import { useEffect, useRef } from '@lynx-js/react';
import { io } from '@iostore/store';
import { useIO } from '@iostore/lynx';

type Status = 'idle' | 'running' | 'done' | 'error';

const taskStore = io({
  status: 'idle' as Status,
  progress: 0,
  message: 'Ready to start.',
});

export function AsyncLongTaskTemplate() {
  const state = useIO(taskStore);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTask = () => {
    if (taskStore.status.get() === 'running') return;
    taskStore.status.set('running');
    taskStore.message.set('Processing batch 1 of 5...');

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      taskStore.progress.set((value) => {
        const next = Math.min(value + 8, 100);
        if (next >= 100) {
          taskStore.status.set('done');
          taskStore.message.set('All tasks complete.');
          if (timerRef.current) clearInterval(timerRef.current);
        } else if (next >= 60) {
          taskStore.message.set('Finalizing data merge...');
        } else if (next >= 30) {
          taskStore.message.set('Syncing upstream services...');
        }
        return next;
      });
    }, 320);
  };

  const resetTask = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    taskStore.status.set('idle');
    taskStore.progress.set(0);
    taskStore.message.set('Ready to start.');
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  return (
    <view className="card">
      <view className="row between">
        <view>
          <text className="eyebrow">Async</text>
          <text className="card-title">Long Task</text>
          <text className="card-desc">Run a background job with progress updates.</text>
        </view>
        <text className="badge">{state.status}</text>
      </view>

      <view className="mt16">
        <view className="progress-track">
          <view className="progress-fill" style={{ width: `${state.progress}%` }} />
        </view>
        <view className="row between mt12">
          <text className="subtle">{state.message}</text>
          <view className="row">
            <view className={state.status === 'running' ? 'button disabled' : 'button primary'} bindtap={startTask}>
              <text className="button-text">Start</text>
            </view>
            <view className="button ghost" bindtap={resetTask}>
              <text className="button-text ghost">Reset</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  );
}
