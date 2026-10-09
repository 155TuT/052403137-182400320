import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, InfoCard, PageHeader, PageTitle } from './ui.jsx';
import { getItemTitle, getItemPhotoUrls } from './itemPresentation.js';
import './detail.css';
import { formatDateLabel } from './dateLabel.js';

function displayDate(item) {
  return formatDateLabel(item);
}

export default function Detail({
  item,
  currentUser,
  onBack,
  onComplete,
  onEdit,
  onNotify,
  onClaim,
  onClue,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [completedId, setCompletedId] = useState(null);
  const contactInput = useRef(null);
  const confirmButton = useRef(null);
  const busyRef = useRef(false);
  const completionSnapshot = useRef(null);
  const dialogId = useId();
  const contactId = useId();
  const userId = typeof currentUser === 'object' ? currentUser?.id : currentUser;
  const own = Boolean(userId && item?.ownerId && userId === item.ownerId);
  const completed = item?.status === 'completed' || Boolean(item?.id && completedId === item.id);
  const doneLabel = item?.type === 'lost' ? '已找到' : '已归还';
  const activeLabel = item?.type === 'lost' ? '寻物中' : '招领中';
  const contact = typeof item?.contact === 'string' ? item.contact : '';

  useEffect(() => {
    setCopyMessage('');
    setCompleteError('');
    setConfirmOpen(false);
  }, [item?.id]);

  useEffect(() => {
    if (!confirmOpen) return undefined;
    const previousFocus = document.activeElement;
    confirmButton.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [confirmOpen]);

  useEffect(() => {
    if (completed || !own) setConfirmOpen(false);
  }, [completed, own]);

  function selectContact() {
    const input = contactInput.current;
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input?.focus({ preventScroll: true });
    input?.select();
  }

  async function copyContact() {
    if (!contact) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(contact);
      setCopyMessage('联系方式已复制');
      onNotify?.('联系方式已复制');
    } catch {
      selectContact();
      setCopyMessage('未能自动复制，已选中联系方式，请手动复制。');
    }
  }

  function openConfirmation() {
    if (!own || completed || busyRef.current) return;
    completionSnapshot.current = structuredClone(item);
    setCompleteError('');
    setConfirmOpen(true);
  }

  function closeConfirmation() {
    if (busyRef.current) return;
    setConfirmOpen(false);
    setCompleteError('');
  }

  async function confirmCompletion() {
    if (!own || completed || busyRef.current || !onComplete) return;
    busyRef.current = true;
    setBusy(true);
    setCompleteError('');
    try {
      const result = await onComplete(item.id, completionSnapshot.current);
      if (result === false || result?.ok === false)
        throw new Error(result?.error || '状态没有保存，请再试一次。');
      setCompletedId(item.id);
      setConfirmOpen(false);
    } catch (error) {
      setCompleteError(error instanceof Error ? error.message : '状态没有保存，请再试一次。');
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
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first) {
      event.preventDefault();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!item) {
    return (
      <div className="detail-page">
        <PageHeader title="物品详情" onBack={onBack} />
        <main className="detail-scroll">
          <InfoCard title="暂时找不到这条信息">
            <p>返回列表，看看其他小物吧。</p>
          </InfoCard>
        </main>
        <footer className="detail-actions">
          <Button onClick={onBack}>返回列表</Button>
        </footer>
      </div>
    );
  }

  const imageUrls = getItemPhotoUrls(item);
  const code = { umbrella: 'XB-001', keys: 'XB-026', bottle: 'XB-021' }[item.id];
  const subtitle = [code, completed ? doneLabel : activeLabel].filter(Boolean).join(' · ');
  const transfer = item.type !== 'lost' && item.relation === 'transfer';
  const service = item.type !== 'lost' && item.relation === 'service';
  const ownerDescription =
    item.type === 'lost'
      ? '如果你见过或捡到相似的物品，可以联系发布者，核对时间、地点与细节。'
      : transfer
        ? '这是一条转报线索，来源与实际持有人尚待核实。发布者不一定持有物品，请先联系确认来源和当前进展。'
        : service
          ? '发布者登记已交服务点，但尚未获得服务点接收确认。请联系核对具体服务点与交接情况，登记移交不等于已经归还。'
          : item.custody === '服务点已接收'
            ? `${item.ownerName || '服务点'}已确认接收。`
            : `${item.ownerName || '发布者'}暂时保管，联系后再安排交接。`;
  const sourceDescription = transfer
    ? '转报线索，来源待核实'
    : service
      ? '发布者登记已交服务点，接收状态待确认'
      : item.source || (item.type === 'lost' ? '失主本人发布' : '拾物者登记');
  const claimLabel =
    item.type === 'lost'
      ? item.category === '水杯'
        ? '我捡到相似水杯'
        : '我捡到相似物品'
      : transfer
        ? '可能是我的，先核实线索'
        : service
          ? '可能是我的，先核实接收情况'
          : '这是我的，联系发布者';

  return (
    <div className="detail-page">
      <div className="detail-content" inert={confirmOpen ? true : undefined}>
        <PageHeader title={item.type === 'lost' ? '寻物详情' : '招领详情'} onBack={onBack} />
        <main className="detail-scroll">
          <PageTitle title={getItemTitle(item, completed)} subtitle={subtitle} item={item} />
          <InfoCard title={item.name} className="detail-card">
            <p className="detail-description">{item.description || '发布者还没有补充描述。'}</p>
            {imageUrls.length > 0 && (
              <div className="detail-photos">
                {imageUrls.map((url, index) => (
                  <img
                    key={`${item.id}-photo-${index}`}
                    src={url}
                    alt={`${item.name}的第 ${index + 1} 张照片`}
                  />
                ))}
              </div>
            )}
            <p className="detail-muted">
              {[item.campus, item.area].filter(Boolean).join(' · ') || '地点待补充'}
            </p>
            <p className="detail-muted">
              {displayDate(item)} · {completed ? doneLabel : activeLabel}
            </p>
            <p className="detail-muted">类别：{item.category || '其他'}</p>
          </InfoCard>
          <InfoCard
            title={
              completed
                ? '最后进展'
                : item.type === 'lost'
                  ? '可以怎样帮忙'
                  : transfer
                    ? '线索来源待核实'
                    : service
                      ? '服务点接收待确认'
                      : '现在由谁保管'
            }
            className="detail-card"
          >
            <p>
              {completed
                ? `发布者已将这条${item.type === 'lost' ? '寻物' : '招领'}标记为“${doneLabel}”。`
                : ownerDescription}
            </p>
            {completed ? (
              <p className="detail-muted">感谢每一份顺手的帮助，这条信息已结束。</p>
            ) : (
              <>
                <p className="detail-muted">来源：{sourceDescription}</p>
                <div className="detail-contact">
                  <label htmlFor={contactId}>发布者联系方式</label>
                  {contact ? (
                    <div className="detail-contact-row">
                      <input
                        id={contactId}
                        ref={contactInput}
                        className="detail-contact-value"
                        type="text"
                        value={contact}
                        readOnly
                        onFocus={(event) => event.target.select()}
                      />
                      <button
                        type="button"
                        className="detail-copy"
                        onClick={copyContact}
                        aria-label="复制发布者联系方式"
                      >
                        复制
                      </button>
                    </div>
                  ) : (
                    <p className="detail-muted">发布者暂未填写联系方式。</p>
                  )}
                  {copyMessage && (
                    <p className="detail-copy-message" role="status">
                      {copyMessage}
                    </p>
                  )}
                </div>
              </>
            )}
          </InfoCard>
          <InfoCard
            title={
              completed
                ? '这条信息已经更新'
                : item.type === 'lost'
                  ? '别把所有特征都写出来'
                  : '认领前的小提醒'
            }
            tone="soft"
            className="detail-card"
          >
            <p>
              {completed
                ? `列表和详情都会显示“${doneLabel}”，无需再为这件物品联系发布者。`
                : '请保留只有失主知道的特征，交接前仔细核对；不需要先付款，也不要提供密码或验证码。'}
            </p>
          </InfoCard>
        </main>
        <footer className="detail-actions" aria-label="物品操作">
          {completed ? (
            <Button onClick={onBack}>返回继续浏览</Button>
          ) : own ? (
            <>
              <Button onClick={openConfirmation} disabled={!onComplete}>
                标记为{doneLabel}
              </Button>
              {onEdit && (
                <Button variant="secondary" onClick={() => onEdit(item)}>
                  编辑这条信息
                </Button>
              )}
              <Button variant="secondary" onClick={onBack}>
                返回我的发布
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => (onClaim ? onClaim(item) : selectContact())}>
                {claimLabel}
              </Button>
              <Button variant="secondary" onClick={() => (onClue ? onClue(item) : selectContact())}>
                提供一条线索
              </Button>
              <Button variant="secondary" onClick={onBack}>
                返回继续浏览
              </Button>
            </>
          )}
        </footer>
      </div>
      {confirmOpen && own && !completed && (
        <div
          className="detail-confirm-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeConfirmation();
          }}
        >
          <section
            className="detail-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            aria-describedby={`${dialogId}-description`}
            onKeyDown={handleDialogKey}
          >
            <div className="detail-confirm-handle" aria-hidden="true" />
            <h2 id={`${dialogId}-title`}>
              确认这件小物{item.type === 'lost' ? '找到了' : '已归还'}？
            </h2>
            <p id={`${dialogId}-description`}>
              请在
              {item.type === 'lost'
                ? '实际找回物品'
                : transfer
                  ? '向实际持有人核实物品已归还'
                  : service
                    ? '向服务点核实物品已归还'
                    : '完成交接'}
              后确认。“{item.name}”会标记为“{doneLabel}”，其他人也会看到最新状态。
            </p>
            {completeError && (
              <p className="detail-error" role="alert">
                {completeError}
              </p>
            )}
            <Button ref={confirmButton} onClick={confirmCompletion} disabled={busy}>
              {busy ? '正在保存…' : `确认${doneLabel}`}
            </Button>
            <Button variant="secondary" onClick={closeConfirmation} disabled={busy}>
              先不更改
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
