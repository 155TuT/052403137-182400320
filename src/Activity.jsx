import React, { useRef, useState } from 'react';
import { PageHeader, PageTitle, InfoCard, Button, EmptyState } from './ui.jsx';
import './activity.css';
import { isValidContact } from './model.js';

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '时间未记录'
    : new Intl.DateTimeFormat('zh-CN', {
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
}

export default function Activity({ kind = 'clue', item, records = [], onBack, onSave, onNotify }) {
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);
  const contentRef = useRef(null);
  const contactRef = useRef(null);
  const claim = kind === 'claim';
  const label = claim ? '认领记录' : '协助记录';
  const heading =
    kind === 'help'
      ? '使用帮助'
      : kind === 'messages'
        ? '消息与记录'
        : claim
          ? '记录认领'
          : '提供线索';

  function update(setValue, field, value) {
    setValue(value);
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFailure('');
  }

  async function submit(event) {
    event.preventDefault();
    if (savingRef.current || saved || !item?.id) return;
    const nextErrors = {};
    if (!content.trim())
      nextErrors.content = claim
        ? '请补充你记得的物品特征与遗失情况。'
        : '请写下线索内容，例如时间、地点与看到的情况。';
    else if ([...content.trim()].length > 500) nextErrors.content = '内容请控制在 500 字以内。';
    if (!contact.trim()) nextErrors.contact = '请填写你的联系方式。';
    else if ([...contact.trim()].length > 80 || !isValidContact(contact.trim()))
      nextErrors.contact = '请填写有效邮箱、电话，或注明 QQ / 微信号码。';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      (nextErrors.content ? contentRef : contactRef).current?.focus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFailure('');
    try {
      await onSave({
        kind: claim ? 'claim' : 'clue',
        itemId: item.id,
        itemName: item.name,
        content: content.trim(),
        contact: contact.trim(),
        createdAt: new Date().toISOString(),
      });
      setSaved(true);
      onNotify?.(`${label}已保存到本机`);
    } catch (error) {
      setFailure(
        `保存未完成，填写的内容仍在。${error instanceof Error ? error.message : '请稍后重试。'}`,
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="activity-page" aria-label={heading}>
      <PageHeader title={heading} onBack={saving ? undefined : onBack} />
      <div className="activity-scroll">
        {kind === 'help' ? (
          <>
            <PageTitle title="让每次交还更安心" subtitle="先核对清楚，再约好交接" icon="service" />
            <InfoCard title="先找一找，再联系">
              <p>
                按物品名搜索，并结合校区、地点与日期确认候选。在详情页查看发布者留下的联系方式，自行联系对方。
              </p>
            </InfoCard>
            <InfoCard title="留一个特征，见面核对">
              <p>
                认领时说明未公开的细节，例如内侧标记、挂件组合或购买记录。不要发送密码、验证码或完整证件照片；核对清楚后，在校园公共场所交接。
              </p>
            </InfoCard>
            <InfoCard title="不需要付费解锁联系方式" tone="soft">
              <p>
                本演示的联系方式直接可见，不收取认领费。遇到索费或可疑要求，停止联系，向学校相关服务部门求助。
              </p>
            </InfoCard>
            <InfoCard title="事情结束，更新一下">
              <p>
                发布者在“我的发布”中进入对应记录，将寻物标记为“已找到”或将招领标记为“已归还”，让其他人看到最新状态。
              </p>
            </InfoCard>
            <InfoCard title="关于这份本地演示">
              <p>
                发布、草稿与协助记录仅保存在当前浏览器。没有联网发送、身份核验或学校服务点接入；清除浏览器数据后记录可能丢失。保存线索不等于已通知对方，请通过详情页的公开联系方式自行联系。
              </p>
            </InfoCard>
          </>
        ) : kind === 'messages' ? (
          <>
            <PageTitle
              title="每份线索，都记下来"
              subtitle="本机保存的协助与认领记录"
              icon="drafts"
            />
            <InfoCard title="这里还没有网络消息" tone="soft">
              <p>
                下方仅显示当前浏览器保存的记录。记录不会自动发送给发布者，也不代表对方已经收到或回复。
              </p>
            </InfoCard>
            {records.length ? (
              <div className="activity-records" aria-label="本机记录列表">
                {[...records]
                  .sort(
                    (left, right) =>
                      (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0),
                  )
                  .map((record, index) => (
                    <article
                      className="activity-record"
                      key={record.id || `${record.itemId}-${record.createdAt}-${index}`}
                    >
                      <div className="activity-record-top">
                        <span className="activity-kind">
                          {record.kind === 'claim' ? '认领记录' : '协助记录'}
                        </span>
                        <span className="activity-local-badge">仅本机</span>
                      </div>
                      <h2>{record.itemName || '物品记录'}</h2>
                      <p className="activity-record-content">{record.content}</p>
                      <dl>
                        <div>
                          <dt>我的联系方式</dt>
                          <dd>{record.contact || '未填写'}</dd>
                        </div>
                        <div>
                          <dt>保存时间</dt>
                          <dd>
                            <time
                              dateTime={
                                Number.isNaN(Date.parse(record.createdAt))
                                  ? undefined
                                  : record.createdAt
                              }
                            >
                              {formatTime(record.createdAt)}
                            </time>
                          </dd>
                        </div>
                      </dl>
                      <p className="activity-record-note">
                        请通过物品详情页的公开联系方式自行联系发布者。
                      </p>
                    </article>
                  ))}
              </div>
            ) : (
              <EmptyState
                title="还没有协助或认领记录"
                description="看到有用的线索，或发现像自己的物品时，可以在详情页记下来。"
                action={
                  <Button variant="secondary" onClick={onBack}>
                    返回继续看看
                  </Button>
                }
              />
            )}
          </>
        ) : !item?.id ? (
          <EmptyState
            title="没有找到对应物品"
            description="请从物品详情页重新进入，已有内容不会被发送。"
            action={<Button onClick={onBack}>返回</Button>}
          />
        ) : (
          <>
            <PageTitle
              title={claim ? '记录这次认领' : '把看到的线索记下来'}
              subtitle={claim ? '核对物品后，再约好交接' : '一点小线索，也许就有帮助'}
              icon={claim ? 'mascot-pocket' : 'publish'}
            />
            <InfoCard title={item.name}>
              <p>
                {item.campus} · {item.area}
              </p>
              <p className="activity-publisher-contact">
                发布者联系方式：{item.contact || '这条记录暂未留下联系方式'}
              </p>
            </InfoCard>
            <InfoCard title="保存后还需要自行联系" tone="soft">
              <p>
                这是一份保存在本机的{label}
                ，不会自动发送给对方。请通过上方公开联系方式沟通，不要在记录中填写证件号码、密码或验证码。
              </p>
            </InfoCard>
            {failure ? (
              <div className="activity-error-banner" role="alert">
                {failure}
              </div>
            ) : null}
            {saved ? (
              <div className="activity-success-banner" role="status">
                {label}已保存到本机，尚未向发布者发送。
              </div>
            ) : null}
            <form id="activity-form" onSubmit={submit} noValidate>
              <fieldset disabled={saving || saved} className="activity-form-card">
                <div className="activity-field">
                  <label htmlFor="activity-content">{claim ? '认领说明' : '线索内容'}</label>
                  <textarea
                    id="activity-content"
                    name="content"
                    ref={contentRef}
                    value={content}
                    rows={5}
                    maxLength={500}
                    onChange={(event) => update(setContent, 'content', event.target.value)}
                    placeholder={
                      claim
                        ? '例如：我在图书馆遗失了相似的雨伞，可以进一步核对细节。'
                        : '例如：今天下午在图书馆一楼看到相似物品，已交给服务台。'
                    }
                    aria-invalid={errors.content ? true : undefined}
                    aria-describedby={errors.content ? 'activity-content-error' : undefined}
                  />
                  {errors.content ? (
                    <p className="activity-field-error" id="activity-content-error">
                      {errors.content}
                    </p>
                  ) : null}
                  <span className="activity-counter">{[...content].length} / 500</span>
                </div>
                <div className="activity-field">
                  <label htmlFor="activity-contact">我的联系方式</label>
                  <input
                    id="activity-contact"
                    name="contact"
                    ref={contactRef}
                    value={contact}
                    maxLength={80}
                    onChange={(event) => update(setContact, 'contact', event.target.value)}
                    placeholder="例如：student@example.com"
                    type="text"
                    autoComplete="off"
                    aria-invalid={errors.contact ? true : undefined}
                    aria-describedby={
                      errors.contact
                        ? 'activity-contact-error activity-contact-hint'
                        : 'activity-contact-hint'
                    }
                  />
                  {errors.contact ? (
                    <p className="activity-field-error" id="activity-contact-error">
                      {errors.contact}
                    </p>
                  ) : null}
                  <p className="activity-field-hint" id="activity-contact-hint">
                    随记录保存在本机，便于你联系时核对。
                  </p>
                </div>
              </fieldset>
            </form>
          </>
        )}
      </div>
      {(kind === 'clue' || kind === 'claim') && item?.id ? (
        <div className="activity-actionbar" aria-busy={saving}>
          {saved ? (
            <Button onClick={onBack}>返回查看</Button>
          ) : (
            <Button type="submit" form="activity-form" disabled={saving}>
              {saving ? '正在保存…' : `保存${label}`}
            </Button>
          )}
          <p>仅保存本机，不会自动发送</p>
        </div>
      ) : null}
    </section>
  );
}
