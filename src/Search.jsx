import React, { useRef } from 'react';
import { Button, Glyph } from './ui.jsx';
import './search.css';

const recentWords = ['雨伞', '钥匙', '保温杯', '耳机'];

function statusOf(item) {
  if (item.status === 'completed') return item.type === 'lost' ? '已找到' : '已归还';
  return item.type === 'lost' ? '正在寻找' : item.custody || '等待认领';
}

function dateOf(item) {
  if (item.displayTime || item.timeLabel) return item.displayTime || item.timeLabel;
  const match = String(item.eventDate || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[1])}月${Number(match[2])}日` : '时间不确定';
}

export default function Search({
  query,
  onQueryChange,
  submitted,
  onSearch,
  campus,
  items,
  filter,
  filterLabel,
  onFilter,
  onClearFilters,
  onBack,
  onOpen,
  onPublishLost,
}) {
  const input = useRef(null);
  const initial = submitted === null;

  function search(event) {
    event.preventDefault();
    if (query.trim()) onSearch(query.trim());
  }

  function clear() {
    onQueryChange('');
    onSearch(null);
    input.current?.focus();
  }

  function modifyKeyword() {
    onSearch(null);
    input.current?.focus();
    input.current?.select();
  }

  const scope = <p className="shiban-search-campus">{campus}</p>;
  const activeFilter = filter > 0 && (
    <div className="shiban-search-active-filter">
      <span>{filterLabel}</span>
      <button type="button" onClick={onClearFilters}>
        清除筛选
      </button>
    </div>
  );

  return (
    <section className="shiban-search-page" aria-label="搜索校园物品">
      <form className="shiban-search-header" onSubmit={search}>
        <button type="button" className="round-button" aria-label="返回上一页" onClick={onBack}>
          <Glyph name="back" />
        </button>
        <div className="shiban-search-field">
          <input
            ref={input}
            aria-label="搜索关键词"
            placeholder="搜索物品名称"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {query && (
            <button type="button" aria-label="清空关键词" onClick={clear}>
              <Glyph name="close" size={16} />
            </button>
          )}
        </div>
        <button className="shiban-search-submit" type="submit" disabled={!query.trim()}>
          搜索
        </button>
      </form>
      <main className="shiban-search-scroll">
        {initial ? (
          <>
            <div className="shiban-search-intro">
              <h2>找找你的校园小物</h2>
              <p>先选择物品名称，再点搜索。</p>
            </div>
            <section className="shiban-search-card shiban-search-recent">
              <h3>最近搜索</h3>
              <p>点一下填入搜索框，再按搜索。</p>
              <div className="shiban-search-keywords">
                {recentWords.map((word) => (
                  <button type="button" key={word} onClick={() => onQueryChange(word)}>
                    {word}
                  </button>
                ))}
              </div>
            </section>
            <section className="shiban-search-card shiban-search-scope">
              <h3>当前查找范围</h3>
              <p>当前校区内查找，可在结果页进一步筛选。</p>
              {scope}
            </section>
          </>
        ) : items.length ? (
          <>
            <div className="shiban-search-result-heading">
              <h2>
                找到 {items.length} 条{submitted}信息
              </h2>
              <button type="button" className="shiban-search-filter" onClick={onFilter}>
                <Glyph name="filter" />
                筛选{filter > 0 && <i />}
              </button>
            </div>
            {scope}
            {activeFilter}
            <div className="shiban-search-results">
              {items.map((item) => (
                <button
                  type="button"
                  className="shiban-search-card shiban-search-result"
                  key={item.id}
                  onClick={() => onOpen(item)}
                  aria-label={`${item.name}，${item.type === 'lost' ? '寻物' : '招领'}，查看详情`}
                >
                  <h3>
                    {item.name} · {item.type === 'lost' ? '寻物' : '招领'}
                  </h3>
                  <p>
                    {item.area}｜{dateOf(item)}｜{statusOf(item)}
                  </p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <section className="shiban-search-card shiban-search-empty">
              <h3>暂时没有匹配结果</h3>
              <p>保留这些条件，换个关键词或放宽范围试试。</p>
            </section>
            <div className="shiban-search-empty-query">
              <h2>{submitted}</h2>
              {scope}
            </div>
            {activeFilter}
            <div className="shiban-search-empty-actions">
              <Button onClick={modifyKeyword}>修改关键词</Button>
              <Button variant="white" onClick={onFilter}>
                放宽筛选条件
              </Button>
              <Button variant="white" onClick={onPublishLost}>
                去发布寻物
              </Button>
            </div>
          </>
        )}
      </main>
    </section>
  );
}
