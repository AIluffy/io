import { batch, mergeUpdates, io, replay, undoUpdate } from 'io-store';

const store = io({
  todos: [{ id: 'a', title: 'Learn IO', done: false }],
  filter: 'all',
});

const updates = [];
const unsubscribe = store.subscribeUpdate((u) => updates.push(u));

store.todos[0].done(true);
store.filter('done');
batch(() => {
  store.todos.push({ id: 'b', title: 'Build docs', done: false });
  store.todos[1].done(true);
});

unsubscribe();

const merged = mergeUpdates(updates);
const inverses = merged.map(undoUpdate).reverse();

console.log('Snapshot (after mutations):', store.snapshot());

replay(store, inverses);
console.log('Snapshot (after rollback):', store.snapshot());
