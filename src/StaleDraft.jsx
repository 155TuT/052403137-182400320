import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, EmptyState, InfoCard, PageHeader, PageTitle } from './ui.jsx';
import { getItemPhotoUrls } from './itemPresentation.js';
import './detail.css';
import './staleDraft.css';

export default function StaleDraft({ draft, onBack, onDiscard, currentUser }) {
  const [pendingDraft, setPendingDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const busyRef = useRef(false);
  const cancelButton = useRef(null);
  const dialogId = useId();
  const confirmOpen = Boolean(pendingDraft);
  const userId = typeof currentUser === 'object' ? currentUser?.id : currentUser;
  const own = !currentUser || Boolean(userId && draft?.ownerId === userId);
  const photos = getItemPhotoUrls(draft);

  useEffect(() => {
    if (!confirmOpen) return undefined;
    const previousFocus = document.activeElement;
    cancelButton.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [confirmOpen]);

  function closeConfirmation() {
    if (busyRef.current) return;
    setPendingDraft(null);
  }

  async function discard() {
    if (!pendingDraft || !own || !onDiscard || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailure('');
    try {
      const result = await onDiscard(pendingDraft.id, pendingDraft);
      if (result === false || result?.ok === false)
        throw new Error(result?.error || '草稿尚未丢弃，请重试。');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '丢弃失败，草稿仍保留，请重试。');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function handleDialogKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeConfirmation();
    }
    if (event.key !== 'Tab') return;
    const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
    if (!buttons.length) {
      event.preventDefault();
      return;
    }
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!draft) {
    return (
      <section className="detail-page stale-draft-page">
        <PageHeader title="查看草稿" onBack={onBack} />
        <EmptyState
          title="这份草稿已不存在"
          description="返回草稿箱查看其他内容。"
          action={<Button onClick={onBack}>返回草稿箱</Button>}
        />
      </section>
    );
  }

  return (
    <section className="detail-page stale-draft-page" aria-label="失效草稿详情">
      <div className="detail-content" inert={confirmOpen}>
        <PageHeader title="查看失效草稿" onBack={onBack} />
        <main className="detail-scroll">
          <PageTitle
            title={draft.name || '未命名的小物'}
            subtitle="失效编辑草稿 · 仅供查看"
            item={draft}
          />
          <InfoCard title="内容仍为你保留" tone="soft" className="detail-card">
            <p>
              原记录已结案或不存在，这份草稿不能继续修改或发布。你可以查看保存的内容，或主动丢弃。
            </p>
          </InfoCard>
          <InfoCard title="物品与地点" className="detail-card">
            <dl className="stale-draft-fields">
              {[
                ['物品名称', draft.name || '未填写'],
                ['物品类别', draft.category || '未选择'],
                ['发布类型', draft.type === 'lost' ? '寻物' : '招领'],
                ['所在校区', draft.campus || '未选择'],
                ['地点', draft.area || '未填写'],
                ['日期', draft.eventDate || '时间不确定'],
                ...(draft.eventTime ? [['时间', draft.eventTime]] : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </InfoCard>
          <InfoCard title="保存的描述" className="detail-card">
            <p className="detail-description">{draft.description || '尚未填写描述。'}</p>
          </InfoCard>
          <InfoCard title="保存的联系方式" className="detail-card">
            <p className="detail-description">{draft.contact || '尚未填写联系方式。'}</p>
          </InfoCard>
          <InfoCard title={`保存的照片 · ${photos.length} 张`} className="detail-card">
            {photos.length ? (
              <div className="stale-draft-photos">
                {photos.map((photo, index) => (
                  <img key={index} src={photo} alt={`${draft.name || '物品'}照片 ${index + 1}`} />
                ))}
              </div>
            ) : (
              <p className="detail-muted">没有添加照片。</p>
            )}
          </InfoCard>
        </main>
        <footer className="detail-actions">
          <Button variant="secondary" onClick={onBack}>
            保留草稿，返回草稿箱
          </Button>
          {own && onDiscard && (
            <Button
              className="stale-draft-discard"
              onClick={() => {
                setFailure('');
                setPendingDraft(structuredClone(draft));
              }}
            >
              丢弃这份草稿
            </Button>
          )}
        </footer>
      </div>
      {confirmOpen && (
        <div
          className="detail-confirm-backdrop"
          onClick={(event) => event.target === event.currentTarget && closeConfirmation()}
        >
          <section
            className="detail-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            aria-describedby={`${dialogId}-description`}
            aria-busy={busy}
            onKeyDown={handleDialogKey}
          >
            <h2 id={`${dialogId}-title`}>确认丢弃这份草稿？</h2>
            <p id={`${dialogId}-description`}>
              “{pendingDraft.name || '未命名的小物'}
              ”草稿中未提交的文字和照片将永久删除，无法恢复。原发布记录不受影响。
            </p>
            {failure && (
              <p className="detail-error" role="alert">
                {failure}
              </p>
            )}
            <Button
              ref={cancelButton}
              variant="secondary"
              onClick={closeConfirmation}
              disabled={busy}
            >
              取消，保留草稿
            </Button>
            <Button className="stale-draft-discard" onClick={discard} disabled={busy}>
              {busy ? '正在丢弃…' : '确认丢弃'}
            </Button>
          </section>
        </div>
      )}
    </section>
  );
}
