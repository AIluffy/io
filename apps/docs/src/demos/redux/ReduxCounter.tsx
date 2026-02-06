import React, { useRef } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

type CounterState = {
  count: number;
};

const counterSlice = createSlice({
  name: 'counter',
  initialState: { count: 0 } satisfies CounterState,
  reducers: {
    add: (state, action: PayloadAction<number>) => {
      // reducer 只描述状态变更，不在这里做副作用。
      state.count += action.payload;
    },
  },
});

const createStore = () =>
  configureStore({
    reducer: counterSlice.reducer,
  });

type AppStore = ReturnType<typeof createStore>;
type RootState = ReturnType<AppStore['getState']>;
type AppDispatch = AppStore['dispatch'];

function CounterView() {
  const dispatch = useDispatch<AppDispatch>();
  const count = useSelector((s: RootState) => s.count);

  return (
    <button type="button" onClick={() => dispatch(counterSlice.actions.add(1))}>
      count: {count}
    </button>
  );
}

export default function ReduxCounter() {
  const storeRef = useRef<AppStore | null>(null);

  if (!storeRef.current) {
    // 为了保证 hydration 一致，使用 useRef 缓存 store 实例。
    storeRef.current = createStore();
  }

  return (
    <Provider store={storeRef.current}>
      <CounterView />
    </Provider>
  );
}
