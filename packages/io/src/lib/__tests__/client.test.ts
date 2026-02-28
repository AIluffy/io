import { describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../query/client.js';

describe('@iostore/query createQueryClient', () => {
  it('returns same query handle for same key', () => {
    const client = createQueryClient();
    const queryFn = vi.fn(async () => 1);

    const first = client.defineQuery({
      key: ['shared'],
      queryFn,
      staleTime: 0,
    });

    const second = client.defineQuery({
      key: ['shared'],
      queryFn,
      staleTime: 0,
    });

    expect(first).toBe(second);
  });

  it('fetchQuery/prefetchQuery/ensureQueryData work on definition input', async () => {
    const client = createQueryClient();
    const queryFn = vi.fn(async () => 3);

    await expect(
      client.prefetchQuery({
        key: ['prefetch'],
        queryFn,
        staleTime: Number.POSITIVE_INFINITY,
      }),
    ).resolves.toBeUndefined();

    await expect(
      client.fetchQuery({
        key: ['prefetch'],
        queryFn,
        staleTime: Number.POSITIVE_INFINITY,
      }),
    ).resolves.toBe(3);

    await expect(
      client.ensureQueryData({
        key: ['prefetch'],
        queryFn,
        staleTime: Number.POSITIVE_INFINITY,
      }),
    ).resolves.toBe(3);

    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('invalidateQueries applies prefix matching', async () => {
    const client = createQueryClient();

    let todoList = 0;
    let todoDetail = 0;
    let users = 0;

    const todosQuery = client.defineQuery({
      key: ['todos'],
      queryFn: async () => {
        todoList += 1;
        return todoList;
      },
      staleTime: 60_000,
    });
    const todoQuery = client.defineQuery({
      key: ['todos', 1],
      queryFn: async () => {
        todoDetail += 1;
        return todoDetail;
      },
      staleTime: 60_000,
    });
    const usersQuery = client.defineQuery({
      key: ['users'],
      queryFn: async () => {
        users += 1;
        return users;
      },
      staleTime: 60_000,
    });

    await Promise.all([
      todosQuery.fetch(true),
      todoQuery.fetch(true),
      usersQuery.fetch(true),
    ]);

    const usersUpdatedAt = usersQuery.getState().dataUpdatedAt;
    client.invalidateQueries({ key: ['todos'] }, false);

    expect(todosQuery.getState().isInvalidated).toBe(true);
    expect(todoQuery.getState().isInvalidated).toBe(true);
    expect(usersQuery.getState().dataUpdatedAt).toBe(usersUpdatedAt);
  });

  it('setQueryData/getQueryData/getQueryState works for existing and seeded queries', async () => {
    const client = createQueryClient();

    client.setQueryData<number>(['count'], 1);
    expect(client.getQueryData<number>(['count'])).toBe(1);

    client.setQueryData<number>(['count'], (prev) => (prev ?? 0) + 1);
    expect(client.getQueryData<number>(['count'])).toBe(2);

    const countQuery = client.defineQuery<number>({
      key: ['count'],
      queryFn: async () => 10,
      staleTime: 0,
    });
    await countQuery.fetch(true);

    expect(client.getQueryData<number>(['count'])).toBe(10);
    expect(client.getQueryState<number>(['count'])?.status).toBe('success');
  });

  it('setQueriesData updates matched queries', async () => {
    const client = createQueryClient();

    client.setQueryData<number>(['items', 1], 1);
    client.setQueryData<number>(['items', 2], 2);
    client.setQueriesData<number>({ key: ['items'] }, (prev) => (prev ?? 0) + 10);

    expect(client.getQueryData<number>(['items', 1])).toBe(11);
    expect(client.getQueryData<number>(['items', 2])).toBe(12);
  });

  it('emits cache events for add/update/remove', async () => {
    const client = createQueryClient();
    const events: string[] = [];
    const unsub = client.subscribe((event) => {
      events.push(event.type);
    });

    const query = client.defineQuery({
      key: ['events'],
      queryFn: async () => 'ok',
      staleTime: 0,
    });

    await query.fetch(true);
    client.removeQueries({ key: ['events'], exact: true });

    expect(events).toContain('query-added');
    expect(events).toContain('query-updated');
    expect(events).toContain('query-removed');

    unsub();
  });

  it('refetchQueries triggers force fetch on matched keys', async () => {
    const client = createQueryClient();
    let value = 0;

    client.defineQuery({
      key: ['refetch'],
      queryFn: async () => {
        value += 1;
        return value;
      },
      staleTime: Number.POSITIVE_INFINITY,
    });

    await client.refetchQueries({ key: ['refetch'] });
    await client.refetchQueries({ key: ['refetch'] });

    expect(client.getQueryData<number>(['refetch'])).toBe(2);
  });
});
