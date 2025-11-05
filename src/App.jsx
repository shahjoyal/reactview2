// src/App.jsx
import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import BunkersGrid from './components/BunkersGrid';
import SingleBunker from './components/SingleBunker';
import StatsPanel from './components/StatsPanel';
import useBlend from './hooks/useBlend';

export default function App() {
  const { coalDB, blend, refreshAll } = useBlend();
  const [activeMode, setActiveMode] = useState('overview'); // 'overview' | 'bunker'
  const [activeBunkerIdx, setActiveBunkerIdx] = useState(0);
  const [activeUnit, setActiveUnit] = useState(Number(localStorage.getItem('currentUnit') || 1));

  // persist unit selection
  useEffect(() => {
    localStorage.setItem('currentUnit', String(activeUnit));
    try { window.DASHBOARD_ACTIVE_UNIT = activeUnit; } catch (e) { /* ignore */ }
  }, [activeUnit]);

  // Bridge to original dashboard.js rendering functions.
  useEffect(() => {
    try {
      // set authoritative globals for legacy renderer
      window.COAL_DB = coalDB || window.COAL_DB || [];
      window.LATEST_BLEND = blend || window.LATEST_BLEND || { bunkers: [] };

      // ensure top-overlay arrows exist (legacy code expects 8 .arrow elements inside #topOverlay)
      (function ensureOverlayArrows() {
        const overlay = document.getElementById('topOverlay');
        if (!overlay) return;
        const positions = ['6.25%','18.75%','31.25%','43.75%','56.25%','68.75%','81.25%','93.75%'];
        const existing = overlay.querySelectorAll('.arrow');
        if (existing.length >= 8) return;
        // remove any stray children then recreate exact eight arrows to ensure consistent markup
        overlay.innerHTML = `<div class="top-line" id="topLine"></div>`;
        for (let i = 0; i < 8; i++) {
          const d = document.createElement('div');
          d.className = 'arrow';
          d.style.left = positions[i];
          overlay.appendChild(d);
        }
      })();

      

      // sync color map if function present in dashboard.js
      if (typeof window.syncColorMapFromCoalDB === 'function') {
        try { window.syncColorMapFromCoalDB(window.COAL_DB); } catch (e) { /* ignore */ }
      }

      // call renderer on next animation frame to avoid race with DOM updates
      requestAnimationFrame(() => {
        try {
          if (typeof window.refreshAndRender === 'function') {
            window.refreshAndRender(activeMode || 'overview', activeBunkerIdx || 0, Number(localStorage.getItem('currentUnit') || activeUnit || 1));
          } else {
            if ((activeMode || 'overview') === 'overview' && typeof window.renderOverview === 'function') {
              window.renderOverview(window.LATEST_BLEND, window.COAL_DB);
            } else if (typeof window.renderSingle === 'function') {
              window.renderSingle(activeBunkerIdx || 0, window.LATEST_BLEND, window.COAL_DB);
            }
          }

          // dispatch the events legacy listeners expect
          try {
            window.dispatchEvent(new CustomEvent('blend:updated', { detail: { blend: window.LATEST_BLEND } }));
            window.dispatchEvent(new CustomEvent('flows:update', { detail: { flows: (window.LATEST_BLEND && window.LATEST_BLEND.flows) || [] } }));
          } catch (e) { /* ignore */ }

          // After a very short delay, enforce authoritative flows/timers into DOM inputs (handles race where other script sets defaults)
          setTimeout(() => {
            try {
              // 1) ensure .flow-input values match LATEST_BLEND.flows
              const flows = (window.LATEST_BLEND && Array.isArray(window.LATEST_BLEND.flows)) ? window.LATEST_BLEND.flows : [];
              const flowInputs = document.querySelectorAll('.flow-input');
              if (flowInputs && flowInputs.length) {
                Array.from(flowInputs).forEach((inp, idx) => {
                  const val = (typeof flows[idx] !== 'undefined' && flows[idx] !== null) ? String(flows[idx]) : '';
                  if (inp.value !== val) {
                    inp.value = val;
                    // dispatch input event to notify React/other listeners
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                });
              } else {
                // also try legacy '.value' divs inside #coalFlowGrid if present
                const valueDivs = document.querySelectorAll('#coalFlowGrid .value');
                if (valueDivs && valueDivs.length) {
                  Array.from(valueDivs).forEach((d, idx) => {
                    const val = (typeof flows[idx] !== 'undefined' && flows[idx] !== null) ? String(flows[idx]) : '--';
                    if (d.textContent !== val) d.textContent = val;
                  });
                }
              }

              // 2) ensure timer inputs show authoritative timers if window.TIMERS_SECONDS exists
              const timers = window.TIMERS_SECONDS || [];
              const timerInputs = document.querySelectorAll('.timer-input');
              if (timerInputs && timerInputs.length) {
                Array.from(timerInputs).forEach((t, idx) => {
                  const s = timers[idx];
                  const formatted = (s == null || !isFinite(s)) ? '--' : (function(sec){ const S=Math.max(0,Math.round(sec)); const h=Math.floor(S/3600); const m=Math.floor((S%3600)/60); const ss=S%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; })(s);
                  if (t.value !== formatted) {
                    t.value = formatted;
                  }
                });
              }
            } catch (e) {
              // swallow to avoid breaking UI
              // console.warn('Flow/timer DOM sync failed', e);
            }
          }, 40); // small delay to allow any other init code to run
        } catch (e) {
          // ignore bridge errors to avoid breaking React UI if dashboard.js not loaded yet
          // console.warn('dashboard bridge error', e);
        }
      });
    } catch (e) {
      // ignore
    }
  }, [blend, coalDB, activeMode, activeBunkerIdx, activeUnit]);

  // top-level handlers
  const openOverview = () => setActiveMode('overview');
  const openSingle = (idx) => { setActiveMode('bunker'); setActiveBunkerIdx(idx); };

  return (
    <div className={`app ${activeMode === 'bunker' ? 'single-mode' : ''}`}>
      <Sidebar
        activeMode={activeMode}
        setActiveMode={(mode, idx) => {
          setActiveMode(mode);
          if (typeof idx === 'number') setActiveBunkerIdx(idx);
        }}
        activeBunkerIdx={activeBunkerIdx}
        activeUnit={activeUnit}
        setActiveUnit={(u) => setActiveUnit(u)}
      />

      <main className="main">
        <Topbar onRefresh={() => refreshAll(activeUnit)} />
        <div className="layout-card">
          <div className="layout-row">
            <div className="diagram-column">
              <div className="diagram-inner" id="diagramInner">
                <div className="top-overlay" aria-hidden="true" id="topOverlay">
                  <div className="top-line" id="topLine"></div>

                  {/* Overview arrows (one per bunker column) */}
                  <div className="arrow" style={{ left: '6.25%' }}></div>
                  <div className="arrow" style={{ left: '18.75%' }}></div>
                  <div className="arrow" style={{ left: '31.25%' }}></div>
                  <div className="arrow" style={{ left: '43.75%' }}></div>
                  <div className="arrow" style={{ left: '56.25%' }}></div>
                  <div className="arrow" style={{ left: '68.75%' }}></div>
                  <div className="arrow" style={{ left: '81.25%' }}></div>
                  <div className="arrow" style={{ left: '93.75%' }}></div>
                </div>

                {/* Overview */}
                <div id="overviewView" style={{ display: activeMode === 'overview' ? '' : 'none' }}>
                  <BunkersGrid
                    blend={blend}
                    coalDB={coalDB}
                    activeUnit={activeUnit} 
                    onOpenSingle={(idx) => openSingle(idx)}
                  />
                </div>

                {/* Single bunker view */}
                <div id="singleView" style={{ display: activeMode === 'bunker' ? '' : 'none' }}>
                  <SingleBunker idx={activeBunkerIdx} blend={blend} coalDB={coalDB} />
                </div>
              </div>
            </div>

            <div className="stats-column">
              <StatsPanel blend={blend} coalDB={coalDB} />
            </div>
          </div>
        </div>
      </main>

      {/* Tooltip element expected by the original dashboard.js */}
      <div id="coalTooltip" className="coal-tooltip" aria-hidden="true"></div>
    </div>
  );
}
