import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_USER,
  STORAGE_KEY,
  validateItem,
  searchItems,
  createItem,
  completeItem,
  upsertDraft,
  loadState,
  saveState,
} from '../src/model.js';
import { seedItems, seedDrafts, createInitialState } from '../src/seed.js';

const now = '2026-10-09T12:00:00+08:00';
const valid = (extra = {}) => ({
  type: 'found',
  name: '红色笔记本',
  category: '书本文具',
  campus: '旗山校区',
  area: '教学楼 101',
  eventDate: '2026-10-08',
  description: '封面有贴纸。',
  contact: 'student@example.test',
  ...extra,
});
const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};
const pngBytes =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
// A genuine one-pixel JPEG, matching the MIME and byte-size shape returned by Editor canvas.toDataURL.
const jpegBytes =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==';
const photo = (type = 'image/png') => {
  const bytes = type === 'image/jpeg' ? jpegBytes : pngBytes;
  return { type, size: atob(bytes).length, dataUrl: `data:${type};base64,${bytes}` };
};

test('valid arbitrary item input passes without depending on preset keywords', () => {
  assert.deepEqual(validateItem(valid(), { now }), {});
});
test('required name, place and contact report independent field errors', () => {
  const errors = validateItem(valid({ name: '  ', area: '', contact: '' }), { now });
  assert.deepEqual(Object.keys(errors).sort(), ['area', 'contact', 'name']);
});
test('name and description enforce character limits while accepting Unicode', () => {
  assert.equal(validateItem(valid({ name: '伞'.repeat(30) }), { now }).name, undefined);
  const errors = validateItem(valid({ name: '伞'.repeat(31), description: '字'.repeat(301) }), {
    now,
  });
  assert.ok(errors.name && errors.description);
});
test('invalid calendar dates and future event dates are rejected', () => {
  assert.ok(validateItem(valid({ eventDate: '2026-02-30' }), { now }).eventDate);
  assert.ok(validateItem(valid({ eventDate: '2026-10-10' }), { now }).eventDate);
  assert.ok(validateItem(valid({ eventDate: '10/08/2026' }), { now }).eventDate);
});
test('unknown event time and no photo remain valid publication choices', () => {
  assert.deepEqual(validateItem(valid({ eventDate: '', images: [] }), { now }), {});
});
test('contact supports declared email, QQ and WeChat but rejects unusable text', () => {
  for (const contact of ['邮箱：demo@example.test', '示例 QQ：100000001', '微信：shiban_demo']) {
    assert.equal(validateItem(valid({ contact }), { now }).contact, undefined);
  }
  assert.ok(validateItem(valid({ contact: '有缘自会相见' }), { now }).contact);
});
test('contact rejects pure symbols and incomplete phone numbers', () => {
  for (const contact of ['-------', '(((((((', '电话：()--()-', '电话：', '电话：12']) {
    assert.ok(validateItem(valid({ contact }), { now }).contact, `应拒绝: ${contact}`);
  }
  for (const contact of ['010-12345678', '13800000000', '电话：010-12345678', '手机：13800000000']) {
    assert.equal(validateItem(valid({ contact }), { now }).contact, undefined, `应接受: ${contact}`);
  }
});
test('photo count, type and file size follow the optional image limits', () => {
  const image = photo();
  assert.equal(validateItem(valid({ images: [image] }), { now }).images, undefined);
  assert.ok(validateItem(valid({ images: Array(4).fill(image) }), { now }).images);
  assert.ok(validateItem(valid({ images: [{ ...image, type: 'image/svg+xml' }] }), { now }).images);
  assert.ok(
    validateItem(valid({ images: [{ ...image, size: 5 * 1024 * 1024 + 1 }] }), { now }).images,
  );
});
test('image content cannot be missing, an external URL, HTML or malformed base64', () => {
  for (const dataUrl of [
    undefined,
    'https://example.test/image.png',
    'data:text/html;base64,PGgxPmhpPC9oMT4=',
    'data:image/png;base64,NOT-BASE64',
    'data:image/png;base64,',
  ]) {
    assert.ok(validateItem(valid({ images: [{ ...photo(), dataUrl }] }), { now }).images);
  }
});
test('image MIME, actual signature and decoded byte count must agree', () => {
  assert.ok(validateItem(valid({ images: [{ ...photo(), type: 'image/jpeg' }] }), { now }).images);
  assert.ok(validateItem(valid({ images: [{ ...photo(), size: 1 }] }), { now }).images);
  const textBytes = btoa('<html>not an image</html>');
  assert.ok(
    validateItem(
      valid({
        images: [
          {
            type: 'image/png',
            size: atob(textBytes).length,
            dataUrl: `data:image/png;base64,${textBytes}`,
          },
        ],
      }),
      { now },
    ).images,
  );
  const disguisedPng = {
    type: 'image/jpeg',
    size: atob(pngBytes).length,
    dataUrl: `data:image/jpeg;base64,${pngBytes}`,
  };
  assert.ok(validateItem(valid({ images: [disguisedPng] }), { now }).images);
});
test('oversized image content is rejected even with a forged small declared size', () => {
  const dataUrl = `data:image/png;base64,${'A'.repeat(Math.ceil((5 * 1024 * 1024 + 3) / 3) * 4)}`;
  assert.ok(
    validateItem(valid({ images: [{ type: 'image/png', size: 1, dataUrl }] }), { now }).images,
  );
});
test('normal Editor-shaped JPEG can publish, save and reload without changing its content', () => {
  const image = photo('image/jpeg');
  assert.deepEqual(validateItem(valid({ images: [image] }), { now }), {});
  const local = storage();
  const state = createInitialState();
  state.items.push(
    createItem(valid({ images: [image] }), { id: 'photo-item', now, items: state.items }),
  );
  saveState(local, state);
  assert.deepEqual(loadState(local).items.find((item) => item.id === 'photo-item').images, [image]);
});
test('createItem trims input and uses trusted owner/status rather than input overrides', () => {
  const item = createItem(
    valid({ name: ' 红色笔记本 ', ownerId: 'somebody', status: 'completed' }),
    { id: 'new-book', now },
  );
  assert.equal(item.id, 'new-book');
  assert.equal(item.name, '红色笔记本');
  assert.equal(item.ownerId, CURRENT_USER.id);
  assert.equal(item.status, 'active');
  assert.equal(item.createdAt, '2026-10-09T04:00:00.000Z');
});
test('createItem refuses duplicate record ids without overwriting the existing item', () => {
  const before = JSON.stringify(seedItems);
  assert.throws(() => createItem(valid(), { id: 'keys', now, items: seedItems }), /编号已存在/);
  assert.equal(JSON.stringify(seedItems), before);
});
test('createItem validation exposes actionable errors and does not mutate caller input', () => {
  const input = valid({ name: '' });
  assert.throws(
    () => createItem(input, { now }),
    (error) => Boolean(error.errors.name),
  );
  assert.equal(input.name, '');
});
test('separate publications receive different generated ids', () => {
  assert.notEqual(createItem(valid(), { now }).id, createItem(valid(), { now }).id);
});
test('arbitrary name search returns a newly published record', () => {
  const item = createItem(valid(), { now });
  assert.deepEqual(
    searchItems([...seedItems, item], { query: '红色 笔记本' }).map((record) => record.id),
    [item.id],
  );
});
test('umbrella and cup category synonyms work and empty query shows all records', () => {
  assert.deepEqual(
    searchItems(seedItems, { query: '雨伞' }).map((item) => item.id),
    ['umbrella'],
  );
  assert.deepEqual(
    searchItems(seedItems, { query: '杯子' }).map((item) => item.id),
    ['bottle'],
  );
  assert.equal(searchItems(seedItems, { query: '  ' }).length, 3);
});
test('search combines filters without dropping them on a repeated query', () => {
  const filters = {
    query: '雨伞',
    type: 'found',
    category: '雨伞',
    campus: '旗山校区',
    area: '图书馆',
    status: 'active',
  };
  assert.deepEqual(
    searchItems(seedItems, filters).map((item) => item.id),
    ['umbrella'],
  );
  assert.deepEqual(searchItems(seedItems, filters), searchItems(seedItems, filters));
  assert.equal(searchItems(seedItems, { ...filters, category: '钥匙' }).length, 0);
  assert.equal(filters.category, '雨伞');
});
test('unmatched terms or another campus produce a genuine empty result', () => {
  assert.deepEqual(searchItems(seedItems, { query: '紫色滑板' }), []);
  assert.deepEqual(searchItems(seedItems, { campus: '铜盘校区' }), []);
});
test('only the publisher can complete an item even if a caller bypasses the UI', () => {
  assert.throws(() => completeItem(seedItems, 'umbrella', 'me', now), /只有发布者/);
  assert.throws(() => completeItem(seedItems, 'keys', '', now), /只有发布者/);
});
test('owner completion updates the shared record, preserves source data and labels found correctly', () => {
  const result = completeItem(seedItems, 'keys', 'me', now);
  assert.notEqual(result, seedItems);
  assert.equal(seedItems.find((item) => item.id === 'keys').status, 'active');
  assert.equal(result.find((item) => item.id === 'keys').completionLabel, '已归还');
  assert.equal(searchItems(result, { query: '钥匙', status: 'active' }).length, 0);
  assert.equal(searchItems(result, { query: '钥匙', status: 'completed' }).length, 1);
});
test('lost item owner marks it found and repeated completion is idempotent', () => {
  const first = completeItem(seedItems, 'bottle', 'demo-student', now);
  assert.equal(first.find((item) => item.id === 'bottle').completionLabel, '已找到');
  const second = completeItem(first, 'bottle', 'demo-student', '2026-10-10T12:00:00+08:00');
  assert.deepEqual(second, first);
});
test('a stale or nonexistent detail cannot complete a different record', () => {
  assert.throws(() => completeItem(seedItems, 'missing', 'me', now), /不存在/);
});
test('drafts allow partial input and repeated saving updates one record', () => {
  const first = upsertDraft([], { id: 'work', ownerId: 'me', name: '未写完' });
  const second = upsertDraft(first, { id: 'work', ownerId: 'me', name: '继续填写' });
  assert.equal(second.length, 1);
  assert.equal(second[0].name, '继续填写');
  assert.equal(second[0].status, 'draft');
  assert.equal(first[0].name, '未写完');
});
test('saving a draft cannot overwrite another users draft with the same id', () => {
  assert.throws(
    () => upsertDraft([{ id: 'private', ownerId: 'other' }], { id: 'private', ownerId: 'me' }),
    /其他用户/,
  );
});
test('draft picture checks do not introduce required publication fields', () => {
  const draft = { id: 'partial-photo', ownerId: 'me', images: [photo()] };
  const state = createInitialState();
  state.drafts = upsertDraft([], draft);
  const local = storage();
  saveState(local, state);
  assert.equal(loadState(local).drafts[0].name, undefined);
  assert.deepEqual(loadState(local).drafts[0].images, [photo()]);
  assert.throws(
    () =>
      upsertDraft([], {
        ...draft,
        images: [{ ...photo(), dataUrl: 'https://example.test/image.png' }],
      }),
    /草稿图片无效/,
  );
});
test('seed data supplies the three prototype cards and four independent drafts', () => {
  assert.deepEqual(
    seedItems.map((item) => item.id),
    ['umbrella', 'keys', 'bottle'],
  );
  assert.equal(seedDrafts.length, 4);
  assert.equal(seedDrafts.find((item) => item.kind === 'transfer').status, 'draft');
  const state = createInitialState();
  state.items[0].name = 'changed';
  assert.equal(createInitialState().items[0].name, '浅蓝折叠伞');
});
test('empty storage is distinct from corrupt data', () => {
  assert.equal(loadState(storage()), null);
  const local = storage();
  local.setItem(STORAGE_KEY, '{invalid');
  assert.throws(() => loadState(local), /已损坏/);
});
test('published changes and owner state survive storage roundtrip', () => {
  const local = storage();
  const state = createInitialState();
  state.items = completeItem(state.items, 'keys', 'me', now);
  saveState(local, state);
  const reloaded = loadState(local);
  assert.equal(reloaded.schemaVersion, 1);
  assert.equal(reloaded.items.find((item) => item.id === 'keys').status, 'completed');
  assert.equal(reloaded.currentUser.id, 'me');
  assert.equal(reloaded.drafts.length, 4);
});
test('invalid pictures in items or drafts cannot overwrite previously saved valid state', () => {
  for (const collection of ['items', 'drafts']) {
    const local = storage();
    saveState(local, createInitialState());
    const before = local.getItem(STORAGE_KEY);
    const state = createInitialState();
    state[collection][0].images = [{ ...photo(), dataUrl: 'https://example.test/image.png' }];
    assert.throws(() => saveState(local, state), /图片无效/);
    assert.equal(local.getItem(STORAGE_KEY), before);
  }
});
test('loadState rejects invalid stored pictures in both items and incomplete drafts', () => {
  for (const collection of ['items', 'drafts']) {
    const local = storage();
    const state = createInitialState();
    if (collection === 'drafts') state.drafts = [{ id: 'partial', ownerId: 'me' }];
    state[collection][0].images = [{ type: 'image/png', size: 1 }];
    local.setItem(STORAGE_KEY, JSON.stringify(state));
    assert.throws(() => loadState(local), /图片无效/);
  }
});
test('unsupported schemas and duplicate ids fail explicitly instead of overwriting records', () => {
  const local = storage();
  local.setItem(STORAGE_KEY, JSON.stringify({ ...createInitialState(), schemaVersion: 9 }));
  assert.throws(() => loadState(local), /版本不兼容/);
  const state = createInitialState();
  state.items.push({ ...state.items[0] });
  assert.throws(() => saveState(local, state), /编号重复/);
});
test('storage permission and quota errors never claim a successful save', () => {
  assert.throws(
    () =>
      loadState({
        getItem() {
          throw new Error('blocked');
        },
      }),
    /存储权限/,
  );
  assert.throws(
    () =>
      saveState(
        {
          setItem() {
            throw new Error('quota');
          },
        },
        createInitialState(),
      ),
    /尚未持久保存/,
  );
});
