import { describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../client.js';

describe('@iostore/query createQueryClient', () => {
  it('returns the same query instance for the same key hash', async () => {
    const client = createQueryClient();
    const firstFn = vi.fn(async () => 1);
    const secondFn = vi.fn(async () => 2);

    const first = client.query({
      key: ['shared'],
      queryFn: firstFn,
      staleTime: 0,
    });
    await first.fetch();

    const second = client.query({
      key: ['shared'],
      queryFn: secondFn,
      staleTime: 0,
    });
    await second.fetch();

    expect(first).toBe(second);
    expect(firstFn).toHaveBeenCalledTimes(1);
    expect(secondFn).toHaveBeenCalledTimes(1);
  });

  it('invalidateQueries applies prefix matching', async () => {
    const client = createQueryClient();

    let todoList = 0;
    let todoDetail = 0;
    let users = 0;

    const todosQuery = client.query({
      key: ['todos'],
      queryFn: async () => {
        todoList += 1;
        return todoList;
      },
      staleTime: 60_000,
    });
    const todoQuery = client.query({
      key: ['todos', 1],
      queryFn: async () => {
        todoDetail += 1;
        return todoDetail;
      },
      staleTime: 60_000,
    });
    const usersQuery = client.query({
      key: ['users'],
      queryFn: async () => {
        users += 1;
        return users;
      },
      staleTime: 60_000,
    });

    await Promise.all([todosQuery.fetch(), todoQuery.fetch(), usersQuery.fetch()]);

    const usersUpdatedAt = usersQuery.snapshot().dataUpdatedAt;
    client.invalidateQueries({ key: ['todos'] }, false);

    expect(todosQuery.snapshot().dataUpdatedAt).toBe(0);
    expect(todoQuery.snapshot().dataUpdatedAt).toBe(0);
    expect(usersQuery.snapshot().dataUpdatedAt).toBe(usersUpdatedAt);
  });

  it('setQueryData/getQueryData works for existing and missing queries', async () => {
    const client = createQueryClient();

    client.setQueryData<number>(['count'], 1);
    expect(client.getQueryData<number>(['count'])).toBe(1);

    client.setQueryData<number>(['count'], (prev) => (prev ?? 0) + 1);
    expect(client.getQueryData<number>(['count'])).toBe(2);

    const countQuery = client.query<number>({
      key: ['count'],
      queryFn: async () => 10,
      staleTime: 0,
    });
    await countQuery.fetch();

    expect(client.getQueryData<number>(['count'])).toBe(10);
  });

  it('does not refetch seeded setQueryData queries during invalidateQueries', async () => {
    const client = createQueryClient();

    client.setQueryData<number>(['seeded'], 1);
    const seeded = client.getQuery<number>(['seeded']);
    expect(seeded).toBeDefined();
    if (!seeded) {
      throw new Error('expected seeded query to be created');
    }
    expect(seeded?.snapshot().status).toBe('success');
    expect(seeded?.snapshot().data).toBe(1);

    client.invalidateQueries({ key: ['seeded'] });
    await Promise.resolve();

    expect(seeded?.snapshot().status).toBe('success');
    expect(seeded?.snapshot().error).toBeNull();
    expect(seeded?.snapshot().data).toBe(1);
    await expect(seeded.fetch()).rejects.toThrow(
      'query.fetch: queryFn is not available for key',
    );

    const queryFn = vi.fn(async () => 2);
    const hydrated = client.query<number>({
      key: ['seeded'],
      queryFn,
      staleTime: 0,
    });
    await expect(hydrated.fetch()).resolves.toBe(2);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(hydrated.snapshot().data).toBe(2);
  });

  it('emits cache events for add/update/remove', async () => {
    const client = createQueryClient();
    const events: string[] = [];
    const unsub = client.subscribe((event) => {
      events.push(event.type);
    });

    const query = client.query({
      key: ['events'],
      queryFn: async () => 'ok',
      staleTime: 0,
    });

    await query.fetch();
    client.removeQueries({ key: ['events'], exact: true });

    expect(events).toContain('query-added');
    expect(events).toContain('query-updated');
    expect(events).toContain('query-removed');

    unsub();
  });

  it('removes inactive queries after gcTime', async () => {
    vi.useFakeTimers();

    const client = createQueryClient({
      defaultGcTime: 50,
    });

    const query = client.query({
      key: ['gc'],
      queryFn: async () => 1,
    });

    await query.fetch();
    await Promise.resolve();

    expect(client.getQuery(['gc'])).toBeDefined();

    await vi.advanceTimersByTimeAsync(60);
    expect(client.getQuery(['gc'])).toBeUndefined();

    vi.useRealTimers();
  });
});
