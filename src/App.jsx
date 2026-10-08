import React, { useEffect, useRef, useState } from 'react';
import { createInitialState } from './seed.js';
import { CAMPUSES, CURRENT_USER, loadState, saveState, completeItem } from './model.js';
import { Icon, Glyph, Button, Hero, EmptyState } from './ui.jsx';
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
                  <EmptyState title="还没有发布记录" description="暂无属于当前用户的物品信息。" />
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
            </nav>
          )}
          {route.page === 'detail' && (
            <Detail
              key={currentItem?.id}
              item={currentItem}
              currentUser={CURRENT_USER}
              onBack={back}
              onComplete={complete}
              onNotify={setToast}
            />
          )}
        </div>
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
