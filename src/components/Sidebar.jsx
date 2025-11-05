// src/components/Sidebar.jsx
import React from 'react';

export default function Sidebar({ activeMode, setActiveMode, activeBunkerIdx, activeUnit, setActiveUnit }) {
  return (
    <aside className="sidebar" id="sidebar">
      <div className="title">Views</div>

      <div id="unitSelector" style={{ display: 'flex', gap: 6, padding: 8 }}>
        {[1,2,3].map(u => (
          <button
            key={u}
            className={`unit-btn ${activeUnit === u ? 'active' : ''}`}
            data-unit={u}
            id={`unit-btn-${u}`}
            aria-pressed={activeUnit === u}
            onClick={() => {
              setActiveUnit(u);
              // call the original setActiveUnit if present (keeps any global state)
              if (typeof window.setActiveUnit === 'function') window.setActiveUnit(u);
              // trigger original refresh if available
              if (typeof window.refreshAndRender === 'function') {
                const activeItem = document.querySelector('.sidebar .item.active');
                const mode = activeItem ? activeItem.dataset.mode : 'overview';
                const idx = activeItem && activeItem.dataset.index ? Number(activeItem.dataset.index) : 0;
                window.refreshAndRender(mode, idx, u);
              }
            }}
          >
            Unit {u}
          </button>
        ))}
      </div>

      <div
        className={`item ${activeMode === 'overview' ? 'active' : ''}`}
        data-mode="overview"
        id="tab-overview"
        onClick={() => setActiveMode('overview', null)}
      >
        <span className="s-icon">O</span><span className="s-label">Overview</span>
      </div>

      {Array.from({ length: 8 }).map((_, idx) => (
        <div
          key={idx}
          className={`item ${activeMode === 'bunker' && activeBunkerIdx === idx ? 'active' : ''}`}
          data-mode="bunker"
          data-index={idx}
          onClick={() => setActiveMode('bunker', idx)}
        >
          <span className="s-icon">{idx+1}</span><span className="s-label">Bunker {idx+1}</span>
        </div>
      ))}
    </aside>
  );
}
