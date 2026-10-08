import React from 'react';
import { Hero } from './ui.jsx';

export default function App() {
  return (
    <div className="desktop-canvas">
      <div className="phone" aria-label="拾伴校园失物招领">
        <header className="home-header"><h1>拾伴</h1></header>
        <main className="page-scroll"><Hero /></main>
      </div>
    </div>
  );
}
