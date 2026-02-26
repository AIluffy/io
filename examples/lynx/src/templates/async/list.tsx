import { useEffect, useRef } from '@lynx-js/react';
import { io } from '@iostore/store';
import { useIO } from '@iostore/lynx';

type Status = 'idle' | 'loading' | 'success' | 'error';
type ItemStatus = 'open' | 'in_progress' | 'done';
type Item = { id: string; title: string; status: ItemStatus };

const baseItems: Item[] = [
  { id: 'a1', title: 'Prepare launch checklist', status: 'open' },
  { id: 'b2', title: 'Sync with design team', status: 'in_progress' },
  { id: 'c3', title: 'Publish release notes', status: 'done' },
];

const listStore = io({
  status: 'idle' as Status,
  error: '',
  items: [] as Item[],
  lastUpdated: '',
});

export function AsyncListTemplate() {
  const state = useIO(listStore);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  const load = () => {
    requestRef.current += 1;
    const current = requestRef.current;
    listStore.status.set('loading');
    listStore.error.set('');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (current !== requestRef.current) return;
      if (Math.random() < 0.2) {
        listStore.status.set('error');
        listStore.error.set('Network error: try again in a moment.');
        return;
      }

      const now = new Date();
      const nextItems: Item[] = baseItems.map((item) => ({
        ...item,
        status:
          Math.random() < 0.4 ? 'open' : Math.random() < 0.7 ? 'in_progress' : 'done',
      }));
      listStore.items.commit((draft) => {
        draft.length = 0;
        draft.push(...nextItems);
      });
      listStore.lastUpdated.set(now.toLocaleTimeString());
      listStore.status.set('success');
    }, 700 + Math.random() * 800);
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
          <text className="card-title">Async List</text>
          <text className="card-desc">Fetch remote items with status tracking.</text>
        </view>
        <view className="row">
          <text className="badge">{state.status}</text>
          <view className={state.status === 'loading' ? 'button disabled' : 'button primary'} bindtap={load}>
            <text className="button-text">Reload</text>
          </view>
        </view>
      </view>

      <view className="list mt16">
        {state.status === 'loading' ? (
          <view className="empty">
            <text className="empty-text">Loading items...</text>
          </view>
        ) : null}

        {state.status === 'error' ? (
          <view className="error-box">
            <text className="error-text">{state.error}</text>
          </view>
        ) : null}

        {state.status !== 'loading' && state.status !== 'error' && state.items.length === 0 ? (
          <view className="empty">
            <text className="empty-text">No items yet. Tap reload to fetch.</text>
          </view>
        ) : null}

        {state.items.length > 0 && state.status !== 'loading' && state.status !== 'error' ? (
          <view className="list">
            {state.items.map((item) => (
              <view key={item.id} className="todo-item">
                <view>
                  <text className="todo-text">{item.title}</text>
                  <text className="subtle">ID: {item.id}</text>
                </view>
                <text className="chip-text">{item.status.replace('_', ' ')}</text>
              </view>
            ))}
            {state.lastUpdated ? <text className="subtle">Last updated {state.lastUpdated}</text> : null}
          </view>
        ) : null}
      </view>
    </view>
  );
}
