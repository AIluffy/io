import { useEffect, useRef } from '@lynx-js/react';
import { io } from '@iostore/store';
import { useIO } from '@iostore/lynx';

import type { LynxInputEvent } from '../../types/lynx-events';

type Status = 'idle' | 'loading' | 'success' | 'error';
type Detail = { id: string; name: string; role: string; location: string };

const detailPool: Detail[] = [
  { id: '100', name: 'Avery Chen', role: 'Product Designer', location: 'Remote' },
  { id: '101', name: 'Maya Patel', role: 'Frontend Engineer', location: 'New York' },
  { id: '102', name: 'Luis Ramirez', role: 'QA Lead', location: 'Mexico City' },
];

const detailStore = io({
  status: 'idle' as Status,
  error: '',
  query: '100',
  detail: null as Detail | null,
});

export function AsyncDetailTemplate() {
  const state = useIO(detailStore);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  const fetchDetail = () => {
    requestRef.current += 1;
    const current = requestRef.current;
    detailStore.status.set('loading');
    detailStore.error.set('');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (current !== requestRef.current) return;
      const query = detailStore.query.get().trim();
      if (!query) {
        detailStore.status.set('error');
        detailStore.error.set('Please provide a profile ID.');
        return;
      }
      if (query.endsWith('0')) {
        detailStore.status.set('error');
        detailStore.error.set('Profile not found. Try another ID.');
        return;
      }

      const match = detailPool.find((item) => item.id === query) ?? detailPool[0];
      detailStore.detail.set({ ...match, id: query });
      detailStore.status.set('success');
    }, 600 + Math.random() * 900);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <view className="card">
      <view className="row between">
        <view>
          <text className="eyebrow">Async</text>
          <text className="card-title">Async Detail</text>
          <text className="card-desc">Fetch a profile by ID.</text>
        </view>
        <text className="badge">{state.status}</text>
      </view>

      <view className="row mt16">
        <input
          className="input"
          value={state.query}
          placeholder="Profile ID"
          bindinput={(event: LynxInputEvent) => detailStore.query.set(event.detail.value)}
        />
        <view
          className={state.status === 'loading' ? 'button disabled' : 'button primary'}
          bindtap={fetchDetail}
        >
          <text className="button-text">Fetch detail</text>
        </view>
      </view>

      <view className="mt16">
        {state.status === 'loading' ? (
          <view className="empty">
            <text className="empty-text">Loading profile...</text>
          </view>
        ) : null}

        {state.status === 'error' ? (
          <view className="error-box">
            <text className="error-text">{state.error}</text>
          </view>
        ) : null}

        {state.status !== 'loading' && state.status !== 'error' && !state.detail ? (
          <view className="empty">
            <text className="empty-text">Enter an ID to fetch a profile.</text>
          </view>
        ) : null}

        {state.detail && state.status !== 'loading' && state.status !== 'error' ? (
          <view className="detail-box">
            <view className="row between">
              <view>
                <text className="subtle">Profile</text>
                <text className="todo-text">{state.detail.name}</text>
              </view>
              <text className="badge">{state.detail.id}</text>
            </view>
            <view className="mt12">
              <text className="subtle">Role: {state.detail.role}</text>
              <text className="subtle">Location: {state.detail.location}</text>
            </view>
          </view>
        ) : null}
      </view>
    </view>
  );
}
