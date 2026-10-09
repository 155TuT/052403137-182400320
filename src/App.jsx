import React, { useEffect, useRef, useState } from 'react';
import { createInitialState } from './seed.js';
import {
  CAMPUSES,
  CURRENT_USER,
  STORAGE_KEY,
  loadState,
  updateState,
  captureRecord,
  createEditSession,
  searchItems,
  createItem,
  completeItem,
  upsertDraft,
  isDraftStale,
} from './model.js';
import {
  Icon,
  ItemArtwork,
  Glyph,
  Button,
  PageHeader,
  PageTitle,
  Hero,
  InfoCard,
  EmptyState,
} from './ui.jsx';
import { getItemIcon } from './itemPresentation.js';
import Editor from './Editor.jsx';
import Detail from './Detail.jsx';
import StaleDraft from './StaleDraft.jsx';
import Activity from './Activity.jsx';
import Search from './Search.jsx';
import { formatDateLabel } from './dateLabel.js';

const presets = [
  { label: '全部校园信息', category: '', area: '', days: 0 },
  { label: '雨伞 · 图书馆 · 近 7 天', category: '雨伞', area: '图书馆', days: 7 },
  { label: '钥匙 · 教学区 · 今天', category: '钥匙', area: '教学区', days: 1 },
  { label: '水杯 · 食堂 · 近 7 天', category: '水杯', area: '食堂', days: 7 },
];
const statusOf = (item) =>
  item.status === 'completed'
    ? item.type === 'lost'
      ? '已找到'
      : '已归还'
    : item.type === 'lost'
      ? '正在寻找'
      : item.custody || '等待认领';
const dateOf = (item) => formatDateLabel(item);

function ItemCard({ item, onOpen }) {
  return (
    <button
      className="item-card"
      onClick={() => onOpen(item)}
      aria-label={`${item.name}，${statusOf(item)}，查看详情`}
    >
      <div
        className={`item-picture ${getItemIcon(item) === 'umbrella' ? 'item-picture--tall' : ''}`}
        style={{ background: item.color || '#e1e7d8' }}
      >
        <ItemArtwork item={item} size={112} photoClassName="item-photo" />
      </div>
      <div className="item-copy">
        <span className={`type-chip ${item.type === 'lost' ? 'type-chip--lost' : ''}`}>
          {item.type === 'lost' ? '寻物' : '招领'}
        </span>
        <h3>{item.name}</h3>
        <p>{item.area}</p>
        <p>{dateOf(item)}</p>
        <strong className={item.status === 'completed' ? 'completed-label' : ''}>
          {statusOf(item)}
        </strong>
      </div>
    </button>
  );
}
function ItemGrid({ items, onOpen }) {
  if (!items.length) return <EmptyState />;
  return (
    <div className="item-grid">
      {[0, 1].map((column) => (
        <div className="item-column" key={column}>
          {items.map(
            (item, i) => i % 2 === column && <ItemCard key={item.id} item={item} onOpen={onOpen} />,
          )}
        </div>
      ))}
    </div>
  );
}
function Overlay({ children, onClose, className = '', title }) {
  const container = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    container.current?.querySelector('button')?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  function keys(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
    if (event.key === 'Tab') {
      const controls = [
        ...container.current.querySelectorAll(
          'button:not([disabled]), input, select, textarea, [tabindex="0"]',
        ),
      ];
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      }
      if (!event.shiftKey && document.activeElement === controls.at(-1)) {
        event.preventDefault();
        controls[0]?.focus();
      }
    }
  }
  return (
    <div
      className={`overlay ${className}`}
      onClick={(event) => event.target === event.currentTarget && onClose()}
      onKeyDown={keys}
    >
      <section ref={container} role="dialog" aria-modal="true" aria-label={title}>
        {children}
      </section>
    </div>
  );
}
function PublishMenu({ onClose, onChoose, onDrafts }) {
  const relations = [
    ['lost', '我丢东西了', '发一条寻物，让更多人帮你留意', 'search'],
    ['found', '我捡到了', '物品在我这里，等主人来认领', 'keys'],
    ['service', '已交服务点', '登记接收信息，等工作人员确认', 'service'],
    ['transfer', '转报一条线索', '我没有实物，先帮助核实来源', 'publish'],
  ];
  return (
    <Overlay title="选择发布关系" className="publish-overlay" onClose={onClose}>
      <div className="publish-stack">
        <div className="publish-base">
          <button className="draft-shortcut" onClick={onDrafts}>
            <Icon name="drafts" />
            草稿箱
          </button>
          <button className="publish-close" aria-label="关闭发布菜单" onClick={onClose}>
            <Glyph name="close" size={24} />
          </button>
        </div>
        {relations.map(([kind, title, subtitle, icon], i) => (
          <button
            key={kind}
            className={`relation relation--${kind}`}
            style={{ top: 174 + i * 88, zIndex: 5 - i }}
            onClick={() => onChoose(kind)}
          >
            <span className="relation-icon">
              <Icon name={icon} size={52} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{subtitle}</small>
            </span>
            <Glyph name="right" />
          </button>
        ))}
        <div className="publish-intro">
          <p>发布一件小事</p>
          <Icon name="publish" size={60} />
          <h2>你和这件小物的关系是？</h2>
          <p>先选关系，再用一分钟把信息说清楚。</p>
        </div>
      </div>
    </Overlay>
  );
}
function FilterMenu({ value, onApply, onClose }) {
  const [choice, setChoice] = useState(value);
  return (
    <Overlay title="筛选校园信息" className="filter-overlay" onClose={onClose}>
      <div className="filter-sheet">
        <div className="sheet-heading">
          <h2>筛选</h2>
          <button className="round-button" aria-label="关闭筛选" onClick={onClose}>
            <Glyph name="close" />
          </button>
        </div>
        <p className="muted">选择一组类别、区域和时间</p>
        <div className="filter-options">
          {presets.map((preset, i) => (
            <button
              key={i}
              className={choice === i ? 'selected' : ''}
              onClick={() => setChoice(i)}
              aria-pressed={choice === i}
            >
              {choice === i ? '✓ ' : ''}
              {preset.label}
            </button>
          ))}
        </div>
        <p className="muted">当前：{choice ? presets[choice].label : '全部 / 不限 / 不限'}</p>
        <div className="two-actions">
          <Button variant="secondary" onClick={() => setChoice(0)}>
            重置
          </Button>
          <Button onClick={() => onApply(choice)}>查看结果</Button>
        </div>
      </div>
    </Overlay>
  );
}
function readInitial() {
  try {
    return { state: loadState(localStorage) || createInitialState(), error: '' };
  } catch (error) {
    return { state: createInitialState(), error: error.message };
  }
}

export default function App() {
  const [initial] = useState(readInitial);
  const [data, setData] = useState(initial.state);
  const dataRef = useRef(data);
  const [route, setRoute] = useState({ page: 'home' });
  const [trail, setTrail] = useState([]);
  const [modal, setModal] = useState(null);
  const [campus, setCampus] = useState(CAMPUSES[0]);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const [filter, setFilter] = useState(0);
  const [mineTab, setMineTab] = useState('published');
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(initial.error);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3400);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function onStorage(event) {
      if (event.storageArea !== localStorage || (event.key !== STORAGE_KEY && event.key !== null))
        return;
      try {
        const latest = loadState(localStorage) || createInitialState();
        dataRef.current = latest;
        setData(latest);
        setStorageError('');
      } catch (error) {
        setStorageError(error.message);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  function go(next, replace = false) {
    setModal(null);
    if (!replace) setTrail((current) => [...current, route]);
    setRoute(next);
  }
  function back() {
    setModal(null);
    setTrail((current) => {
      setRoute(current.at(-1) || { page: 'home' });
      return current.slice(0, -1);
    });
  }
  function tab(page) {
    setTrail([]);
    setRoute({ page });
    setModal(null);
  }
  async function commit(mutate, expected = []) {
    try {
      const saved = await updateState(localStorage, mutate, {
        expected,
        initialState: createInitialState(),
      });
      dataRef.current = saved;
      setData(saved);
      setStorageError('');
      return saved;
    } catch (error) {
      if (error?.code === 'STATE_CONFLICT') {
        try {
          const latest = loadState(localStorage) || createInitialState();
          dataRef.current = latest;
          setData(latest);
        } catch (readError) {
          setStorageError(readError.message);
        }
        setToast('记录已在其他页面更新，本次修改未覆盖原记录。');
      }
      throw error;
    }
  }
  function openItem(item) {
    go({ page: 'detail', id: item.id });
  }
  function begin(kind) {
    go({ page: 'editor', type: kind === 'lost' ? 'lost' : 'found', relation: kind });
  }
  async function saveDraft(form, session, { asCopy = false } = {}) {
    const sourceItemId = asCopy ? undefined : session.sourceItemId;
    let draft;
    const saved = await commit(
      (latest) => {
        if (sourceItemId && isDraftStale({ sourceItemId }, latest.items))
          throw new Error('原记录已结案或移除，请将当前内容另存为新草稿。');
        const drafts = upsertDraft(latest.drafts, {
          ...form,
          id: asCopy ? undefined : session.draftId,
          sourceItemId,
          ownerId: CURRENT_USER.id,
        });
        draft = drafts.find((record) => record.id === session.draftId && !asCopy) || drafts[0];
        return { ...latest, drafts };
      },
      asCopy ? [] : session.expected,
    );
    setToast(
      asCopy ? '当前内容已另存为新草稿，原记录保留。' : '草稿已保存，下次可从“我的”继续填写。',
    );
    return { draft, session: createEditSession(saved, { draftId: draft.id }) };
  }
  async function publish(form, session) {
    const sourceItemId = session.sourceItemId;
    let item;
    await commit((latest) => {
      const previous = sourceItemId && latest.items.find((record) => record.id === sourceItemId);
      if (
        sourceItemId &&
        (!previous || previous.ownerId !== CURRENT_USER.id || previous.status !== 'active')
      )
        throw new Error('这条记录现在不能编辑。');
      const clean = {
        ...form,
        ownerName: CURRENT_USER.name,
        custody:
          form.relation === 'transfer'
            ? '来源待核实'
            : form.relation === 'service'
              ? '发布者登记已交服务点'
              : form.type === 'found'
                ? '本人暂存'
                : '正在寻找',
      };
      delete clean.sourceItemId;
      delete clean.timeLabel;
      item = createItem(clean, {
        id: previous?.id,
        items: latest.items.filter((record) => record.id !== previous?.id),
      });
      if (previous) item.createdAt = previous.createdAt;
      return {
        ...latest,
        items: previous
          ? latest.items.map((record) => (record.id === previous.id ? item : record))
          : [item, ...latest.items],
        drafts: latest.drafts.filter((record) => record.id !== session.draftId),
      };
    }, session.expected);
    setToast(sourceItemId ? '修改已保存' : '发布成功，愿小物早日回家。');
    setTrail([{ page: 'mine' }]);
    setRoute({ page: 'detail', id: item.id });
  }
  function reloadEditor(session) {
    const latest = loadState(localStorage) || createInitialState();
    const source = latest.items.find((record) => record.id === session.sourceItemId);
    const sourceBaseline = session.expected.find((record) => record.collection === 'items');
    const sourceChanged =
      sourceBaseline && JSON.stringify(source) !== JSON.stringify(sourceBaseline.value);
    const form =
      sourceChanged || !session.draftId
        ? source
        : latest.drafts.find((record) => record.id === session.draftId);
    if (!form || isDraftStale({ sourceItemId: session.sourceItemId }, latest.items))
      throw new Error('原记录已结案或移除，无法继续编辑；可以另存当前内容为新草稿。');
    dataRef.current = latest;
    setData(latest);
    return {
      form,
      session: createEditSession(latest, {
        draftId: session.draftId,
        editId: session.sourceItemId,
      }),
    };
  }
  async function complete(id, expectedItem = data.items.find((record) => record.id === id)) {
    await commit(
      (latest) => ({ ...latest, items: completeItem(latest.items, id, CURRENT_USER.id) }),
      [{ collection: 'items', id, value: expectedItem || null }],
    );
    setToast('状态已更新，谢谢你让小物回家。');
  }
  async function discardDraft(id, expectedDraft = data.drafts.find((record) => record.id === id)) {
    await commit(
      (latest) => {
        const draft = latest.drafts.find((record) => record.id === id);
        if (!draft || draft.ownerId !== CURRENT_USER.id)
          throw new Error('这份草稿不存在，或不属于当前用户。');
        if (!isDraftStale(draft, latest.items))
          throw new Error('这份草稿仍可编辑，请返回草稿箱查看。');
        return { ...latest, drafts: latest.drafts.filter((record) => record.id !== id) };
      },
      [{ collection: 'drafts', id, value: expectedDraft || null }],
    );
    setToast('已丢弃失效草稿。');
    go({ page: 'drafts' }, true);
  }
  async function saveActivity(record) {
    await commit(
      (latest) => ({
        ...latest,
        activities: [
          { ...record, id: crypto.randomUUID?.() || String(Date.now()) },
          ...(latest.activities || []),
        ],
      }),
      [captureRecord(data, 'items', record.itemId)],
    );
    setToast('已保存到本机记录，请通过公开联系方式联系对方。');
    go({ page: 'messages' }, true);
  }
  function filtered(searchQuery = '') {
    const preset = presets[filter];
    let result = searchItems(data.items, {
      query: searchQuery,
      campus,
      category: preset.category,
      area: preset.area,
    });
    if (preset.days) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - preset.days + 1);
      result = result.filter(
        (item) => item.eventDate && new Date(`${item.eventDate}T12:00:00`) >= start,
      );
    }
    return result;
  }
  const ownItems = data.items.filter((item) => item.ownerId === CURRENT_USER.id),
    currentItem = data.items.find((item) => item.id === route.id),
    activities = data.activities || [];
  const home = route.page === 'home',
    mine = route.page === 'mine';
  return (
    <div className="desktop-canvas">
      <div className="phone" aria-label="拾伴校园失物招领">
        <div className="app-content" inert={Boolean(modal)}>
          <div className="status-bar">
            <b>9:41</b>
            <b className="system-icons" aria-label="信号、网络与电量">
              ▰ ◔ ▰
            </b>
          </div>
          {storageError && (
            <div className="storage-warning" role="alert">
              {storageError}
            </div>
          )}
          {home && (
            <>
              <header className="home-header">
                <h1>拾伴</h1>
                <button className="campus-button" onClick={() => setModal('campus')}>
                  {campus}
                  <Glyph name="chevron" size={16} />
                </button>
                <button
                  className="round-button"
                  aria-label="搜索物品"
                  onClick={() => go({ page: 'search' })}
                >
                  <Glyph name="search" size={24} />
                </button>
              </header>
              <main className="page-scroll with-nav">
                <Hero />
                <div className="section-heading">
                  <h2>校园里的小牵挂</h2>
                  <button className="filter-button" onClick={() => setModal('filter')}>
                    筛选
                    <Glyph name="chevron" size={16} />
                    {filter > 0 && <i />}
                  </button>
                </div>
                <ItemGrid items={filtered()} onOpen={openItem} />
              </main>
            </>
          )}
          {mine && (
            <>
              <header className="mine-header">
                <h1>我的拾伴</h1>
                <div>
                  <button
                    className="round-button"
                    aria-label="草稿箱"
                    onClick={() => go({ page: 'drafts' })}
                  >
                    <Icon name="drafts" />
                  </button>
                  <button
                    className="round-button"
                    aria-label="帮助与说明"
                    onClick={() => go({ page: 'help' })}
                  >
                    <Icon name="mascot-pocket" />
                  </button>
                  <button
                    className="round-button"
                    aria-label="消息与记录"
                    onClick={() => go({ page: 'messages' })}
                  >
                    <Glyph name="message" size={32} />
                  </button>
                </div>
              </header>
              <main className="page-scroll with-nav">
                <Hero mine />
                <section className="profile-card">
                  <div className="profile-person">
                    <div className="avatar">
                      <Icon name="mascot-pocket" size={62} />
                    </div>
                    <div>
                      <h2>小拾同学</h2>
                      <p>本校成员 · 个人资料仅自己可见</p>
                    </div>
                  </div>
                  <div className="stats">
                    <div>
                      <b>{ownItems.length}</b>
                      <span>我发布的</span>
                    </div>
                    <div>
                      <b>{activities.filter((record) => record.kind === 'claim').length}</b>
                      <span>我认领的</span>
                    </div>
                    <div>
                      <b>{activities.filter((record) => record.kind === 'clue').length}</b>
                      <span>我协助的</span>
                    </div>
                  </div>
                </section>
                <button className="todo-card" onClick={() => go({ page: 'drafts' })}>
                  <span>
                    <strong>现在轮到你啦</strong>
                    <small>{`还有 ${data.drafts.length} 份草稿，想好就让小物出发。`}</small>
                  </span>
                  <Glyph name="right" />
                </button>
                <div className="mine-tabs" role="tablist" aria-label="我的记录">
                  {[
                    ['published', '我发布的'],
                    ['claim', '我认领的'],
                    ['clue', '我协助的'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      role="tab"
                      aria-selected={mineTab === value}
                      onClick={() => setMineTab(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {mineTab === 'published' ? (
                  ownItems.length ? (
                    ownItems.map((item) => (
                      <RecordRow
                        key={item.id}
                        item={item}
                        subtitle={`${item.id === 'keys' ? 'XB-026' : '我的发布'} · ${statusOf(item)}`}
                        onClick={() => openItem(item)}
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="还没有发布记录"
                      description="从右下角开始，发布你的第一件小物。"
                    />
                  )
                ) : activities.filter((record) => record.kind === mineTab).length ? (
                  activities
                    .filter((record) => record.kind === mineTab)
                    .map((record) => (
                      <InfoCard key={record.id} title={record.itemName}>
                        <p>{record.content}</p>
                        <p className="muted">本机记录 · 尚需自行联系对方</p>
                      </InfoCard>
                    ))
                ) : (
                  <EmptyState
                    title="好事，从这一次开始"
                    description="留下的认领信息和线索会出现在这里。"
                  />
                )}
              </main>
            </>
          )}
          {(home || mine) && (
            <nav className="bottom-nav" aria-label="主导航">
              <div className="nav-capsule">
                <button
                  className={home ? 'active' : ''}
                  aria-current={home ? 'page' : undefined}
                  onClick={() => tab('home')}
                >
                  <Icon name="home" />
                  首页
                </button>
                <button
                  className={mine ? 'active' : ''}
                  aria-current={mine ? 'page' : undefined}
                  onClick={() => tab('mine')}
                >
                  <Icon name="mascot-pocket" />
                  我的
                </button>
              </div>
              <button
                className="publish-button"
                aria-label="发布物品"
                onClick={() => setModal('publish')}
              >
                <Icon name="publish" size={46} />
              </button>
            </nav>
          )}
          {route.page === 'search' && (
            <Search
              query={query}
              onQueryChange={setQuery}
              submitted={submitted}
              onSearch={setSubmitted}
              campus={campus}
              items={submitted === null ? [] : filtered(submitted)}
              filter={filter}
              filterLabel={presets[filter].label}
              onFilter={() => setModal('filter')}
              onClearFilters={() => setFilter(0)}
              onBack={back}
              onOpen={openItem}
              onPublishLost={() => begin('lost')}
            />
          )}
          {route.page === 'drafts' && (
            <>
              <PageHeader title="草稿箱" onBack={() => tab('mine')} />
              <main className="page-scroll">
                <PageTitle
                  title="小事先存着，想好再出发"
                  subtitle="没写完也没关系，下次接着来。"
                  icon="drafts"
                />
                {data.drafts.length ? (
                  data.drafts.map((draft) => {
                    const stale = isDraftStale(draft, data.items);
                    return (
                      <RecordRow
                        key={draft.id}
                        item={draft}
                        subtitle={
                          stale
                            ? '已失效 · 原记录已结案或不存在'
                            : draft.progress ||
                              `${draft.type === 'lost' ? '寻物' : '招领'}草稿 · 尚未发布`
                        }
                        action={stale ? '查看草稿' : '继续填写'}
                        onClick={
                          stale
                            ? () => go({ page: 'stale-draft', draftId: draft.id })
                            : () =>
                                go({
                                  page: 'editor',
                                  type: draft.type,
                                  draftId: draft.id,
                                  editId: draft.sourceItemId,
                                  relation: draft.relation,
                                })
                        }
                      />
                    );
                  })
                ) : (
                  <EmptyState
                    title="草稿箱空空的"
                    description="填写过程中保存的内容，会留在这里。"
                  />
                )}
              </main>
            </>
          )}
          {route.page === 'stale-draft' && (
            <StaleDraft
              key={route.draftId}
              draft={data.drafts.find((draft) => draft.id === route.draftId)}
              currentUser={CURRENT_USER}
              onBack={() => go({ page: 'drafts' }, true)}
              onDiscard={discardDraft}
            />
          )}
          {route.page === 'editor' && (
            <Editor
              key={route.draftId || route.editId || route.type}
              type={route.type}
              initialSession={createEditSession(data, route)}
              initialData={
                data.drafts.find((draft) => draft.id === route.draftId) ||
                data.items.find((item) => item.id === route.editId) ||
                (route.relation === 'service' || route.relation === 'transfer'
                  ? {
                      type: 'found',
                      relation: route.relation,
                      description:
                        route.relation === 'service'
                          ? '已交服务点：请补充服务点名称与交接情况。'
                          : '转报来源：请说明原信息来源，尚未确认实际持有人。',
                    }
                  : null)
              }
              onBack={back}
              onSaveDraft={saveDraft}
              onPublish={publish}
              onReload={reloadEditor}
            />
          )}
          {route.page === 'detail' && (
            <Detail
              key={currentItem?.id}
              item={currentItem}
              currentUser={CURRENT_USER}
              onBack={back}
              onComplete={complete}
              onEdit={(item) =>
                go({ page: 'editor', type: item.type, editId: item.id, relation: item.relation })
              }
              onNotify={setToast}
              onClaim={(item) => go({ page: 'claim', id: item.id })}
              onClue={(item) => go({ page: 'clue', id: item.id })}
            />
          )}
          {['claim', 'clue', 'messages', 'help'].includes(route.page) && (
            <Activity
              kind={route.page}
              item={currentItem}
              records={activities}
              onBack={back}
              onSave={saveActivity}
              onNotify={setToast}
            />
          )}
        </div>
        {modal === 'publish' && (
          <PublishMenu
            onClose={() => setModal(null)}
            onChoose={begin}
            onDrafts={() => go({ page: 'drafts' })}
          />
        )}
        {modal === 'filter' && (
          <FilterMenu
            value={filter}
            onClose={() => setModal(null)}
            onApply={(value) => {
              setFilter(value);
              setModal(null);
            }}
          />
        )}
        {modal === 'campus' && (
          <Overlay title="选择校区" onClose={() => setModal(null)} className="campus-overlay">
            <div className="campus-sheet">
              <h2>你在哪个校区？</h2>
              <p>看看身边的小物消息。</p>
              {CAMPUSES.map((name) => (
                <Button
                  key={name}
                  variant={campus === name ? 'primary' : 'secondary'}
                  onClick={() => {
                    setCampus(name);
                    setModal(null);
                  }}
                >
                  {name}
                  {campus === name ? ' ✓' : ''}
                </Button>
              ))}
              <button className="text-button" onClick={() => setModal(null)}>
                取消
              </button>
            </div>
          </Overlay>
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
function RecordRow({ item, subtitle, action, onClick }) {
  return (
    <button className="record-row" onClick={onClick}>
      <span className="record-image" style={{ background: item.color || '#e9f4cc' }}>
        <ItemArtwork item={item} size={56} />
      </span>
      <span className="record-copy">
        <strong>{item.name || '未命名的小物'}</strong>
        <small>{subtitle}</small>
        <small className="record-update">
          {action || (item.status === 'completed' ? '谢谢你，让小物回家了' : '查看详情与进展')}
        </small>
      </span>
      <Glyph name="right" size={20} />
    </button>
  );
}
