import React, { useEffect, useRef, useState } from 'react';
import { createInitialState } from './seed.js';
import {
  CAMPUSES,
  CURRENT_USER,
  loadState,
  saveState,
  createItem,
  completeItem,
  upsertDraft,
} from './model.js';
import { Icon, Glyph, Button, PageHeader, PageTitle, Hero, EmptyState } from './ui.jsx';
import Editor from './Editor.jsx';
import Detail from './Detail.jsx';

const statusOf = (item) =>
  item.status === 'completed'
    ? item.type === 'lost'
      ? '已找到'
      : '已归还'
    : item.type === 'lost'
      ? '正在寻找'
      : item.custody || '等待认领';
const iconOf = (item) =>
  ['umbrella', 'keys', 'bottle'].includes(item.image) ? item.image : 'mascot-pocket';
const dateOf = (item) =>
  item.timeLabel ||
  (item.eventDate
    ? `${item.eventDate.slice(5).replace('-', '月')}日${item.type === 'lost' ? '遗失' : '拾得'}`
    : '时间不确定');

function ItemCard({ item, onOpen }) {
  return (
    <button
      className="item-card"
      onClick={() => onOpen(item)}
      aria-label={`${item.name}，${statusOf(item)}，查看详情`}
    >
      <div
        className={`item-picture ${iconOf(item) === 'umbrella' ? 'item-picture--tall' : ''}`}
        style={{ background: item.color || '#e1e7d8' }}
      >
        {item.images?.[0]?.dataUrl ? (
          <img className="item-photo" src={item.images[0].dataUrl} alt={item.name} />
        ) : (
          <Icon name={iconOf(item)} size={112} />
        )}
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
  if (!items.length)
    return <EmptyState description="当前校区还没有物品信息，可以切换校区继续浏览。" />;
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
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3400);
    return () => clearTimeout(timer);
  }, [toast]);
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
  function commit(next) {
    if (initial.error)
      throw new Error('原有本地数据读取失败，已停止覆盖。请换用可用的浏览器存储后重试。');
    const saved = saveState(localStorage, next);
    dataRef.current = saved;
    setData(saved);
    return saved;
  }
  function openItem(item) {
    go({ page: 'detail', id: item.id });
  }
  function begin(kind) {
    go({ page: 'editor', type: kind === 'lost' ? 'lost' : 'found', relation: kind });
  }
  function saveDraft(form) {
    const sourceItemId = route.editId || form.sourceItemId;
    const existingEditDraft =
      sourceItemId &&
      dataRef.current.drafts.find(
        (record) => record.sourceItemId === sourceItemId && record.ownerId === CURRENT_USER.id,
      );
    const draftId = sourceItemId
      ? form.id && form.id !== sourceItemId
        ? form.id
        : existingEditDraft?.id
      : form.id;
    const draft = {
      ...form,
      id: draftId,
      sourceItemId,
      ownerId: CURRENT_USER.id,
      relation: route.relation || form.relation,
    };
    const drafts = upsertDraft(dataRef.current.drafts, draft);
    commit({ ...dataRef.current, drafts });
    setToast('草稿已保存，下次可从“我的”继续填写。');
    return drafts.find((record) => record.id === draft.id) || drafts[0];
  }
  function publish(form) {
    const sourceItemId = route.editId || form.sourceItemId;
    const previous =
      sourceItemId && dataRef.current.items.find((record) => record.id === sourceItemId);
    if (
      sourceItemId &&
      (!previous || previous.ownerId !== CURRENT_USER.id || previous.status !== 'active')
    )
      throw new Error('这条记录现在不能编辑。');
    const clean = {
      ...form,
      ownerName: CURRENT_USER.name,
      relation: route.relation || form.relation,
      timeLabel: '',
      custody:
        route.relation === 'transfer'
          ? '来源待核实'
          : route.relation === 'service'
            ? '发布者登记已交服务点'
            : form.type === 'found'
              ? '本人暂存'
              : '正在寻找',
    };
    delete clean.sourceItemId;
    const item = createItem(clean, {
      id: previous?.id,
      items: dataRef.current.items.filter((record) => record.id !== previous?.id),
    });
    if (previous) item.createdAt = previous.createdAt;
    const items = previous
      ? dataRef.current.items.map((record) => (record.id === previous.id ? item : record))
      : [item, ...dataRef.current.items];
    commit({
      ...dataRef.current,
      items,
      drafts: dataRef.current.drafts.filter(
        (record) => record.id !== form.id && (!previous || record.sourceItemId !== previous.id),
      ),
    });
    setToast(previous ? '修改已保存' : '发布成功，愿小物早日回家。');
    setTrail([{ page: 'mine' }]);
    setRoute({ page: 'detail', id: item.id });
  }
  function complete(id) {
    commit({ ...dataRef.current, items: completeItem(dataRef.current.items, id, CURRENT_USER.id) });
    setToast('状态已更新，谢谢你让小物回家。');
  }
  const ownItems = data.items.filter((item) => item.ownerId === CURRENT_USER.id),
    currentItem = data.items.find((item) => item.id === route.id);
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
          {initial.error && (
            <div className="storage-warning" role="alert">
              {initial.error}
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
              </header>
              <main className="page-scroll with-nav">
                <Hero />
                <div className="section-heading">
                  <h2>校园里的小牵挂</h2>
                </div>
                <ItemGrid
                  items={data.items.filter((item) => item.campus === campus)}
                  onOpen={openItem}
                />
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
                  </div>
                </section>
                <button className="todo-card" onClick={() => go({ page: 'drafts' })}>
                  <span>
                    <strong>现在轮到你啦</strong>
                    <small>{`还有 ${data.drafts.length} 份草稿，想好就让小物出发。`}</small>
                  </span>
                  <Glyph name="right" />
                </button>
                <div className="section-heading">
                  <h2>我发布的</h2>
                </div>
                {ownItems.length ? (
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
                  data.drafts.map((draft) => (
                    <RecordRow
                      key={draft.id}
                      item={draft}
                      subtitle={
                        draft.progress ||
                        `${draft.type === 'lost' ? '寻物' : '招领'}草稿 · 尚未发布`
                      }
                      action="继续填写"
                      onClick={() =>
                        go({
                          page: 'editor',
                          type: draft.type,
                          draftId: draft.id,
                          editId: draft.sourceItemId,
                          relation: draft.relation,
                        })
                      }
                    />
                  ))
                ) : (
                  <EmptyState
                    title="草稿箱空空的"
                    description="填写过程中保存的内容，会留在这里。"
                  />
                )}
              </main>
            </>
          )}
          {route.page === 'editor' && (
            <Editor
              key={route.draftId || route.editId || route.type}
              type={route.type}
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
        <Icon name={iconOf(item)} size={56} />
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
