import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CATEGORIES,
  getItemIcon,
  getItemTitle,
  getItemPhotoUrls,
} from '../src/itemPresentation.js';
import {
  CATEGORIES as MODEL_CATEGORIES,
  createItem,
  upsertDraft,
  saveState,
  loadState,
} from '../src/model.js';
import { createInitialState } from '../src/seed.js';

const categoryIcons = [
  ['雨伞', 'umbrella'],
  ['钥匙', 'keys'],
  ['水杯', 'bottle'],
  ['数码', 'electronics'],
  ['证件', 'id-card'],
  ['书本文具', 'books'],
  ['其他', 'other'],
];
const now = '2026-10-09T12:00:00+08:00';
const pngBytes =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const pngUrl = `data:image/png;base64,${pngBytes}`;
const photo = { type: 'image/png', size: atob(pngBytes).length, dataUrl: pngUrl };
const valid = (extra = {}) => ({
  type: 'found',
  name: '银色钥匙串',
  category: '钥匙',
  campus: '旗山校区',
  area: '教学楼 101',
  eventDate: '2026-10-08',
  description: '待核对物品特征。',
  contact: 'student@example.test',
  ...extra,
});

test('every selectable category has a distinct icon for both lost and found items', () => {
  assert.deepEqual(
    CATEGORIES,
    categoryIcons.map(([category]) => category),
  );
  assert.deepEqual(MODEL_CATEGORIES, CATEGORIES);
  for (const [category, icon] of categoryIcons) {
    for (const type of ['lost', 'found']) {
      assert.equal(getItemIcon({ category, type }), icon, `${category}/${type}`);
    }
  }
  assert.equal(new Set(categoryIcons.map(([, icon]) => icon)).size, CATEGORIES.length);
});

test('current category wins over stale images and misleading names', () => {
  for (const [category, icon] of categoryIcons) {
    for (const image of ['keys', 'umbrella.svg', 'bottle', 'service', '../keys', '']) {
      const item = { category, image, name: '雨伞钥匙保温杯', type: 'lost' };
      assert.equal(getItemIcon(item), icon, `${category}/${image}`);
    }
  }
});

test('missing or unknown categories use the neutral asset even with old named icons', () => {
  for (const item of [
    undefined,
    null,
    {},
    { category: '', image: 'keys', name: '钥匙' },
    { category: '历史分类', image: 'bottle', name: '保温杯' },
  ]) {
    assert.equal(getItemIcon(item), 'other');
  }
});

test('detail titles follow category instead of a stale decorative image', () => {
  for (const category of CATEGORIES) {
    for (const type of ['lost', 'found']) {
      const current = { category, type, status: 'active' };
      const title = getItemTitle(current);
      assert.ok(typeof title === 'string' && title.length > 0);
      for (const image of ['keys', 'bottle', 'umbrella', 'service']) {
        assert.equal(getItemTitle({ ...current, image }), title);
      }
    }
  }
  assert.notEqual(
    getItemTitle({ category: '水杯', type: 'found', image: 'keys' }),
    getItemTitle({ category: '钥匙', type: 'found' }),
  );
  assert.equal(
    getItemTitle({ category: '水杯', type: 'lost', image: 'keys' }),
    '帮我留意这只小杯子',
  );
});

test('completion and transfer titles retain their business meaning across categories', () => {
  for (const category of CATEGORIES) {
    const item = { category, type: 'found', status: 'active', image: 'keys' };
    assert.equal(getItemTitle({ ...item, relation: 'transfer' }), '这条线索，还待核实');
    assert.equal(getItemTitle({ ...item, relation: 'service' }), '服务点移交，待确认');
    assert.equal(getItemTitle({ ...item, status: 'completed' }), '它已经回家啦');
    assert.equal(getItemTitle({ ...item, relation: 'transfer' }, true), '它已经回家啦');
    assert.equal(getItemTitle({ ...item, status: 'completed' }, false), getItemTitle(item));
  }
});

test('new publications store the selected category icon for all seven categories', () => {
  for (const [category, icon] of categoryIcons) {
    const item = createItem(valid({ category, image: 'keys' }), { now });
    assert.equal(item.image, icon, category);
  }
});

test('editing keys into a cup updates draft and publication without losing uploaded photos', () => {
  const original = upsertDraft([], {
    ...valid(),
    id: 'changing-category',
    ownerId: 'me',
    image: 'keys',
    images: [photo],
  });
  const changed = upsertDraft(original, {
    id: 'changing-category',
    ownerId: 'me',
    name: '黑色保温杯',
    category: '水杯',
    image: 'keys',
  });
  assert.equal(original[0].category, '钥匙');
  assert.equal(original[0].image, 'keys');
  assert.equal(changed[0].image, 'bottle');
  assert.deepEqual(changed[0].images, [photo]);
  assert.deepEqual(getItemPhotoUrls(changed[0]), [pngUrl]);

  const published = createItem(changed[0], { id: 'published-cup', now });
  assert.equal(published.category, '水杯');
  assert.equal(published.image, 'bottle');
  assert.deepEqual(published.images, [photo]);
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const state = createInitialState();
  state.items.push(published);
  state.drafts = changed;
  saveState(storage, state);
  const reloaded = loadState(storage);
  for (const item of [reloaded.items.at(-1), reloaded.drafts[0]]) {
    assert.equal(getItemIcon(item), 'bottle');
    assert.equal(item.image, 'bottle');
    assert.deepEqual(item.images, [photo]);
    assert.deepEqual(getItemPhotoUrls(item), [pngUrl]);
    assert.equal(getItemTitle(item), getItemTitle({ category: '水杯', type: 'found' }));
  }
});

test('partial draft updates keep the saved category while repairing its old image', () => {
  const legacy = [{ ...valid({ category: '数码' }), id: 'legacy', ownerId: 'me', image: 'keys' }];
  const updated = upsertDraft(legacy, { id: 'legacy', ownerId: 'me', description: '新说明' });
  assert.equal(updated[0].category, '数码');
  assert.equal(updated[0].image, 'electronics');
  assert.equal(legacy[0].image, 'keys');
  assert.equal(upsertDraft([], { id: 'empty-category', name: '未完成' })[0].image, 'other');
});

test('photo extraction preserves valid local photos in input order and limits the result to three', () => {
  const gifUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  const webpUrl = 'data:image/webp;base64,UklGRg==';
  const jpegUrl = 'data:image/jpeg;base64,/9j/2Q==';
  const images = [
    'https://example.test/external.png',
    photo,
    gifUrl,
    { dataUrl: webpUrl },
    jpegUrl,
  ];
  const before = structuredClone(images);
  assert.deepEqual(getItemPhotoUrls({ category: '钥匙', image: 'keys', images }), [
    pngUrl,
    gifUrl,
    webpUrl,
  ]);
  assert.deepEqual(images, before);
  assert.deepEqual(getItemPhotoUrls({ images: [{ dataUrl: jpegUrl }] }), [jpegUrl]);
});

test('photos cannot request external resources or replace local image data with SVG or HTML', () => {
  const images = [
    null,
    {},
    { dataUrl: 42 },
    'https://example.test/photo.jpg',
    '//example.test/photo.jpg',
    'blob:https://example.test/photo',
    '/assets/keys.svg',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:text/html;base64,PGgxPkhlbGxvPC9oMT4=',
    'data:image/png,not-base64',
  ];
  assert.deepEqual(getItemPhotoUrls({ images }), []);
  for (const item of [undefined, null, {}, { images: [] }, { images: 'not-an-array' }]) {
    assert.deepEqual(getItemPhotoUrls(item), []);
  }
});

test('all category icons resolve to self-contained local SVG assets', async () => {
  for (const [category] of categoryIcons) {
    const icon = getItemIcon({ category });
    assert.match(icon, /^[a-z-]+$/);
    const source = await readFile(new URL(`../public/assets/${icon}.svg`, import.meta.url), 'utf8');
    assert.match(source, /<svg\b/);
    assert.match(source, /\bviewBox\s*=/);
    assert.doesNotMatch(source, /(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/i);
    assert.doesNotMatch(source, /url\(\s*["']?\s*(?:https?:|\/\/)/i);
  }
});
