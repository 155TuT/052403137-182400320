import React from 'react';
import { getItemIcon, getItemPhotoUrls } from './itemPresentation.js';

const aliases = {
  key: 'keys',
  cup: 'bottle',
  pin: 'service',
  bag: 'mascot-pocket',
  heart: 'mascot-pocket',
  link: 'search',
};
export function Icon({ name = 'mascot-pocket', size = 32, alt = '', className = '' }) {
  return (
    <img
      className={`illustration ${className}`}
      src={`./assets/${aliases[name] || name}.svg`}
      width={size}
      height={size}
      alt={alt}
      draggable="false"
    />
  );
}
export function Glyph({ name, size = 20 }) {
  return (
    <img
      className="glyph"
      src={`./assets/ui-${name}.svg`}
      width={size}
      height={size}
      alt=""
      draggable="false"
    />
  );
}
export function ItemArtwork({ item, size = 72, photoClassName = '', alt = '' }) {
  const photo = getItemPhotoUrls(item)[0];
  return photo ? (
    <img
      className={`item-artwork-photo ${photoClassName}`}
      src={photo}
      width={size}
      height={size}
      alt={alt}
      draggable="false"
    />
  ) : (
    <Icon name={getItemIcon(item)} size={size} alt={alt} />
  );
}
export function Button({ children, variant = 'primary', className = '', ...props }) {
  return (
    <button type="button" className={`button button--${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function PageHeader({ title, onBack, actions }) {
  return (
    <header className="page-header">
      <button className="round-button back-button" aria-label="返回上一页" onClick={onBack}>
        <Glyph name="back" />
      </button>
      <h1>{title}</h1>
      <div className="header-actions">{actions || <span className="header-spacer" />}</div>
    </header>
  );
}
export function PageTitle({ title, subtitle, icon = 'mascot-pocket', item }) {
  return (
    <div className="page-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {item ? <ItemArtwork item={item} size={72} /> : <Icon name={icon} size={72} />}
    </div>
  );
}
export function InfoCard({ title, children, tone = 'white', className = '' }) {
  return (
    <section className={`info-card info-card--${tone} ${className}`}>
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}
export function Hero({ mine = false }) {
  return (
    <section className={`hero ${mine ? 'hero--mine' : ''}`}>
      <div className="hero-copy">
        <h2>
          {mine ? (
            <>
              今天，也有
              <br />
              小小的好事
            </>
          ) : (
            <>
              让小物，
              <br />
              找到回家的路
            </>
          )}
        </h2>
        <p>{mine ? '每一份帮助，都被认真记下。' : '顺手登记一下，也许就帮到了谁。'}</p>
      </div>
      <Icon name="mascot-pocket" size={88} />
    </section>
  );
}
export function EmptyState({
  title = '暂时没有找到',
  description = '换个关键词，或者放宽一点条件试试。',
  action,
}) {
  return (
    <section className="empty-state">
      <Icon name="search" size={88} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </section>
  );
}
