import type { FormEvent } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@iostore/react';
import { createQueryClient } from '@iostore/store/query';

type AsyncTodoLocale = 'zh-CN' | 'en';
type FailureKind = 'query' | 'mutation';
type FailureMode = 'none' | 'query' | 'mutation' | 'all';

type DemoTodo = {
  id: string;
  title: string;
  done: boolean;
};

type ToggleInput = {
  id: string;
  done: boolean;
};

type FailureModeOption = {
  value: FailureMode;
  label: string;
};

type CopyText = {
  kicker: string;
  hint: string;
  teachingLabel: string;
  failureModeLabel: string;
  retryCountLabel: string;
  guideLabel: string;
  guideButton: string;
  guideRunningValue: string;
  guideIdleValue: string;
  guideDoneValue: string;
  guideStepsLabel: string;
  guideSteps: readonly [string, string, string];
  failNextQueryButton: string;
  failNextMutationButton: string;
  queuedFailuresLabel: string;
  queuedQueryLabel: string;
  queuedMutationLabel: string;
  failureModeOptions: readonly FailureModeOption[];
  querySimulatedError: string;
  mutationSimulatedError: string;
  placeholder: string;
  addButton: string;
  refreshButton: string;
  cancelButton: string;
  remainingLabel: string;
  fetchLabel: string;
  mutationLabel: string;
  fetchingValue: string;
  pendingValue: string;
  idleValue: string;
  loadingText: string;
  emptyText: string;
  retryButton: string;
  removeButton: string;
  errorPrefix: string;
  tip: string;
  seedTitles: readonly [string, string];
};

const COPY: Record<AsyncTodoLocale, CopyText> = {
  'zh-CN': {
    kicker: '异步 TodoList',
    hint: '模拟真实请求延迟，包含 useQuery、useMutation、invalidateQueries、取消与失败重试。',
    teachingLabel: '教学模式',
    failureModeLabel: '失败模式',
    retryCountLabel: '查询重试次数',
    guideLabel: '演练状态',
    guideButton: '一键演练失败与恢复',
    guideRunningValue: '演练中',
    guideIdleValue: '空闲',
    guideDoneValue: '完成',
    guideStepsLabel: '步骤提示',
    guideSteps: ['触发一次查询失败', '切回正常并设置重试', '自动重试并恢复'],
    failNextQueryButton: '下一次查询失败',
    failNextMutationButton: '下一次提交失败',
    queuedFailuresLabel: '待注入失败',
    queuedQueryLabel: '查询',
    queuedMutationLabel: '提交',
    failureModeOptions: [
      { value: 'none', label: '关闭' },
      { value: 'query', label: '仅查询失败' },
      { value: 'mutation', label: '仅提交失败' },
      { value: 'all', label: '全部失败' },
    ],
    querySimulatedError: '模拟查询失败（list）',
    mutationSimulatedError: '模拟提交失败（mutation）',
    placeholder: '输入任务名称后回车',
    addButton: '添加',
    refreshButton: '刷新',
    cancelButton: '取消进行中的请求',
    remainingLabel: '剩余',
    fetchLabel: '查询状态',
    mutationLabel: '提交状态',
    fetchingValue: '请求中',
    pendingValue: '提交中',
    idleValue: '空闲',
    loadingText: '加载任务中...',
    emptyText: '当前没有任务，先添加一条。',
    retryButton: '重试',
    removeButton: '删除',
    errorPrefix: '请求失败：',
    tip: '建议操作：切到“仅查询失败”，重试次数改为 0/2 对比观察差异。',
    seedTitles: ['梳理异步状态', '补齐失败重试'],
  },
  en: {
    kicker: 'Async TodoList',
    hint: 'Simulates real request latency with useQuery, useMutation, invalidateQueries, cancellation, and retries.',
    teachingLabel: 'Teaching mode',
    failureModeLabel: 'Failure mode',
    retryCountLabel: 'Query retry count',
    guideLabel: 'Guide',
    guideButton: 'Run failure-recovery tour',
    guideRunningValue: 'running',
    guideIdleValue: 'idle',
    guideDoneValue: 'done',
    guideStepsLabel: 'Steps',
    guideSteps: [
      'Trigger one query failure',
      'Switch back and enable retry',
      'Retry and recover',
    ],
    failNextQueryButton: 'Fail next query',
    failNextMutationButton: 'Fail next mutation',
    queuedFailuresLabel: 'Queued failures',
    queuedQueryLabel: 'query',
    queuedMutationLabel: 'mutation',
    failureModeOptions: [
      { value: 'none', label: 'off' },
      { value: 'query', label: 'query only' },
      { value: 'mutation', label: 'mutation only' },
      { value: 'all', label: 'all' },
    ],
    querySimulatedError: 'Simulated query failure (list)',
    mutationSimulatedError: 'Simulated mutation failure',
    placeholder: 'Type a task and press Enter',
    addButton: 'Add',
    refreshButton: 'Refresh',
    cancelButton: 'Cancel in-flight request',
    remainingLabel: 'Remaining',
    fetchLabel: 'Query',
    mutationLabel: 'Mutation',
    fetchingValue: 'fetching',
    pendingValue: 'pending',
    idleValue: 'idle',
    loadingText: 'Loading todos...',
    emptyText: 'No tasks yet. Add the first one.',
    retryButton: 'Retry',
    removeButton: 'Remove',
    errorPrefix: 'Request failed: ',
    tip: 'Try this: set "query only", then compare behavior with retry count 0 vs 2.',
    seedTitles: ['Map async states', 'Add failure retry'],
  },
};

const TODOS_KEY = ['docs', 'async-query', 'todo-live-code'] as const;
const LATENCY_MIN_MS = 350;
const LATENCY_MAX_MS = 1100;

function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function randomLatency(): number {
  return (
    LATENCY_MIN_MS +
    Math.floor(Math.random() * (LATENCY_MAX_MS - LATENCY_MIN_MS + 1))
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(createAbortError());
    };

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        cleanup();
        reject(createAbortError());
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function cloneTodos(todos: readonly DemoTodo[]): DemoTodo[] {
  return todos.map((todo) => ({ ...todo }));
}

type AsyncTodoApi = {
  list(signal: AbortSignal): Promise<DemoTodo[]>;
  add(title: string): Promise<DemoTodo>;
  toggle(input: ToggleInput): Promise<DemoTodo>;
  remove(id: string): Promise<void>;
};

function createAsyncTodoApi(
  seedTitles: readonly [string, string],
  shouldFail: (kind: FailureKind) => boolean,
  simulatedErrors: {
    query: string;
    mutation: string;
  },
): AsyncTodoApi {
  const initialTodos: DemoTodo[] = [
    { id: '1', title: seedTitles[0], done: false },
    { id: '2', title: seedTitles[1], done: true },
  ];

  let todos = cloneTodos(initialTodos);
  let nextId = 3;

  return {
    async list(signal) {
      await sleep(randomLatency(), signal);
      if (shouldFail('query')) {
        throw new Error(simulatedErrors.query);
      }
      return cloneTodos(todos);
    },
    async add(title) {
      await sleep(randomLatency());
      if (shouldFail('mutation')) {
        throw new Error(simulatedErrors.mutation);
      }
      const next: DemoTodo = { id: String(nextId), title, done: false };
      nextId += 1;
      todos = [next, ...todos];
      return { ...next };
    },
    async toggle(input) {
      await sleep(randomLatency());
      if (shouldFail('mutation')) {
        throw new Error(simulatedErrors.mutation);
      }
      todos = todos.map((todo) => {
        if (todo.id !== input.id) {
          return todo;
        }
        return { ...todo, done: input.done };
      });
      const updated = todos.find((todo) => todo.id === input.id);
      if (!updated) {
        throw new Error(`Todo ${input.id} not found`);
      }
      return { ...updated };
    },
    async remove(id) {
      await sleep(randomLatency());
      if (shouldFail('mutation')) {
        throw new Error(simulatedErrors.mutation);
      }
      todos = todos.filter((todo) => todo.id !== id);
    },
  };
}

function resolveErrorMessage(errors: readonly unknown[]): string | null {
  for (const error of errors) {
    if (error instanceof Error && error.message) {
      return error.message;
    }
  }
  return null;
}

export function AsyncTodoLiveCode({
  locale = 'zh-CN',
}: {
  locale?: AsyncTodoLocale;
}) {
  const copy = COPY[locale];
  const [draft, setDraft] = useState('');
  const [failureMode, setFailureMode] = useState<FailureMode>('none');
  const [queryRetryCount, setQueryRetryCount] = useState(1);
  const [queuedQueryFailures, setQueuedQueryFailures] = useState(0);
  const [queuedMutationFailures, setQueuedMutationFailures] = useState(0);
  const [isGuideRunning, setIsGuideRunning] = useState(false);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const failureModeRef = useRef<FailureMode>(failureMode);
  const queuedQueryFailuresRef = useRef(0);
  const queuedMutationFailuresRef = useRef(0);

  const client = useMemo(
    () =>
      createQueryClient({
        defaultStaleTime: 2_000,
        defaultRetry: 1,
      }),
    [],
  );

  const shouldFail = useCallback((kind: FailureKind): boolean => {
    if (kind === 'query' && queuedQueryFailuresRef.current > 0) {
      queuedQueryFailuresRef.current -= 1;
      setQueuedQueryFailures(queuedQueryFailuresRef.current);
      return true;
    }
    if (kind === 'mutation' && queuedMutationFailuresRef.current > 0) {
      queuedMutationFailuresRef.current -= 1;
      setQueuedMutationFailures(queuedMutationFailuresRef.current);
      return true;
    }

    const mode = failureModeRef.current;
    return mode === 'all' || mode === kind;
  }, []);

  const api = useMemo(
    () =>
      createAsyncTodoApi(copy.seedTitles, shouldFail, {
        query: copy.querySimulatedError,
        mutation: copy.mutationSimulatedError,
      }),
    [
      copy.mutationSimulatedError,
      copy.querySimulatedError,
      copy.seedTitles,
      shouldFail,
    ],
  );

  const todosQuery = useQuery<DemoTodo[]>({
    client,
    key: TODOS_KEY,
    queryFn: ({ signal }) => api.list(signal),
    retry: queryRetryCount,
    cancelOnUnmount: true,
  });

  const addTodo = useMutation<DemoTodo, string>({
    mutationFn: (title) => api.add(title),
    onSuccess: () => {
      client.invalidateQueries({ key: TODOS_KEY });
    },
  });

  const toggleTodo = useMutation<DemoTodo, ToggleInput>({
    mutationFn: (input) => api.toggle(input),
    onSuccess: () => {
      client.invalidateQueries({ key: TODOS_KEY });
    },
  });

  const removeTodo = useMutation<void, string>({
    mutationFn: (id) => api.remove(id),
    onSuccess: () => {
      client.invalidateQueries({ key: TODOS_KEY });
    },
  });

  const todos = todosQuery.data ?? [];
  const remainingCount = todos.filter((todo) => !todo.done).length;
  const hasPendingMutation =
    addTodo.isPending || toggleTodo.isPending || removeTodo.isPending;
  const errorMessage = resolveErrorMessage([
    todosQuery.error,
    addTodo.error,
    toggleTodo.error,
    removeTodo.error,
  ]);
  const guideStatusValue = isGuideRunning
    ? copy.guideRunningValue
    : guideStepIndex >= copy.guideSteps.length
      ? copy.guideDoneValue
      : copy.guideIdleValue;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) {
      return;
    }
    addTodo.mutate(title);
    setDraft('');
  };

  const setFailureModeValue = (nextMode: FailureMode): void => {
    failureModeRef.current = nextMode;
    setFailureMode(nextMode);
  };

  const setQueuedFailures = (kind: FailureKind, value: number): void => {
    if (kind === 'query') {
      queuedQueryFailuresRef.current = value;
      setQueuedQueryFailures(value);
      return;
    }
    queuedMutationFailuresRef.current = value;
    setQueuedMutationFailures(value);
  };

  const queueQueryFailure = (): void => {
    setQueuedFailures('query', queuedQueryFailuresRef.current + 1);
  };

  const queueMutationFailure = (): void => {
    setQueuedFailures('mutation', queuedMutationFailuresRef.current + 1);
  };

  const runGuide = useCallback(async (): Promise<void> => {
    if (isGuideRunning) {
      return;
    }

    setIsGuideRunning(true);
    setGuideStepIndex(1);
    try {
      todosQuery.query.cancel();

      setFailureModeValue('query');
      setQueryRetryCount(0);
      setQueuedFailures('query', 1);
      setQueuedFailures('mutation', 0);

      try {
        await todosQuery.refetch();
      } catch {
        //
      }

      setGuideStepIndex(2);
      await sleep(260);

      setFailureModeValue('none');
      setQueryRetryCount(2);
      setQueuedFailures('query', 2);

      try {
        await todosQuery.refetch();
      } catch {
        //
      }
      setGuideStepIndex(3);
    } finally {
      setIsGuideRunning(false);
    }
  }, [isGuideRunning, todosQuery]);

  return (
    <div className="io-devtools-todo">
      <section className="io-playground__card io-devtools-todo__panel">
        <div className="io-devtools-todo__head">
          <div>
            <div className="io-playground__kicker">{copy.kicker}</div>
            <p className="io-devtools-todo__hint">{copy.hint}</p>
          </div>
          <span className="io-devtools-todo__badge">
            {copy.remainingLabel}: {remainingCount}
          </span>
        </div>

        <div className="io-devtools-todo__teaching">
          <span className="io-playground__kicker">{copy.teachingLabel}</span>
          <div className="io-devtools-todo__teaching-grid">
            <label className="io-devtools-todo__control">
              <span>{copy.failureModeLabel}</span>
              <select
                className="io-devtools-todo__select"
                value={failureMode}
                disabled={isGuideRunning}
                onChange={(event) => {
                  const nextMode = event.currentTarget.value as FailureMode;
                  setFailureModeValue(nextMode);
                }}
              >
                {copy.failureModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="io-devtools-todo__control">
              <span>{copy.retryCountLabel}</span>
              <select
                className="io-devtools-todo__select"
                value={String(queryRetryCount)}
                disabled={isGuideRunning}
                onChange={(event) => {
                  const nextRetryCount = Number(event.currentTarget.value);
                  setQueryRetryCount(nextRetryCount);
                }}
              >
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>
            <button
              type="button"
              className="io-live__button"
              disabled={isGuideRunning}
              onClick={queueQueryFailure}
            >
              {copy.failNextQueryButton}
            </button>
            <button
              type="button"
              className="io-live__button"
              disabled={isGuideRunning}
              onClick={queueMutationFailure}
            >
              {copy.failNextMutationButton}
            </button>
            <button
              type="button"
              className="io-live__button io-live__button--primary"
              disabled={isGuideRunning}
              onClick={() => {
                void runGuide();
              }}
            >
              {copy.guideButton}
            </button>
            <div className="io-devtools-todo__steps" aria-live="polite">
              {copy.guideSteps.map((stepLabel, index) => {
                const step = index + 1;
                const state =
                  guideStepIndex > step
                    ? 'done'
                    : guideStepIndex === step
                      ? isGuideRunning
                        ? 'active'
                        : 'done'
                      : 'idle';

                return (
                  <span
                    className="io-devtools-todo__step"
                    data-state={state}
                    key={stepLabel}
                  >
                    <span className="io-devtools-todo__step-index">{step}</span>
                    <span>{stepLabel}</span>
                  </span>
                );
              })}
            </div>
            <span className="io-devtools-todo__meta">
              {copy.guideStepsLabel} · {copy.queuedFailuresLabel}:{' '}
              {copy.queuedQueryLabel} {queuedQueryFailures} /{' '}
              {copy.queuedMutationLabel} {queuedMutationFailures}
            </span>
          </div>
        </div>

        <div className="io-live__row">
          <button
            type="button"
            className="io-live__button"
            disabled={todosQuery.isFetching}
            onClick={() => {
              void todosQuery.refetch();
            }}
          >
            {copy.refreshButton}
          </button>
          <button
            type="button"
            className="io-live__button"
            disabled={!todosQuery.isFetching}
            onClick={() => {
              todosQuery.query.cancel();
            }}
          >
            {copy.cancelButton}
          </button>
          <span>
            {copy.fetchLabel}:{' '}
            {todosQuery.isFetching ? copy.fetchingValue : copy.idleValue}
          </span>
          <span>
            {copy.mutationLabel}:{' '}
            {hasPendingMutation ? copy.pendingValue : copy.idleValue}
          </span>
          <span>
            {copy.retryCountLabel}: {queryRetryCount}
          </span>
          <span>
            {copy.guideLabel}: {guideStatusValue}
          </span>
        </div>

        <form className="io-devtools-todo__form" onSubmit={handleSubmit}>
          <input
            className="io-devtools-todo__input"
            value={draft}
            placeholder={copy.placeholder}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
            }}
          />
          <button
            type="submit"
            className="io-playground__button io-playground__button--primary"
            disabled={addTodo.isPending}
          >
            {copy.addButton}
          </button>
        </form>

        {errorMessage ? (
          <div className="io-devtools-todo__empty">
            {copy.errorPrefix}
            {errorMessage}
            <div className="io-live__row">
              <button
                type="button"
                className="io-live__button"
                onClick={() => {
                  void todosQuery.refetch();
                }}
              >
                {copy.retryButton}
              </button>
            </div>
          </div>
        ) : null}

        <div className="io-devtools-todo__list">
          {todosQuery.isLoading ? (
            <div className="io-devtools-todo__empty">{copy.loadingText}</div>
          ) : null}

          {!todosQuery.isLoading && todos.length === 0 ? (
            <div className="io-devtools-todo__empty">{copy.emptyText}</div>
          ) : null}

          {!todosQuery.isLoading
            ? todos.map((todo) => (
                <div className="io-devtools-todo__item" key={todo.id}>
                  <input
                    type="checkbox"
                    checked={todo.done}
                    disabled={toggleTodo.isPending}
                    onChange={(event) => {
                      toggleTodo.mutate({
                        id: todo.id,
                        done: event.currentTarget.checked,
                      });
                    }}
                  />
                  <span
                    className="io-devtools-todo__title"
                    data-done={todo.done ? 'true' : undefined}
                  >
                    {todo.title}
                  </span>
                  <button
                    type="button"
                    className="io-devtools-todo__remove"
                    disabled={removeTodo.isPending}
                    onClick={() => {
                      removeTodo.mutate(todo.id);
                    }}
                  >
                    {copy.removeButton}
                  </button>
                </div>
              ))
            : null}
        </div>

        <div className="io-playground__kicker">{copy.tip}</div>
      </section>
    </div>
  );
}
