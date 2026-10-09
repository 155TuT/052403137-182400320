import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateLabel } from '../src/dateLabel.js';
import { STORAGE_KEY, loadState } from '../src/model.js';
import { createInitialState } from '../src/seed.js';

// 固定时钟：本地 2026-10-09 正午，覆盖跨日/跨月/跨年恢复，不依赖真实等待或系统时间。
const now = new Date('2026-10-09T12:00:00');

const item = (extra = {}) => ({
  id: 'x',
  type: 'found',
  name: '测试物品',
  category: '其他',
  campus: '旗山校区',
  area: '测试区',
  eventDate: '',
  description: '',
  contact: 'demo@example.test',
  status: 'active',
  ...extra,
});

test('today is labelled 今天 with the action suffix', () => {
  assert.equal(formatDateLabel(item({ eventDate: '2026-10-09' }), { now }), '今天拾得');
  assert.equal(
    formatDateLabel(item({ eventDate: '2026-10-09', type: 'lost' }), { now }),
    '今天遗失',
  );
});

test('yesterday and the day before yesterday are relative to the fixed clock', () => {
  assert.equal(formatDateLabel(item({ eventDate: '2026-10-08', type: 'lost' }), { now }), '昨天遗失');
  assert.equal(formatDateLabel(item({ eventDate: '2026-10-07' }), { now }), '前天拾得');
});

test('a concrete eventTime is preserved without becoming a hardcoded relative label', () => {
  assert.equal(
    formatDateLabel(item({ eventDate: '2026-10-09', eventTime: '09:00' }), { now }),
    '今天 09:00 拾得',
  );
  assert.equal(
    formatDateLabel(item({ eventDate: '2026-10-08', type: 'lost', eventTime: '09:00' }), { now }),
    '昨天 09:00 遗失',
  );
});

test('transfer relation uses 线索 instead of 拾得', () => {
  assert.equal(
    formatDateLabel(item({ eventDate: '2026-10-09', relation: 'transfer' }), { now }),
    '今天线索',
  );
});

test('older dates fall back to an absolute month/day label across month and year', () => {
  assert.equal(formatDateLabel(item({ eventDate: '2026-09-26' }), { now }), '9月26日拾得');
  assert.equal(
    formatDateLabel(item({ eventDate: '2025-12-31', type: 'lost' }), { now }),
    '12月31日遗失',
  );
});

test('missing or malformed eventDate keeps an explicit unknown prompt', () => {
  assert.equal(formatDateLabel(item({ eventDate: '' }), { now }), '时间不确定');
  assert.equal(formatDateLabel(item({ eventDate: undefined }), { now }), '时间不确定');
  assert.equal(formatDateLabel(item({ eventDate: 'not-a-date' }), { now }), '时间不确定');
});

test('loadState migrates legacy timeLabel to eventTime and drops the stale label', () => {
  const storage = () => {
    const values = new Map();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
  };
  const local = storage();
  const state = createInitialState();
  state.items = state.items.map((record) => {
    if (record.id === 'keys') {
      // 旧记录不含 eventTime，只有相对文案 timeLabel；迁移应从中提取出具体时间。
      const { eventTime, ...legacy } = record;
      return { ...legacy, timeLabel: '今天 09:00' };
    }
    if (record.id === 'bottle') return { ...record, timeLabel: '昨天遗失' };
    if (record.id === 'umbrella') return { ...record, timeLabel: '9月26日拾得' };
    return record;
  });
  local.setItem(STORAGE_KEY, JSON.stringify(state));
  const loaded = loadState(local);
  const keys = loaded.items.find((record) => record.id === 'keys');
  const bottle = loaded.items.find((record) => record.id === 'bottle');
  const umbrella = loaded.items.find((record) => record.id === 'umbrella');
  assert.equal(keys.timeLabel, undefined);
  assert.equal(keys.eventTime, '09:00');
  assert.equal(bottle.timeLabel, undefined);
  assert.equal(bottle.eventTime, undefined);
  assert.equal(umbrella.timeLabel, undefined);
  assert.equal(umbrella.eventTime, undefined);

  // 迁移后，用固定时钟验证“第二天”的展示结果与 eventDate 一致。
  const nextDay = new Date(`${keys.eventDate}T12:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  assert.equal(formatDateLabel(keys, { now: nextDay }), '昨天 09:00 拾得');
});
