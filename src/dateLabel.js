/** 绝对日期 → 相对展示文案，基于当前本地日期动态计算；now 可注入便于测试。 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function localDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function actionOf(item) {
  if (item.type === 'lost') return '遗失';
  if (item.relation === 'transfer') return '线索';
  return '拾得';
}

export function formatDateLabel(item, { now = new Date() } = {}) {
  const eventDate = typeof item?.eventDate === 'string' ? item.eventDate : '';
  if (!DAY_RE.test(eventDate)) return '时间不确定';

  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (Number.isNaN(current.getTime())) return '时间不确定';

  const today = localDay(current);
  const yesterday = new Date(current);
  yesterday.setDate(yesterday.getDate() - 1);
  const beforeYesterday = new Date(current);
  beforeYesterday.setDate(beforeYesterday.getDate() - 2);

  let day;
  if (eventDate === today) day = '今天';
  else if (eventDate === localDay(yesterday)) day = '昨天';
  else if (eventDate === localDay(beforeYesterday)) day = '前天';
  else {
    const [, month, dayOfMonth] = eventDate.split('-');
    day = `${Number(month)}月${Number(dayOfMonth)}日`;
  }

  const time =
    typeof item?.eventTime === 'string' && item.eventTime.trim()
      ? ` ${item.eventTime.trim()} `
      : '';
  return `${day}${time}${actionOf(item)}`;
}
