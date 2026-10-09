// Category is the source of truth for default artwork, never the legacy image field.
const categories = Object.freeze({
  雨伞: { icon: 'umbrella', found: '有把伞在等主人', lost: '帮我留意这把雨伞' },
  钥匙: { icon: 'keys', found: '这串钥匙，在等你', lost: '帮我留意这串钥匙' },
  水杯: { icon: 'bottle', found: '这只水杯，在等主人', lost: '帮我留意这只小杯子' },
  数码: { icon: 'electronics', found: '这件数码小物，在等主人', lost: '帮我留意这件数码小物' },
  证件: { icon: 'id-card', found: '这张证件，在等主人', lost: '帮我留意这张证件' },
  书本文具: { icon: 'books', found: '这些书本文具，在等主人', lost: '帮我留意这些书本文具' },
  其他: { icon: 'other', found: '有件小物，在等主人', lost: '帮我留意这件小物' },
});

export const CATEGORIES = Object.freeze(Object.keys(categories));

function categoryOf(item) {
  const category = typeof item?.category === 'string' ? item.category.trim() : '';
  return Object.hasOwn(categories, category) ? categories[category] : categories.其他;
}

export function getItemIcon(item) {
  return categoryOf(item).icon;
}

export function getItemTitle(item, completed = item?.status === 'completed') {
  if (completed) return '它已经回家啦';
  if (item?.type === 'lost') return categoryOf(item).lost;
  if (item?.relation === 'transfer') return '这条线索，还待核实';
  if (item?.relation === 'service') return '服务点移交，待确认';
  return categoryOf(item).found;
}

export function getItemPhotoUrls(item) {
  return (Array.isArray(item?.images) ? item.images : [])
    .map((image) => (typeof image === 'string' ? image : image?.dataUrl))
    .filter(
      (url) => typeof url === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(url),
    )
    .slice(0, 3);
}
