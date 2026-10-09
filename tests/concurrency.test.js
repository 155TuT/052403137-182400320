import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  captureRecord,
  createEditSession,
  loadState,
  saveState,
  updateState,
  upsertDraft,
  completeItem,
  createItem,
} from '../src/model.js';
import { createInitialState } from '../src/seed.js';

function storage() {
  let raw = null;
  return {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  };
}

function setup() {
  const local = storage();
  const state = saveState(local, createInitialState());
  return { local, state, options: { initialState: createInitialState(), locks: null } };
}

function lockQueue() {
  let pending = Promise.resolve();
  const requests = [];
  return {
    requests,
    request(name, options, action) {
      requests.push({ name, mode: options.mode });
      const result = pending.then(action);
      pending = result.catch(() => {});
      return result;
    },
  };
}

const isConflict = (error) => error.code === 'STATE_CONFLICT';

test('new publication snapshots are canonical and immediately support editing and completion', async () => {
  const { local, state, options } = setup();
  const item = createItem(
    {
      ...state.items.find((record) => record.id === 'keys'),
      eventDate: '',
      timeLabel: '今天 10:20',
    },
    { id: 'new-item' },
  );
  const published = await updateState(
    local,
    (latest) => ({ ...latest, items: [item, ...latest.items] }),
    options,
  );
  assert.deepEqual(published, loadState(local));
  assert.equal('timeLabel' in published.items[0], false);
  assert.equal(published.items[0].eventTime, '10:20');
  const edited = await updateState(
    local,
    (latest) => ({
      ...latest,
      items: latest.items.map((record) =>
        record.id === item.id ? { ...record, name: 'edited immediately' } : record,
      ),
    }),
    { ...options, expected: createEditSession(published, { editId: item.id }).expected },
  );
  const completed = await updateState(
    local,
    (latest) => ({
      ...latest,
      items: completeItem(latest.items, item.id, 'me'),
    }),
    { ...options, expected: [captureRecord(edited, 'items', item.id)] },
  );
  assert.equal(completed.items[0].status, 'completed');
});

test('an open draft keeps its baseline after receiving a newer storage snapshot', async () => {
  const { local, state, options } = setup();
  const draft = state.drafts[0];
  const session = createEditSession(state, { draftId: draft.id });
  const pendingInput = { ...draft, description: 'B only changes this description' };
  await updateState(
    local,
    (latest) => ({
      ...latest,
      drafts: upsertDraft(latest.drafts, { ...draft, name: 'A changed the title' }),
    }),
    { ...options, expected: session.expected },
  );

  // A storage event replaces the list state, but never the editor's session or input.
  const synchronized = loadState(local);
  assert.equal(synchronized.drafts[0].name, 'A changed the title');
  await assert.rejects(
    updateState(
      local,
      (latest) => ({
        ...latest,
        drafts: upsertDraft(latest.drafts, pendingInput),
      }),
      { ...options, expected: session.expected },
    ),
    isConflict,
  );
  assert.equal(loadState(local).drafts[0].name, 'A changed the title');
  assert.equal(pendingInput.description, 'B only changes this description');
});

test('published-item edit sessions protect the item and the resumed draft independently', async () => {
  for (const collection of ['items', 'drafts']) {
    const { local, state, options } = setup();
    state.drafts.push({ id: 'edit-copy', ownerId: 'me', sourceItemId: 'keys', name: 'old copy' });
    saveState(local, state);
    const session = createEditSession(loadState(local), { draftId: 'edit-copy' });
    const id = collection === 'items' ? 'keys' : 'edit-copy';
    await updateState(
      local,
      (latest) => ({
        ...latest,
        [collection]: latest[collection].map((record) =>
          record.id === id ? { ...record, name: 'other tab' } : record,
        ),
      }),
      options,
    );
    await assert.rejects(
      updateState(local, (latest) => latest, { ...options, expected: session.expected }),
      isConflict,
    );
  }
});

test('two queued operations on different records preserve both changes and activity entries', async () => {
  const { local, state, options } = setup();
  const locks = lockQueue();
  const operations = state.drafts.slice(0, 2).map((draft, index) =>
    updateState(
      local,
      (latest) => ({
        ...latest,
        drafts: upsertDraft(latest.drafts, { ...draft, name: `tab ${index}` }),
        activities: [{ id: `activity-${index}` }, ...(latest.activities || [])],
      }),
      { ...options, locks, expected: [captureRecord(state, 'drafts', draft.id)] },
    ),
  );
  await Promise.all(operations);
  const saved = loadState(local);
  assert.deepEqual(
    saved.drafts.slice(0, 2).map((draft) => draft.name),
    ['tab 0', 'tab 1'],
  );
  assert.equal(saved.activities.length, 2);
  assert.deepEqual(
    locks.requests,
    Array(2).fill({ name: `${STORAGE_KEY}:write`, mode: 'exclusive' }),
  );
});

test('a successful save can advance its own baseline without accepting an unrelated stale session', async () => {
  const { local, state, options } = setup();
  const draft = state.drafts[0];
  const oldSession = createEditSession(state, { draftId: draft.id });
  const first = await updateState(
    local,
    (latest) => ({
      ...latest,
      drafts: upsertDraft(latest.drafts, { ...draft, name: 'first save' }),
    }),
    { ...options, expected: oldSession.expected },
  );
  const ownSession = createEditSession(first, { draftId: draft.id });
  await updateState(
    local,
    (latest) => ({
      ...latest,
      drafts: upsertDraft(latest.drafts, { ...first.drafts[0], name: 'second save' }),
    }),
    { ...options, expected: ownSession.expected },
  );
  await assert.rejects(
    updateState(local, (latest) => latest, { ...options, expected: oldSession.expected }),
    isConflict,
  );
  assert.equal(loadState(local).drafts[0].name, 'second save');
});

test('saving conflict input as an independent draft preserves the original and its photos', async () => {
  const { local, state, options } = setup();
  const original = state.drafts[0];
  const encoded =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  original.images = [
    { type: 'image/png', size: atob(encoded).length, dataUrl: `data:image/png;base64,${encoded}` },
  ];
  saveState(local, state);
  const saved = await updateState(
    local,
    (latest) => ({
      ...latest,
      drafts: upsertDraft(latest.drafts, {
        ...original,
        id: undefined,
        sourceItemId: undefined,
        name: 'preserved conflicting input',
      }),
    }),
    options,
  );
  assert.equal(saved.drafts.length, state.drafts.length + 1);
  assert.notEqual(saved.drafts[0].id, original.id);
  assert.equal(saved.drafts[0].sourceItemId, undefined);
  assert.deepEqual(saved.drafts[0].images, original.images);
  assert.deepEqual(
    saved.drafts.find((draft) => draft.id === original.id),
    original,
  );
});

test('completion and removal invalidate open edit sessions instead of resurrecting records', async () => {
  for (const action of ['complete', 'remove']) {
    const { local, state, options } = setup();
    const session = createEditSession(state, { editId: 'keys' });
    await updateState(
      local,
      (latest) => ({
        ...latest,
        items:
          action === 'complete'
            ? completeItem(latest.items, 'keys', 'me')
            : latest.items.filter((item) => item.id !== 'keys'),
      }),
      options,
    );
    await assert.rejects(
      updateState(local, (latest) => latest, { ...options, expected: session.expected }),
      isConflict,
    );
  }
});

test('a stale deletion confirmation cannot discard a draft updated in another page', async () => {
  const { local, state, options } = setup();
  const draft = state.drafts[0];
  const expected = [captureRecord(state, 'drafts', draft.id)];
  await updateState(
    local,
    (latest) => ({
      ...latest,
      drafts: upsertDraft(latest.drafts, { ...draft, description: 'new work' }),
    }),
    options,
  );
  await assert.rejects(
    updateState(
      local,
      (latest) => ({
        ...latest,
        drafts: latest.drafts.filter((record) => record.id !== draft.id),
      }),
      { ...options, expected },
    ),
    isConflict,
  );
  assert.equal(loadState(local).drafts[0].description, 'new work');
});

test('fallback revision checks reject a write that changed storage during the mutation', async () => {
  const { local, options } = setup();
  await assert.rejects(
    updateState(
      local,
      (latest) => {
        saveState(local, { ...latest, activities: [{ id: 'external' }] });
        return { ...latest, activities: [{ id: 'stale' }] };
      },
      options,
    ),
    isConflict,
  );
  assert.deepEqual(loadState(local).activities, [{ id: 'external' }]);
});

test('malformed JSON, incompatible schemas and invalid revisions cannot be overwritten', async () => {
  for (const raw of [
    '{',
    '{}',
    'null',
    JSON.stringify({ ...createInitialState(), schemaVersion: 9 }),
    JSON.stringify({ ...createInitialState(), revision: -1 }),
  ]) {
    const { local, options } = setup();
    local.setItem(STORAGE_KEY, raw);
    await assert.rejects(updateState(local, (latest) => latest, options));
    assert.throws(() => saveState(local, createInitialState()));
    assert.equal(local.getItem(STORAGE_KEY), raw);
  }
});

test('lock acquisition failure never falls back to an unprotected write', async () => {
  const { local, options } = setup();
  const before = local.getItem(STORAGE_KEY);
  let called = false;
  await assert.rejects(
    updateState(
      local,
      (latest) => {
        called = true;
        return latest;
      },
      {
        ...options,
        locks: {
          request: async () => {
            throw new Error('lock unavailable');
          },
        },
      },
    ),
    /lock unavailable/,
  );
  assert.equal(called, false);
  assert.equal(local.getItem(STORAGE_KEY), before);
});
