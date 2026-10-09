import React, { useRef, useState } from 'react';
import { CATEGORIES, CAMPUSES, validateItem } from './model.js';
import { PageHeader, PageTitle, Button, InfoCard } from './ui.jsx';
import './editor.css';

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function initialForm(type, data) {
  return {
    ...data,
    type: data?.type || type,
    name: data?.name || '',
    category: data?.category || '',
    campus: data?.campus || CAMPUSES[0] || '',
    area: data?.area || '',
    eventDate: data?.eventDate?.slice(0, 10) || '',
    description: data?.description || '',
    contact: data?.contact || '',
    images: (data?.images || []).map((image) => ({ ...image })),
  };
}

async function compressImage(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const source = new Image();
      source.onload = () => resolve(source);
      source.onerror = () => reject(new Error(`“${file.name}”无法读取，请换一张图片。`));
      source.src = objectUrl;
    });
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('暂时无法处理图片，请重试；也可以不添加图片。');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    return { type: 'image/jpeg', size: atob(dataUrl.split(',')[1]).length, dataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function Field({ name, label, error, hint, children }) {
  return (
    <div className={`editor-field${error ? ' editor-field--invalid' : ''}`}>
      <label htmlFor={`item-${name}`}>{label}</label>
      {children}
      {error ? (
        <p className="editor-field-error" id={`item-${name}-error`}>
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="editor-field-hint" id={`item-${name}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default function Editor({
  type = 'found',
  initialData = null,
  initialSession = { expected: [] },
  onBack,
  onSaveDraft,
  onPublish,
  onReload,
}) {
  const [form, setForm] = useState(() => initialForm(type, initialData));
  const session = useRef(initialSession);
  const [conflict, setConflict] = useState(false);
  const [step, setStep] = useState('edit');
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState('');
  const [published, setPublished] = useState(false);
  const busy = useRef(false);
  const uploadInput = useRef(null);
  const scrollArea = useRef(null);
  const lost = form.type === 'lost';
  const transfer = !lost && form.relation === 'transfer';
  const service = !lost && form.relation === 'service';
  const relationLabel = transfer
    ? '转报线索 · 来源待核实'
    : service
      ? '服务点移交登记 · 尚待接收确认'
      : lost
        ? '本人寻物'
        : '本人拾得';
  const pageLabel = transfer
    ? '转报线索'
    : service
      ? '登记服务点移交'
      : lost
        ? '发布寻物'
        : '发布招领';
  const isPreview = step === 'preview';
  const locked = Boolean(working) || published;
  function change(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setFailure('');
    setNotice('');
  }

  function attributes(name, hint = false) {
    return {
      id: `item-${name}`,
      name,
      value: form[name],
      onChange: (event) => change(name, event.target.value),
      'aria-invalid': errors[name] ? true : undefined,
      'aria-describedby':
        [errors[name] && `item-${name}-error`, hint && `item-${name}-hint`]
          .filter(Boolean)
          .join(' ') || undefined,
    };
  }

  function validate() {
    const nextErrors = validateItem(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setFailure('还有信息需要检查，已在对应位置标出。');
      requestAnimationFrame(() => {
        const first = document.getElementById(`item-${Object.keys(nextErrors)[0]}`);
        first?.focus();
        first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      return false;
    }
    return true;
  }

  function preview(event) {
    event.preventDefault();
    if (busy.current || published || !validate()) return;
    setFailure('');
    setNotice('');
    setStep('preview');
    scrollArea.current?.scrollTo({ top: 0 });
  }

  function returnToEdit() {
    if (busy.current) return;
    setStep('edit');
    setFailure('');
    scrollArea.current?.scrollTo({ top: 0 });
  }

  async function persist(action) {
    if (busy.current || published) return;
    if (action === 'publish' && !validate()) {
      setStep('edit');
      return;
    }
    busy.current = true;
    setWorking(action);
    setFailure('');
    setNotice('');
    try {
      const snapshot = { ...form, images: form.images.map((image) => ({ ...image })) };
      if (action === 'publish') {
        await onPublish(snapshot, session.current);
        setPublished(true);
        setNotice('信息已发布，可以回到列表查看。');
      } else {
        const saved = await onSaveDraft(snapshot, session.current, { asCopy: action === 'copy' });
        session.current = saved.session;
        setForm(initialForm(type, saved.draft));
        setNotice(
          action === 'copy'
            ? '已另存为新草稿，原记录和其他页面的修改均保留。'
            : '草稿已保存，下次可以继续填写。',
        );
      }
      setConflict(false);
    } catch (error) {
      if (error?.code === 'STATE_CONFLICT') setConflict(true);
      const detail = error instanceof Error ? error.message : '';
      if (error?.errors) {
        setErrors(error.errors);
        setStep('edit');
      }
      setFailure(
        `${action === 'publish' ? '发布' : '保存'}未完成，填写的内容仍在。${detail || '请重试。'}`,
      );
      scrollArea.current?.scrollTo({ top: 0 });
    } finally {
      busy.current = false;
      setWorking('');
    }
  }

  async function reloadLatest() {
    if (busy.current) return;
    busy.current = true;
    setWorking('reload');
    try {
      const latest = await onReload(session.current);
      session.current = latest.session;
      setForm(initialForm(type, latest.form));
      setStep('edit');
      setErrors({});
      setFailure('');
      setConflict(false);
      setNotice('已载入最新内容，可以重新修改。');
    } catch (error) {
      setFailure(error.message);
    } finally {
      busy.current = false;
      setWorking('');
    }
  }

  async function addImages(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || busy.current) return;
    if (form.images.length + files.length > MAX_IMAGES) {
      setErrors((current) => ({ ...current, images: '最多添加 3 张图片，请减少选择的数量。' }));
      return;
    }
    const invalid = files.find(
      (file) => !['image/jpeg', 'image/png'].includes(file.type) || file.size > MAX_IMAGE_BYTES,
    );
    if (invalid) {
      setErrors((current) => ({
        ...current,
        images: `“${invalid.name}”不符合要求，请选择不超过 5MB 的 JPG 或 PNG 图片。`,
      }));
      return;
    }
    busy.current = true;
    setWorking('images');
    setFailure('');
    try {
      const images = await Promise.all(files.map(compressImage));
      setForm((current) => ({ ...current, images: [...current.images, ...images] }));
      setErrors((current) => ({ ...current, images: undefined }));
      setNotice('');
    } catch (error) {
      setErrors((current) => ({
        ...current,
        images: error instanceof Error ? error.message : '图片处理失败，请重新选择。',
      }));
    } finally {
      busy.current = false;
      setWorking('');
    }
  }

  return (
    <section className="editor-page" aria-label={isPreview ? '公开预览' : pageLabel}>
      <PageHeader
        title={isPreview ? '公开预览' : pageLabel}
        onBack={locked ? undefined : isPreview ? returnToEdit : onBack}
      />
      <div className="editor-scroll" ref={scrollArea}>
        <PageTitle
          title={
            isPreview
              ? '公开前，再看一眼'
              : transfer
                ? '把线索来源说清楚'
                : service
                  ? '记下这次移交'
                  : lost
                    ? '让更多人帮你留意'
                    : '捡到小物，顺手登记'
          }
          subtitle={
            isPreview
              ? '确认这些信息，再让大家看到'
              : transfer
                ? '转报线索 · 尚未确认实际持有人'
                : service
                  ? '发布者登记 · 尚待服务点接收确认'
                  : lost
                    ? '本人寻物 · 先写下你记得的'
                    : '本人拾得 · 图片不是必填'
          }
          item={form}
        />
        {failure ? (
          <div className="editor-message editor-message--error" role="alert">
            {failure}
          </div>
        ) : null}
        {conflict ? (
          <InfoCard title="其他页面已修改这条记录">
            <p>你的填写内容仍在。可以单独保存当前内容，或放弃当前修改并载入最新记录。</p>
            <div className="editor-conflict-actions">
              <Button type="button" disabled={locked} onClick={() => persist('copy')}>
                当前内容另存新草稿
              </Button>
              <Button type="button" variant="secondary" disabled={locked} onClick={reloadLatest}>
                放弃当前修改，载入最新
              </Button>
            </div>
          </InfoCard>
        ) : null}
        {notice ? (
          <div className="editor-message editor-message--success" role="status">
            {notice}
          </div>
        ) : null}

        {isPreview ? (
          <>
            <section className="editor-card editor-preview">
              <span className={`editor-type${lost ? ' editor-type--lost' : ''}`}>
                {relationLabel}
              </span>
              <h2>{form.name}</h2>
              <dl>
                <div>
                  <dt>物品类别</dt>
                  <dd>{form.category}</dd>
                </div>
                <div>
                  <dt>{lost ? '遗失地点' : transfer ? '线索地点' : '拾取地点'}</dt>
                  <dd>
                    {form.campus} · {form.area}
                  </dd>
                </div>
                <div>
                  <dt>{lost ? '遗失日期' : transfer ? '线索日期' : '拾取日期'}</dt>
                  <dd>{form.eventDate || '时间不确定'}</dd>
                </div>
                {transfer ? (
                  <div>
                    <dt>来源状态</dt>
                    <dd>转报来源与实际持有人尚待核实，转报人不等于持有人。</dd>
                  </div>
                ) : service ? (
                  <div>
                    <dt>移交状态</dt>
                    <dd>发布者登记已交服务点，尚未获得服务点接收确认。</dd>
                  </div>
                ) : null}
              </dl>
              <p className="editor-preview-description">{form.description || '暂未补充描述'}</p>
              {form.images.length ? (
                <div className="editor-preview-images">
                  {form.images.map((image, index) => (
                    <img src={image.dataUrl} key={index} alt={`${form.name}图片 ${index + 1}`} />
                  ))}
                </div>
              ) : (
                <p className="editor-field-hint">未添加图片，无照片也可发布。</p>
              )}
            </section>
            <InfoCard title="大家也会看到联系方式" tone="soft">
              <p className="editor-contact-value">{form.contact}</p>
              <p>
                联系方式将直接显示在详情页，便于对方联系你。请确认内容准确，并使用你愿意公开的联系方式。
              </p>
            </InfoCard>
            <InfoCard
              title={
                lost
                  ? '找回后，记得更新'
                  : transfer || service
                    ? '确认进展后，记得更新'
                    : '归还后，记得更新'
              }
            >
              <p>
                发布后可以从“我的发布”查看和管理，
                {lost
                  ? '找回后标记“已找到”'
                  : transfer
                    ? '向实际持有人确认物品已归还后，再标记“已归还”'
                    : service
                      ? '向服务点确认物品已归还后，再标记“已归还”；登记移交不等于服务点已接收或物品已归还'
                      : '交还后标记“已归还”'}
                ，减少重复询问。
              </p>
            </InfoCard>
          </>
        ) : (
          <form id="item-editor-form" onSubmit={preview} noValidate>
            <fieldset className="editor-fields" disabled={locked}>
              <section className="editor-card">
                <h2>物品与关系</h2>
                <p className="editor-card-caption">
                  {transfer
                    ? '我只转报线索，来源与实际持有人尚待核实'
                    : service
                      ? '我登记已交服务点，尚待服务点确认接收'
                      : lost
                        ? '本人遗失，希望大家帮忙留意'
                        : '本人拾得，等待主人来认领'}
                </p>
                <Field name="name" label="物品名称" error={errors.name}>
                  <input
                    {...attributes('name')}
                    type="text"
                    placeholder={lost ? '例如：蓝色折叠伞' : '例如：一串银色钥匙'}
                    maxLength={30}
                    autoComplete="off"
                  />
                </Field>
                <Field name="category" label="物品类别" error={errors.category}>
                  <select {...attributes('category')}>
                    <option value="">选择最接近的类别</option>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  name="description"
                  label={
                    transfer ? '线索来源与公开描述' : service ? '服务点与移交情况' : '公开描述'
                  }
                  error={errors.description}
                  hint={
                    transfer
                      ? '说明原消息来源与已知情况；尚未核实的内容请明确标注。'
                      : service
                        ? '填写服务点名称与移交情况；发布这条记录不会产生服务点接收确认。'
                        : '说清颜色、外观与大致情况，保留独特细节用于当面核对。'
                  }
                >
                  <textarea
                    {...attributes('description', true)}
                    rows={3}
                    placeholder={
                      lost
                        ? '例如：浅蓝色、素色折叠伞，没有外包装。'
                        : '例如：两把银色钥匙，带素色挂绳。'
                    }
                    maxLength={300}
                  />
                </Field>
              </section>

              <section className="editor-card">
                <h2>{lost ? '遗失时间与区域' : transfer ? '线索时间与区域' : '发现时间与区域'}</h2>
                <Field name="campus" label="所在校区" error={errors.campus}>
                  <select {...attributes('campus')}>
                    {CAMPUSES.map((campus) => (
                      <option key={campus} value={campus}>
                        {campus}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  name="area"
                  label={lost ? '遗失区域' : transfer ? '线索区域' : '拾取区域'}
                  error={errors.area}
                >
                  <input
                    {...attributes('area')}
                    type="text"
                    placeholder="例如：图书馆东侧、教学区连廊"
                    maxLength={60}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  name="eventDate"
                  label={lost ? '遗失日期' : transfer ? '线索日期' : '拾取日期'}
                  error={errors.eventDate}
                  hint="记不清具体日期，可以留空。"
                >
                  <input {...attributes('eventDate', true)} type="date" />
                </Field>
              </section>

              <section className="editor-card">
                <h2>图片</h2>
                <Field
                  name="images"
                  label={`物品照片 · ${form.images.length} / 3`}
                  error={errors.images}
                  hint="图片不是必填；最多 3 张 JPG / PNG，每张不超过 5MB。"
                >
                  <div className="editor-image-grid">
                    {form.images.map((image, index) => (
                      <div className="editor-image" key={index}>
                        <img src={image.dataUrl} alt={`已添加的物品图片 ${index + 1}`} />
                        <button
                          type="button"
                          className="editor-image-remove"
                          aria-label={`删除第 ${index + 1} 张图片`}
                          onClick={() =>
                            change(
                              'images',
                              form.images.filter((_, position) => position !== index),
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {form.images.length < MAX_IMAGES ? (
                      <button
                        id="item-images"
                        className="editor-image-add"
                        type="button"
                        onClick={() => uploadInput.current?.click()}
                        aria-describedby={
                          errors.images ? 'item-images-error item-images-hint' : 'item-images-hint'
                        }
                        aria-invalid={errors.images ? true : undefined}
                      >
                        <span aria-hidden="true">＋</span>
                        <span>{working === 'images' ? '处理图片中' : '添加照片'}</span>
                      </button>
                    ) : null}
                  </div>
                  <input
                    className="editor-file-input"
                    ref={uploadInput}
                    type="file"
                    accept="image/jpeg,image/png"
                    multiple
                    onChange={addImages}
                    aria-label="选择物品照片"
                  />
                </Field>
              </section>

              <section className="editor-card">
                <h2>让对方联系到你</h2>
                <Field
                  name="contact"
                  label="联系方式"
                  error={errors.contact}
                  hint="这项内容会公开在详情页，请填写愿意公开的电话、微信、QQ 或邮箱。"
                >
                  <input
                    {...attributes('contact', true)}
                    type="text"
                    placeholder="例如：微信 shiban-campus"
                    maxLength={80}
                    autoComplete="off"
                  />
                </Field>
              </section>
              <InfoCard title="保留一个小秘密" tone="soft">
                <p>不要公开证件号码、家庭住址或全部识别特征。核对物品后，再与对方约定交还。</p>
              </InfoCard>
            </fieldset>
          </form>
        )}
      </div>
      <div className="editor-actionbar" aria-busy={Boolean(working)}>
        {published ? (
          <Button type="button" onClick={onBack}>
            返回查看
          </Button>
        ) : isPreview ? (
          <>
            <Button type="button" disabled={locked} onClick={() => persist('publish')}>
              {working === 'publish' ? '正在提交…' : '确认提交'}
            </Button>
            <Button type="button" variant="secondary" disabled={locked} onClick={returnToEdit}>
              返回修改
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" form="item-editor-form" disabled={locked}>
              查看公开预览
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={locked}
              onClick={() => persist('draft')}
            >
              {working === 'draft'
                ? '正在保存…'
                : working === 'images'
                  ? '正在处理图片…'
                  : '保存草稿'}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
