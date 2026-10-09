/** Local coursework data model. Browser storage is persistence, not server authentication. */
import { CATEGORIES, getItemIcon } from './itemPresentation.js';
export { CATEGORIES };
export const CURRENT_USER = Object.freeze({ id: 'me', name: '小拾同学' });
export const CAMPUSES = Object.freeze(['旗山校区', '铜盘校区']);
export const STORAGE_KEY = 'shiban-state-v1';
export const SCHEMA_VERSION = 1;

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const length = (value) => [...value].length;
const copy = (value) => JSON.parse(JSON.stringify(value));
const normalized = (value) =>
  text(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ');
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isAny = (value) => !value || ['all', '全部', '不限'].includes(value);

function dateOf(now = new Date()) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error('时间无效，请检查设备日期。');
  return date;
}

function localDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function newId(prefix) {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function contactIsValid(contact) {
  // A named method is accepted; contact need not be a telephone number.
  const compact = contact.replace(/\s+/g, '');
  const email = compact.replace(/^(?:示例)?(?:邮箱|email)[:：]/i, '');
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return true;
  if (/^(?:(?:示例)?QQ[:：]?)?[1-9]\d{4,12}$/i.test(compact)) return true;
  if (/^(?:(?:电话|手机|tel)[:：]?)?\+?[\d()\-]{7,22}$/i.test(compact)) return true;
  if (/^(?:示例)?(?:微信|wechat)[:：]?[a-zA-Z][a-zA-Z\d_-]{5,19}$/i.test(compact)) return true;
  return false;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function imageError(images) {
  if (images === undefined) return '';
  if (!Array.isArray(images) || images.length > 3) return '最多添加 3 张图片。';
  for (const image of images) {
    if (
      !isObject(image) ||
      !['image/jpeg', 'image/png'].includes(image.type) ||
      !Number.isSafeInteger(image.size) ||
      image.size <= 0 ||
      image.size > MAX_IMAGE_BYTES
    ) {
      return '图片需为 JPG / PNG，且每张不超过 5 MB。';
    }
    if (typeof image.dataUrl !== 'string') return '图片内容缺失，请重新选择图片。';
    const header = /^data:(image\/(?:png|jpeg));base64,/i.exec(image.dataUrl);
    if (!header || header[1].toLowerCase() !== image.type)
      return '图片内容必须为与文件类型一致的 JPG / PNG 本地图片。';
    const encoded = image.dataUrl.slice(header[0].length);
    // Bound input before decoding; the caller-supplied size alone cannot enforce the limit.
    if (
      !encoded ||
      encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
      encoded.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
    ) {
      return '图片内容无效或超过 5 MB，请重新选择图片。';
    }
    let bytes;
    try {
      bytes = atob(encoded);
      if (btoa(bytes) !== encoded) return '图片编码无效，请重新选择图片。';
    } catch {
      return '图片编码无效，请重新选择图片。';
    }
    if (bytes.length !== image.size || bytes.length > MAX_IMAGE_BYTES)
      return '图片大小与内容不一致，请重新选择图片。';
    const startsWith = (signature) =>
      signature.every((byte, index) => bytes.charCodeAt(index) === byte);
    const validSignature =
      image.type === 'image/png'
        ? startsWith([137, 80, 78, 71, 13, 10, 26, 10])
        : startsWith([255, 216, 255]) &&
          bytes.charCodeAt(bytes.length - 2) === 255 &&
          bytes.charCodeAt(bytes.length - 1) === 217;
    if (!validSignature) return '图片内容与 JPG / PNG 格式不一致，请重新选择图片。';
  }
  return '';
}

/** Empty eventDate means the event time is unknown; other fields retain their input on errors. */
export function validateItem(input, { now = new Date() } = {}) {
  const item = isObject(input) ? input : {};
  const errors = {};
  if (!['lost', 'found'].includes(item.type)) errors.type = '请选择寻物或招领。';
  const name = text(item.name);
  if (!name) errors.name = '请填写物品名称。';
  else if (length(name) > 30) errors.name = '物品名称不能超过 30 个字。';
  if (!CATEGORIES.includes(text(item.category)))
    errors.category = '请选择物品类别，不确定时可选“其他”。';
  if (!CAMPUSES.includes(text(item.campus))) errors.campus = '请选择校区。';
  const area = text(item.area);
  if (!area) errors.area = '请填写遗失或拾取区域，不确定时可填写“区域不确定”。';
  else if (length(area) > 60) errors.area = '地点不能超过 60 个字。';
  const eventDate = text(item.eventDate);
  if (eventDate && !validDay(eventDate)) errors.eventDate = '请填写有效日期。';
  else if (eventDate && eventDate > localDay(dateOf(now)))
    errors.eventDate = '遗失或拾取日期不能晚于今天。';
  if (length(text(item.description)) > 300) errors.description = '补充描述不能超过 300 个字。';
  const contact = text(item.contact);
  if (!contact) errors.contact = '请留下邮箱、电话、QQ 或微信，方便对方联系。';
  else if (length(contact) > 80 || !contactIsValid(contact))
    errors.contact = '请填写有效邮箱、电话号码，或注明 QQ / 微信号码。';
  const imagesError = imageError(item.images);
  if (imagesError) errors.images = imagesError;
  return errors;
}

const aliases = Object.freeze({
  雨伞: '雨伞 伞 折叠伞 umbrella',
  钥匙: '钥匙 钥匙串 keys key',
  水杯: '水杯 保温杯 杯子 杯具 bottle cup',
  数码: '数码 电子产品',
});

/** Search is derived from current records; it never mutates items or silently resets filters. */
export function searchItems(items, filters = {}) {
  if (!Array.isArray(items)) throw new Error('物品列表格式无效。');
  const terms = normalized(filters.query).split(' ').filter(Boolean);
  return items.filter((item) => {
    for (const field of ['type', 'category', 'campus', 'status']) {
      if (!isAny(filters[field]) && item[field] !== filters[field]) return false;
    }
    if (!isAny(filters.area) && !normalized(item.area).includes(normalized(filters.area)))
      return false;
    const haystack = normalized(
      [
        item.name,
        item.description,
        item.category,
        item.campus,
        item.area,
        aliases[item.category] || '',
      ]
        .filter(Boolean)
        .join(' '),
    );
    return terms.every((term) => haystack.includes(term));
  });
}

/** Pass existing items to reject an explicit id collision before appending the returned item. */
export function createItem(
  input,
  { ownerId = CURRENT_USER.id, id, now = new Date(), items = [] } = {},
) {
  const date = dateOf(now);
  const errors = validateItem(input, { now: date });
  if (Object.keys(errors).length) {
    const error = new Error('请检查发布信息。');
    error.errors = errors;
    throw error;
  }
  if (!text(ownerId)) throw new Error('发布者身份无效。');
  if (!Array.isArray(items)) throw new Error('物品列表格式无效。');
  const itemId = id === undefined ? newId('item') : text(id);
  if (!itemId) throw new Error('物品编号不能为空。');
  if (items.some((item) => item.id === itemId)) throw new Error('物品编号已存在，请勿重复发布。');
  const createdAt = date.toISOString();
  return {
    ...copy(input),
    id: itemId,
    ownerId: text(ownerId),
    type: input.type,
    name: text(input.name),
    category: text(input.category),
    campus: text(input.campus),
    area: text(input.area),
    eventDate: text(input.eventDate),
    description: text(input.description),
    contact: text(input.contact),
    status: 'active',
    image: getItemIcon(input),
    color: text(input.color) || '#e6efeb',
    createdAt,
    updatedAt: createdAt,
  };
}

export function completeItem(items, id, actorId, now = new Date()) {
  if (!Array.isArray(items)) throw new Error('物品列表格式无效。');
  const item = items.find((record) => record.id === id);
  if (!item) throw new Error('这条信息不存在或已被移除。');
  if (!actorId || item.ownerId !== actorId) throw new Error('只有发布者本人可以更新这条信息。');
  if (item.status === 'completed') return items.slice();
  if (item.status !== 'active') throw new Error('这条信息当前不能结案。');
  const updatedAt = dateOf(now).toISOString();
  return items.map((record) =>
    record.id === id
      ? {
          ...record,
          status: 'completed',
          updatedAt,
          completedAt: updatedAt,
          completionLabel: record.type === 'lost' ? '已找到' : '已归还',
        }
      : record,
  );
}

/** Partial drafts may omit required publish fields; a draft id cannot change its owner. */
export function upsertDraft(drafts, draft) {
  if (!Array.isArray(drafts) || !isObject(draft)) throw new Error('草稿格式无效。');
  const id = text(draft.id) || newId('draft');
  const ownerId = text(draft.ownerId) || CURRENT_USER.id;
  const previous = drafts.find((record) => record.id === id);
  if (previous && previous.ownerId !== ownerId) throw new Error('不能修改其他用户的草稿。');
  const updated = {
    ...previous,
    ...copy(draft),
    id,
    ownerId,
    status: 'draft',
    updatedAt: dateOf().toISOString(),
  };
  updated.image = getItemIcon(updated);
  const imagesError = imageError(updated.images);
  if (imagesError) throw new Error(`草稿图片无效：${imagesError}`);
  return previous
    ? drafts.map((record) => (record.id === id ? updated : record))
    : [updated, ...drafts];
}

function validateState(state) {
  if (
    !isObject(state) ||
    !Array.isArray(state.items) ||
    !Array.isArray(state.drafts) ||
    !isObject(state.currentUser) ||
    !text(state.currentUser.id) ||
    !text(state.currentUser.name)
  ) {
    throw new Error('本地数据结构无效，无法读取或保存。');
  }
  for (const [label, records] of [
    ['物品', state.items],
    ['草稿', state.drafts],
  ]) {
    const ids = new Set();
    for (const record of records) {
      if (!isObject(record) || !text(record.id) || !text(record.ownerId))
        throw new Error(`${label}记录缺少编号或所有者。`);
      if (ids.has(record.id)) throw new Error(`${label}编号重复，已阻止覆盖数据。`);
      ids.add(record.id);
      if (
        label === '物品' &&
        (!['found', 'lost'].includes(record.type) ||
          !['active', 'completed'].includes(record.status) ||
          !text(record.name))
      )
        throw new Error('物品类型、名称或状态无效。');
      const imagesError = imageError(record.images);
      if (imagesError) throw new Error(`${label}图片无效：${imagesError}`);
    }
  }
}

export function loadState(storage) {
  if (!storage || typeof storage.getItem !== 'function')
    throw new Error('浏览器未提供可用的本地存储。');
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    throw new Error('无法读取本地数据，请检查浏览器的存储权限。');
  }
  if (raw === null) return null;
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    throw new Error('本地数据已损坏，无法解析；请先备份再重置演示数据。');
  }
  if (!isObject(state) || state.schemaVersion !== SCHEMA_VERSION)
    throw new Error('本地数据版本不兼容，请先备份再重置演示数据。');
  validateState(state);
  return state;
}

export function saveState(storage, state) {
  if (!storage || typeof storage.setItem !== 'function')
    throw new Error('浏览器未提供可用的本地存储。');
  validateState(state);
  let serialized;
  try {
    serialized = JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION });
  } catch {
    throw new Error('本地数据无法序列化，未保存本次修改。');
  }
  try {
    storage.setItem(STORAGE_KEY, serialized);
  } catch {
    throw new Error('保存失败：本地存储空间不足或访问被阻止；本次修改尚未持久保存。');
  }
  return JSON.parse(serialized);
}
