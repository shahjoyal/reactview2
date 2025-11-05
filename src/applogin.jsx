// src/App.jsx
import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import BunkersGrid from './components/BunkersGrid';
import SingleBunker from './components/SingleBunker';
import StatsPanel from './components/StatsPanel';
import useBlend from './hooks/useBlend';
import Login from './components/Login';

export default function App() {
  const { coalDB, blend, refreshAll } = useBlend();
  const [activeMode, setActiveMode] = useState('overview'); // 'overview' | 'bunker'
  const [activeBunkerIdx, setActiveBunkerIdx] = useState(0);
  const [activeUnit, setActiveUnit] = useState(Number(localStorage.getItem('currentUnit') || 1));
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem('authToken')));

  useEffect(() => {
    localStorage.setItem('currentUnit', String(activeUnit));
    try { window.DASHBOARD_ACTIVE_UNIT = activeUnit; } catch (e) { /* ignore */ }
  }, [activeUnit]);

  // Bridge & renderer run only after authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      window.COAL_DB = coalDB || window.COAL_DB || [];
      window.LATEST_BLEND = blend || window.LATEST_BLEND || { bunkers: [] };

      (function ensureOverlayArrows() {
        const overlay = document.getElementById('topOverlay');
        if (!overlay) return;
        const positions = ['6.25%','18.75%','31.25%','43.75%','56.25%','68.75%','81.25%','93.75%'];
        const existing = overlay.querySelectorAll('.arrow');
        if (existing.length >= 8) return;
        overlay.innerHTML = `<div class="top-line" id="topLine"></div>`;
        for (let i = 0; i < 8; i++) {
          const d = document.createElement('div');
          d.className = 'arrow';
          d.style.left = positions[i];
          overlay.appendChild(d);
        }
      })();

      if (typeof window.syncColorMapFromCoalDB === 'function') {
        try { window.syncColorMapFromCoalDB(window.COAL_DB); } catch (e) { /* ignore */ }
      }

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

          try {
            window.dispatchEvent(new CustomEvent('blend:updated', { detail: { blend: window.LATEST_BLEND } }));
            window.dispatchEvent(new CustomEvent('flows:update', { detail: { flows: (window.LATEST_BLEND && window.LATEST_BLEND.flows) || [] } }));
          } catch (e) { /* ignore */ }

          setTimeout(() => {
            try {
              const flows = (window.LATEST_BLEND && Array.isArray(window.LATEST_BLEND.flows)) ? window.LATEST_BLEND.flows : [];
              const flowInputs = document.querySelectorAll('.flow-input');
              if (flowInputs && flowInputs.length) {
                Array.from(flowInputs).forEach((inp, idx) => {
                  const val = (typeof flows[idx] !== 'undefined' && flows[idx] !== null) ? String(flows[idx]) : '';
                  if (inp.value !== val) {
                    inp.value = val;
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                });
              } else {
                const valueDivs = document.querySelectorAll('#coalFlowGrid .value');
                if (valueDivs && valueDivs.length) {
                  Array.from(valueDivs).forEach((d, idx) => {
                    const val = (typeof flows[idx] !== 'undefined' && flows[idx] !== null) ? String(flows[idx]) : '--';
                    if (d.textContent !== val) d.textContent = val;
                  });
                }
              }

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
            } catch (e) { }
          }, 40);
        } catch (e) { }
      });
    } catch (e) { }
  }, [blend, coalDB, activeMode, activeBunkerIdx, activeUnit, isAuthenticated]);

  const openOverview = () => setActiveMode('overview');
  const openSingle = (idx) => { setActiveMode('bunker'); setActiveBunkerIdx(idx); };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="app-login-shell">
        <Login
          onSuccess={(token) => {
            localStorage.setItem('authToken', token);
            setIsAuthenticated(true);
          }}
        />
      </div>
    );
  }

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
        onLogout={handleLogout}
      />

      <main className="main">
        <Topbar onRefresh={() => refreshAll(activeUnit)} onLogout={handleLogout} />
        <div className="layout-card">
          <div className="layout-row">
            <div className="diagram-column">
              <div className="diagram-inner" id="diagramInner">
                <div className="top-overlay" aria-hidden="true" id="topOverlay">
                  <div className="top-line" id="topLine"></div>

                  <div className="arrow" style={{ left: '6.25%' }}></div>
                  <div className="arrow" style={{ left: '18.75%' }}></div>
                  <div className="arrow" style={{ left: '31.25%' }}></div>
                  <div className="arrow" style={{ left: '43.75%' }}></div>
                  <div className="arrow" style={{ left: '56.25%' }}></div>
                  <div className="arrow" style={{ left: '68.75%' }}></div>
                  <div className="arrow" style={{ left: '81.25%' }}></div>
                  <div className="arrow" style={{ left: '93.75%' }}></div>
                </div>

                <div id="overviewView" style={{ display: activeMode === 'overview' ? '' : 'none' }}>
                  <BunkersGrid
                    blend={blend}
                    coalDB={coalDB}
                    activeUnit={activeUnit}
                    onOpenSingle={(idx) => openSingle(idx)}
                  />
                </div>

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

      <div id="coalTooltip" className="coal-tooltip" aria-hidden="true"></div>
    </div>
  );
}
