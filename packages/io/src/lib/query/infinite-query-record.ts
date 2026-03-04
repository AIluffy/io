import { io } from '../core/api/io.js';
import type { IoUnit, IoUpdate, IoUpdateAnnotation } from '../utils/types/types.js';

import { createInfinitePageFetcher } from './infinite-page-fetcher.js';
import {
  cloneInfiniteData,
  createInitialInfiniteQueryState,
  deriveInfiniteQueryFlags,
  toHydratedInfiniteState,
} from './infinite-query-state.js';
import {
  createObserverManager,
  createRecordGcController,
  createRecordStaleChecker,
  patchRecordState,
  readRecordState,
  resetRecordState,
  updateRecordDefinition,
} from './record-shared.js';
import type {
  InfiniteData,
  IoInfiniteQueryDerivedFlags,
  IoInfiniteQueryDefinition,
  IoInfiniteQueryState,
  IoUnsubscribe,
  KeyHash,
} from './types.js';
import { reportBackgroundError } from './utils.js';

type InfiniteQueryUnitBox<TData, TError, TPageParam> = {
  value: IoUnit<IoInfiniteQueryState<TData, TError, TPageParam>>;
};

export type NormalizedInfiniteQueryDefinition<
  TData,
  TError,
  TPageParam,
> = IoInfiniteQueryDefinition<TData, TError, TPageParam> & {
  keyHash: KeyHash;
  staleTime: number;
  gcTime: number;
  retry: number;
  retryDelay: (attempt: number) => number;
  canFetch: boolean;
};

export type InfiniteQueryRecord<TData, TError, TPageParam> = {
  readonly key: readonly unknown[];
  readonly keyHash: KeyHash;
  readonly definition: NormalizedInfiniteQueryDefinition<TData, TError, TPageParam>;
  readonly observerCount: number;
  readonly isActive: boolean;
  touch: () => void;
  setDefinition: (next: NormalizedInfiniteQueryDefinition<TData, TError, TPageParam>) => void;
  getState: () => IoInfiniteQueryState<TData, TError, TPageParam>;
  getFlags: (isFetchedAfterMount?: boolean) => IoInfiniteQueryDerivedFlags;
  isStale: (state?: IoInfiniteQueryState<TData, TError, TPageParam>) => boolean;
  getInFlightPromise: () => Promise<InfiniteData<TData, TPageParam>> | null;
  fetchNextPage: (signal?: AbortSignal) => Promise<InfiniteData<TData, TPageParam>>;
  fetchPreviousPage: (signal?: AbortSignal) => Promise<InfiniteData<TData, TPageParam>>;
  refetchAllPages: (signal?: AbortSignal) => Promise<InfiniteData<TData, TPageParam>>;
  prefetch: () => Promise<void>;
  ensureData: () => Promise<InfiniteData<TData, TPageParam>>;
  invalidate: (refetch?: boolean) => void;
  cancel: () => void;
  reset: () => void;
  setData: (
    updater:
      | InfiniteData<TData, TPageParam>
      | ((prev: InfiniteData<TData, TPageParam> | undefined) => InfiniteData<TData, TPageParam>),
  ) => void;
  hydrate: (state: IoInfiniteQueryState<TData, TError, TPageParam>) => void;
  addObserver: () => void;
  removeObserver: () => void;
  subscribe: (fn: (state: IoInfiniteQueryState<TData, TError, TPageParam>) => void) => IoUnsubscribe;
  subscribeUpdate: (fn: (update: IoUpdate) => void) => IoUnsubscribe;
};

export function createInfiniteQueryRecord<TData, TError, TPageParam>(options: {
  definition: NormalizedInfiniteQueryDefinition<TData, TError, TPageParam>;
  onGarbageCollect: () => void;
}): InfiniteQueryRecord<TData, TError, TPageParam> {
  const holder = io(
    { value: createInitialInfiniteQueryState<TData, TError, TPageParam>() },
    { shallow: true },
  ) as unknown as InfiniteQueryUnitBox<TData, TError, TPageParam>;
  const unit = holder.value;

  let definition = options.definition;
  const patchState = (
    patch: Partial<IoInfiniteQueryState<TData, TError, TPageParam>>,
    annotation?: IoUpdateAnnotation,
  ): void => {
    patchRecordState(unit, patch, annotation);
  };

  const pageFetcher = createInfinitePageFetcher({
    unit,
    getDefinition: () => definition,
    patchState,
    touch: () => gcController.touch(),
    scheduleGc: () => gcController.schedule(),
  });

  const observers = createObserverManager({
    unit,
    onObserverAdded: () => gcController.touch(),
    onObserverRemoved: () => gcController.schedule(),
  });

  const gcController = createRecordGcController({
    getGcTime: () => definition.gcTime,
    hasObservers: () => observers.getObserverCount() > 0,
    hasInFlight: () => pageFetcher.getInFlightPromise() !== null,
    onCollect: options.onGarbageCollect,
  });

  const isStale = createRecordStaleChecker({
    getDefinition: () => definition,
    getState: () => readRecordState(unit),
  });

  const prefetch = (): Promise<void> =>
    pageFetcher
      .fetchNextPage()
      .then(() => undefined)
      .catch((error: unknown) => {
        reportBackgroundError('infiniteQuery.prefetchQuery()', error, unit);
      });

  const ensureData = (): Promise<InfiniteData<TData, TPageParam>> => {
    const current = readRecordState(unit);
    if (current.status === 'success' && !isStale(current) && current.data) {
      return Promise.resolve(current.data);
    }
    return pageFetcher.refetchAllPages();
  };

  return {
    get key() {
      return definition.key;
    },
    get keyHash() {
      return definition.keyHash;
    },
    get definition() {
      return definition;
    },
    get observerCount() {
      return observers.getObserverCount();
    },
    get isActive() {
      return observers.getObserverCount() > 0;
    },
    touch: () => gcController.touch(),
    setDefinition: (next) => {
      definition = updateRecordDefinition('defineInfiniteQuery', definition, next);
      gcController.schedule();
    },
    getState: () => {
      gcController.touch();
      return unit.snapshot();
    },
    getFlags: (isFetchedAfterMount = false) => {
      gcController.touch();
      const state = unit.snapshot();
      return deriveInfiniteQueryFlags({
        state,
        definition,
        isStale: isStale(state),
        isFetchedAfterMount,
      });
    },
    isStale,
    getInFlightPromise: () => pageFetcher.getInFlightPromise(),
    fetchNextPage: (signal) => pageFetcher.fetchNextPage(signal),
    fetchPreviousPage: (signal) => pageFetcher.fetchPreviousPage(signal),
    refetchAllPages: (signal) => pageFetcher.refetchAllPages(signal),
    prefetch,
    ensureData,
    invalidate: (refetch = true) => {
      patchState(
        { isInvalidated: true },
        { action: 'infiniteQuery.invalidate', meta: { keyHash: definition.keyHash, refetch } },
      );

      if (refetch) {
        void pageFetcher.refetchAllPages().catch((error: unknown) => {
          reportBackgroundError('infiniteQuery.invalidate()', error, unit);
        });
      }
    },
    cancel: () => pageFetcher.cancel(),
    reset: () => {
      pageFetcher.cancel();
      resetRecordState({
        unit,
        createInitialState: () => createInitialInfiniteQueryState<TData, TError, TPageParam>(),
        annotation: { action: 'infiniteQuery.reset', meta: { keyHash: definition.keyHash } },
      });
      gcController.schedule();
    },
    setData: (updater) => {
      gcController.touch();
      const current = readRecordState(unit);
      const nextData =
        typeof updater === 'function'
          ? (updater as (prev: InfiniteData<TData, TPageParam> | undefined) => InfiniteData<TData, TPageParam>)(
              current.data,
            )
          : updater;

      patchState(
        {
          status: 'success',
          data: cloneInfiniteData(nextData),
          error: null,
          dataUpdatedAt: Date.now(),
          failureCount: 0,
          failureReason: null,
          isInvalidated: false,
          isPlaceholderData: false,
          fetchDirection: null,
        },
        { action: 'infiniteQuery.setData', meta: { keyHash: definition.keyHash } },
      );
    },
    hydrate: (state) => {
      patchState(toHydratedInfiniteState(state), {
        action: 'infiniteQuery.hydrate',
        meta: { keyHash: definition.keyHash },
      });
    },
    addObserver: () => observers.addObserver(),
    removeObserver: () => observers.removeObserver(),
    subscribe: (fn) => observers.subscribe(fn),
    subscribeUpdate: (fn) => unit.subscribeUpdate(fn),
  };
}
