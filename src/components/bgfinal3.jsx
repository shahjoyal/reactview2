// src/components/BunkersGrid.jsx
import React, { useEffect, useMemo, useState } from 'react';

/* ---------- helpers (kept from your original file) ---------- */
function secondsToHHMMSS(secondsRaw) {
  if (!isFinite(secondsRaw) || secondsRaw === null) return '--';
  const s = Math.max(0, Math.round(secondsRaw));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function calcAFT(ox) {
  if (!ox) return null;
  const total = ["SiO2","Al2O3","Fe2O3","CaO","MgO","Na2O","K2O","SO3","TiO2"]
    .reduce((s,k)=> s + (Number(ox[k])||0), 0);
  if (total === 0) return null;
  const SiO2 = Number(ox.SiO2)||0, Al2O3 = Number(ox.Al2O3)||0, Fe2O3 = Number(ox.Fe2O3)||0;
  const CaO = Number(ox.CaO)||0, MgO = Number(ox.MgO)||0, Na2O = Number(ox.Na2O)||0, K2O = Number(ox.K2O)||0;
  const SO3 = Number(ox.SO3)||0, TiO2 = Number(ox.TiO2)||0;
  const sum = SiO2 + Al2O3;
  let aft = 0;
  if (sum < 55) {
    aft = 1245 + (1.1 * SiO2) + (0.95 * Al2O3) - (2.5 * Fe2O3) - (2.98 * CaO) - (4.5 * MgO)
      - (7.89 * (Na2O + K2O)) - (1.7 * SO3) - (0.63 * TiO2);
  } else if (sum < 75) {
    aft = 1323 + (1.45 * SiO2) + (0.683 * Al2O3) - (2.39 * Fe2O3) - (3.1 * CaO) - (4.5 * MgO)
      - (7.49 * (Na2O + K2O)) - (2.1 * SO3) - (0.63 * TiO2);
  } else {
    aft = 1395 + (1.2 * SiO2) + (0.9 * Al2O3) - (2.5 * Fe2O3) - (3.1 * CaO) - (4.5 * MgO)
      - (7.2 * (Na2O + K2O)) - (1.7 * SO3) - (0.63 * TiO2);
  }
  return Number(aft);
}

/* tooltip DOM helpers (use/create #coalTooltip element) */
function showTooltipHtml(html, pageX, pageY) {
  const t = document.getElementById('coalTooltip');
  if (!t) return;
  t.innerHTML = html;
  t.style.display = 'block';
  t.style.left = (pageX + 10) + 'px';
  t.style.top = (pageY + 10) + 'px';
}
function moveTooltip(pageX, pageY) {
  const t = document.getElementById('coalTooltip');
  if (!t) return;
  t.style.left = (pageX + 10) + 'px';
  t.style.top = (pageY + 10) + 'px';
}
function hideTooltip() {
  const t = document.getElementById('coalTooltip');
  if (!t) return;
  t.style.display = 'none';
  t.innerHTML = '';
}

/* find in various coal DBs */
function findCoalInDbByNameOrId(coalNameOrId, coalDB, snapshot) {
  if (!coalNameOrId) return null;
  const keyLower = String(coalNameOrId).trim().toLowerCase();
  // check provided coalDB array
  if (Array.isArray(coalDB)) {
    const r = coalDB.find(c => {
      if (!c) return false;
      if (c.coal && String(c.coal).trim().toLowerCase() === keyLower) return true;
      if (c.name && String(c.name).trim().toLowerCase() === keyLower) return true;
      if ((c._id || c.id) && String(c._id || c.id) === String(coalNameOrId)) return true;
      return false;
    });
    if (r) return r;
  }
  // fallback to global window.COAL_DB
  try {
    if (typeof window !== 'undefined' && Array.isArray(window.COAL_DB)) {
      const w = window.COAL_DB.find(c => {
        if (!c) return false;
        if (c.coal && String(c.coal).trim().toLowerCase() === keyLower) return true;
        if (c.name && String(c.name).trim().toLowerCase() === keyLower) return true;
        if ((c._id || c.id) && String(c._id || c.id) === String(coalNameOrId)) return true;
        return false;
      });
      if (w) return w;
    }
  } catch(e){}
  // fallback to snapshot.coals if provided
  if (snapshot && Array.isArray(snapshot.coals)) {
    const s = snapshot.coals.find(c => {
      if (!c) return false;
      if (c.coal && String(c.coal).trim().toLowerCase() === keyLower) return true;
      if (c.name && String(c.name).trim().toLowerCase() === keyLower) return true;
      if ((c._id || c.id) && String(c._id || c.id) === String(coalNameOrId)) return true;
      return false;
    });
    if (s) return s;
  }
  return null;
}

/* tooltip html - enhanced to compute AFT via coalDoc or lookup */
function tooltipHtmlForLayer(L, coalDB, snapshot) {
  const name = L.coal || (L.coalDoc && (L.coalDoc.coal || L.coalDoc.name)) || '--';
  const pct = (L.percent != null) ? (Number(L.percent).toFixed(3) + '%') : '--';
  const gcv = (L.gcv != null) ? L.gcv : (L.coalDoc && (L.coalDoc.gcv != null) ? L.coalDoc.gcv : '--');
  const cost = (L.cost != null) ? L.cost : (L.coalDoc && (L.coalDoc.cost != null) ? L.coalDoc.cost : '--');

  // compute AFT: prefer L.coalDoc, else lookup in coalDB/snapshot
  let aftVal = null;
  if (L.coalDoc) aftVal = calcAFT(L.coalDoc);
  if ((aftVal === null || aftVal === undefined) && L.coal) {
    const found = findCoalInDbByNameOrId(L.coal, coalDB, snapshot);
    if (found) {
      // found may store oxide fields under different keys; pass the object to calcAFT
      aftVal = calcAFT(found) || (found.AFT || found.aft || found.aftValue || null);
    }
  }
  // also accept explicit L.AFT or L.aft fields
  if ((aftVal === null || aftVal === undefined) && (L.AFT != null || L.aft != null)) {
    aftVal = L.AFT != null ? L.AFT : L.aft;
  }
  const aftStr = (aftVal == null || isNaN(aftVal)) ? '--' : Math.round(Number(aftVal));

  return `<div style="font-weight:700;margin-bottom:6px">${name}</div>
          <div style="font-size:12px">Percent: ${pct}</div>
          <div style="font-size:12px">GCV: ${gcv}</div>
          <div style="font-size:12px">Cost: ${cost}</div>
          <div style="font-size:12px">AFT: ${aftStr}</div>`;
}

/* ---------- New helper: get bottom GCV for a bunker (mirrors StatsPanel behaviour) ---------- */
function getBottomGcvForBunker(blend, coalDB, bunkerIndex, snapshot) {
  try {
    // binder preference: if nextBlendBinder exists and has getActiveLayer
    if (typeof window !== 'undefined' && window.nextBlendBinder && typeof window.nextBlendBinder.getActiveLayer === 'function') {
      const activeLayer = window.nextBlendBinder.getActiveLayer(bunkerIndex);
      if (activeLayer) {
        const g = safeNum(activeLayer.gcv);
        if (g !== null) return g;
        if (activeLayer.coal) {
          const found = findCoalInDbByNameOrId(activeLayer.coal, coalDB, snapshot);
          if (found && (found.gcv !== undefined && found.gcv !== null)) return safeNum(found.gcv);
        }
      }
    }

    // 1) fallback: from bunker.layers bottom->top pick first visible with gcv or coal map
    if (Array.isArray(blend && blend.bunkers) && blend.bunkers[bunkerIndex] && Array.isArray(blend.bunkers[bunkerIndex].layers)) {
      const layers = blend.bunkers[bunkerIndex].layers;
      // iterate bottom->top: bottom assumed index 0
      for (let li = 0; li < layers.length; li++) {
        const L = layers[li];
        if (!L) continue;
        let rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
        let pctVal = null;
        if (Array.isArray(rawPct) && rawPct.length) pctVal = safeNum(rawPct[0]);
        else pctVal = safeNum(rawPct);
        // if a visible percent (or percent missing assume visible)
        if (pctVal && pctVal > 0) {
          const g = safeNum(L.gcv);
          if (g !== null) return g;
          if (L.coal) {
            const found = findCoalInDbByNameOrId(L.coal, coalDB, snapshot);
            if (found && (found.gcv !== undefined && found.gcv !== null)) return safeNum(found.gcv);
          }
        }
      }
    }

    // 2) fallback: rows mapping bottom->top (legacy)
    if (Array.isArray(blend && blend.rows)) {
      for (let r = 0; r < blend.rows.length; r++) {
        const row = blend.rows[r];
        if (!row) continue;
        let p = null;
        if (Array.isArray(row.percentages) && row.percentages.length) p = safeNum(row.percentages[0]);
        else p = safeNum(row.percent);
        if (p && p > 0) {
          const g = safeNum(row.gcv);
          if (g !== null) return g;
        }
      }
    }
  } catch (e) {
    // ignore and return null
  }
  return null;
}

/* small safe number helper */
function safeNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* compute derived metrics locally (avgGCV, heatRate, totalFlow) - same logic as your StatsPanel */
function computeDerivedMetricsLocal(blend, coalDB, snapshot) {
  try {
    if (!blend) return { avgGCV: null, heatRate: null, totalFlow: null };

    // totalFlow preference
    const bf = safeNum(blend.totalFlow);
    let totalFlow = (bf !== null) ? bf : null;

    let sumNumerator = 0;
    let sumFlowsForNumerator = 0;

    const bunkerCount = (Array.isArray(blend.bunkers) ? blend.bunkers.length : 8);
    for (let b = 0; b < bunkerCount; b++) {
      const flowVal = (Array.isArray(blend.flows) && typeof blend.flows[b] !== 'undefined') ? safeNum(blend.flows[b]) :
                      (Array.isArray(blend.bunkers) && blend.bunkers[b] && typeof blend.bunkers[b].flow !== 'undefined' ? safeNum(blend.bunkers[b].flow) : null);
      const bottomGcv = getBottomGcvForBunker(blend, coalDB, b, snapshot);
      if (flowVal !== null && bottomGcv !== null) {
        sumNumerator += (Number(bottomGcv) * Number(flowVal));
        sumFlowsForNumerator += Number(flowVal);
      }
    }

    if (totalFlow === null) {
      totalFlow = (sumFlowsForNumerator > 0) ? sumFlowsForNumerator : null;
    }

    const avgGCV = (totalFlow && totalFlow > 0) ? (sumNumerator / totalFlow) : null;

    const generation = safeNum(blend.generation);
    let heatRate = null;
    if (avgGCV !== null && totalFlow !== null && generation !== null && generation > 0) {
      heatRate = (avgGCV * Number(totalFlow)) / Number(generation);
    }

    return { avgGCV: (avgGCV === null ? null : Number(avgGCV)), heatRate: (heatRate === null ? null : Number(heatRate)), totalFlow: (totalFlow === null ? null : Number(totalFlow)) };
  } catch (e) {
    return { avgGCV: null, heatRate: null, totalFlow: null };
  }
}

/* tooltip html - small wrapper to reuse existing tooltipHtmlForLayer */
function tooltipHtmlWrapper(L, coalDB, snapshot) {
  return tooltipHtmlForLayer(L, coalDB, snapshot);
}

/* ---------- component ---------- */
export default function BunkersGrid({ blend = {}, coalDB = [], onOpenSingle = () => {} }) {
  const NUM = 8;

  // snapshot fallback (if present globally)
  const snapshot = (typeof window !== 'undefined' && window.SNAPSHOT_NORMALIZED) ? window.SNAPSHOT_NORMALIZED : null;

  const clientBunkers = useMemo(() => {
    if (snapshot && Array.isArray(snapshot.clientBunkers) && snapshot.clientBunkers.length === NUM) return snapshot.clientBunkers;
    if (snapshot && Array.isArray(snapshot.bunkers) && snapshot.bunkers.length === NUM) return snapshot.bunkers;
    if (Array.isArray(blend.bunkers) && blend.bunkers.length === NUM) return blend.bunkers;
    return Array.from({ length: NUM }).map(()=>({ layers: [] }));
  }, [snapshot, blend]);

  const flows = useMemo(() => {
    if (Array.isArray(blend.flows) && blend.flows.length === NUM) return blend.flows;
    if (snapshot && Array.isArray(snapshot.flows) && snapshot.flows.length === NUM) return snapshot.flows;
    return Array(NUM).fill('--');
  }, [blend, snapshot]);

  const initialTimers = useMemo(() => {
    const arr = Array(NUM).fill(null);
    if (snapshot && Array.isArray(snapshot.bunkerTimers)) {
      for (let i=0;i<NUM;i++) {
        const bt = snapshot.bunkerTimers[i];
        if (bt && bt.remainingSeconds != null) arr[i] = Number(bt.remainingSeconds);
        else arr[i] = null;
      }
      return arr;
    }
    for (let i=0;i<NUM;i++) {
      const layers = clientBunkers[i] && Array.isArray(clientBunkers[i].layers) ? clientBunkers[i].layers : [];
      if (layers.length) {
        const top = layers[layers.length - 1];
        if (top && top.remainingSeconds != null) arr[i] = Number(top.remainingSeconds);
      }
    }
    return arr;
  }, [snapshot, clientBunkers]);

  const [timers, setTimers] = useState(initialTimers);
  useEffect(() => { setTimers(initialTimers); }, [initialTimers]);

  useEffect(() => {
    const id = setInterval(() => {
      setTimers(prev => {
        const next = prev.slice();
        let changed = false;
        for (let i=0;i<NUM;i++){
          const v = next[i];
          if (v == null || !isFinite(v)) continue;
          if (v > 0) { next[i] = Math.max(0, v - 1); changed = true; }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  function safeFmt(v) {
    if (v === null || typeof v === 'undefined') return '--';
    if (typeof v === 'number') return Number.isFinite(v) ? v : '--';
    return v;
  }

  function compositionSummary(idx) {
    const b = clientBunkers[idx] || { layers: [] };
    const names = [];
    for (let i=0;i<(b.layers||[]).length && names.length < 3; i++) {
      const L = b.layers[i];
      const n = L && (L.coal || (L.coalDoc && L.coalDoc.coal));
      if (n && !names.includes(n)) names.push(n);
    }
    return names.length ? names.join(', ') : '--';
  }

  function nextBatchSummary(idx) {
    const b = clientBunkers[idx] || { layers: [] };
    if (!b.layers || !b.layers.length) return '--';
    const next = b.layers[b.layers.length - 1];
    const secs = (timers && timers[idx] != null) ? timers[idx] : (next && (next.remainingSeconds != null ? next.remainingSeconds : (next.initialSeconds != null ? next.initialSeconds : null)));
    return secs == null ? '--' : secondsToHHMMSS(secs);
  }

  /* ---------- Ensure tooltip element exists and expose global helpers ---------- */
  useEffect(() => {
    if (typeof document === 'undefined') return;

    let created = false;
    let tooltipEl = document.getElementById('coalTooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'coalTooltip';
      tooltipEl.style.position = 'fixed';
      tooltipEl.style.display = 'none';
      tooltipEl.style.pointerEvents = 'none';
      tooltipEl.style.background = 'rgba(255,255,255,0.98)';
      tooltipEl.style.color = '#000';
      tooltipEl.style.padding = '8px 10px';
      tooltipEl.style.borderRadius = '6px';
      tooltipEl.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
      tooltipEl.style.fontSize = '12px';
      tooltipEl.style.zIndex = 99999;
      tooltipEl.style.maxWidth = '260px';
      tooltipEl.style.lineHeight = '1.25';
      tooltipEl.style.border = '1px solid rgba(0,0,0,0.06)';
      document.body.appendChild(tooltipEl);
      created = true;
    }

    try {
      window.showCoalRectTooltip = function(ev, rowIndex, millIndex, layerData) {
        try {
          const pageX = ev && ev.pageX ? ev.pageX : (ev && ev.clientX ? ev.clientX + window.scrollX : 0);
          const pageY = ev && ev.pageY ? ev.pageY : (ev && ev.clientY ? ev.clientY + window.scrollY : 0);
          if (layerData) {
            const html = tooltipHtmlForLayer(layerData, coalDB, snapshot);
            showTooltipHtml(html, pageX, pageY);
          } else {
            showTooltipHtml(`<div style="font-weight:700">No data</div>`, pageX, pageY);
          }
        } catch(e){}
      };
      window.moveCoalRectTooltip = function(ev) {
        try {
          const pageX = ev && ev.pageX ? ev.pageX : (ev && ev.clientX ? ev.clientX + window.scrollX : 0);
          const pageY = ev && ev.pageY ? ev.pageY : (ev && ev.clientY ? ev.clientY + window.scrollY : 0);
          moveTooltip(pageX, pageY);
        } catch(e){}
      };
      window.hideCoalRectTooltip = function() {
        try { hideTooltip(); } catch(e){}
      };
    } catch (e) {
      // ignore
    }

    return () => {
      try {
        if (created && tooltipEl && tooltipEl.parentNode) tooltipEl.parentNode.removeChild(tooltipEl);
      } catch (e) {}
    };
  }, [coalDB, snapshot]);

  /* ---------- Use existing dashboard renderer when available (preserves exact original shape & colours) ---------- */
  useEffect(() => {
    // expose blend & coalDB globally so StatsPanel / other scripts can compute
    try {
      if (typeof window !== 'undefined') {
        window.LATEST_BLEND = blend || {};
        // don't overwrite global COAL_DB if empty input; prefer provided coalDB if available
        if (Array.isArray(coalDB) && coalDB.length) window.COAL_DB = coalDB;
        // dispatch events used by StatsPanel to recompute
        window.dispatchEvent(new Event('blend:updated'));
        window.dispatchEvent(new Event('flows:update'));
        window.dispatchEvent(new Event('blend:rendered'));
      }
    } catch (e) {}

    try {
      for (let idx = 0; idx < NUM; idx++) {
        const bEl = document.querySelector(`.bunker[data-bunker="${idx}"]`);
        if (!bEl) continue;
        const svg = bEl.querySelector('svg');
        if (!svg) continue;
        const bdata = (clientBunkers && clientBunkers[idx]) ? clientBunkers[idx] : { layers: [] };

        if (typeof window !== 'undefined' && typeof window.renderBunkerIntoSVG === 'function') {
          // call original renderer (will pick up colors using findCoalColor / COAL_DB)
          window.renderBunkerIntoSVG(svg, bdata, window.COAL_DB || coalDB || [], idx, true, 1.2);
        } else {
          // fallback: simple safe minimal content (no geometry override)
          while (svg.firstChild) svg.removeChild(svg.firstChild);
          const ns = 'http://www.w3.org/2000/svg';
          const p = document.createElementNS(ns, 'rect');
          p.setAttribute('x','2'); p.setAttribute('y','2'); p.setAttribute('width','96'); p.setAttribute('height','146');
          p.setAttribute('fill','none'); p.setAttribute('stroke','#eee'); svg.appendChild(p);
        }
      }

      if (typeof window !== 'undefined' && typeof window.updateBunkerDrainVisuals === 'function') {
        try { window.updateBunkerDrainVisuals(); } catch(e){ /* ignore errors */ }
      }
    } catch (err) {
      // don't break app on render errors
      // eslint-disable-next-line no-console
      console.error('BunkersGrid render error', err);
    }
  }, [clientBunkers, coalDB, timers, blend, snapshot]);

  // expose tooltip helpers if legacy inline handlers expect them (harmless if already present)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        if (!window.showCoalRectTooltip) window.showCoalRectTooltip = function(ev, rowIndex, millIndex, layerData){
          const pageX = ev && ev.pageX ? ev.pageX : (ev && ev.clientX ? ev.clientX + window.scrollX : 0);
          const pageY = ev && ev.pageY ? ev.pageY : (ev && ev.clientY ? ev.clientY + window.scrollY : 0);
          const html = layerData ? tooltipHtmlForLayer(layerData, coalDB, snapshot) : `<div style="font-weight:700">No data</div>`;
          showTooltipHtml(html, pageX, pageY);
        };
        if (!window.moveCoalRectTooltip) window.moveCoalRectTooltip = function(ev){ 
          const pageX = ev && ev.pageX ? ev.pageX : (ev && ev.clientX ? ev.clientX + window.scrollX : 0);
          const pageY = ev && ev.pageY ? ev.pageY : (ev && ev.clientY ? ev.clientY + window.scrollY : 0);
          moveTooltip(pageX, pageY); 
        };
        if (!window.hideCoalRectTooltip) window.hideCoalRectTooltip = function(){ hideTooltip(); };
      }
    } catch(e){}
  }, [coalDB, snapshot]);

  // ----------------- Expose minimal nextBlendBinder as before -----------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const binder = {
        activeIdx: Array(NUM).fill(0),
        remaining: Array(NUM).fill(null),
        sequences: Array(NUM).fill([]),
        getActiveLayer: (b) => {
          try {
            const bun = clientBunkers[b];
            if (!bun || !Array.isArray(bun.layers) || bun.layers.length === 0) return null;
            for (let li = 0; li < bun.layers.length; li++) {
              const L = bun.layers[li];
              const pct = (L && (L.percent != null)) ? Number(L.percent) : (L && L.percentages && L.percentages.length ? Number(L.percentages[0]) : 0);
              if (pct > 0) return L;
            }
            return bun.layers[0] || null;
          } catch (e) { return null; }
        }
      };
      window.nextBlendBinder = binder;
      window.dispatchEvent(new CustomEvent('nextBlend:updated', { detail: { source: 'BunkersGrid', time: Date.now() } }));
    } catch (e) { /* ignore */ }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientBunkers, blend, coalDB]);

  /* ---------- NEW: compute derived metrics and per-bunker estimated generation ---------- */
  const derivedAndEstGen = useMemo(() => {
    // compute derived metrics (avgGCV, heatRate, totalFlow)
    const derived = computeDerivedMetricsLocal(blend || window.LATEST_BLEND || {}, coalDB || window.COAL_DB || [], snapshot);
    const heatRate = derived.heatRate; // may be null

    const perBunkerEst24 = Array(NUM).fill('--');
    for (let b = 0; b < NUM; b++) {
      // get bottom gcv
      const bottomGcv = getBottomGcvForBunker(blend || window.LATEST_BLEND || {}, coalDB || window.COAL_DB || [], b, snapshot);
      // get bunker flow
      console.log(bottomGcv)
      let flowVal = null;
      if (Array.isArray(blend.flows) && typeof blend.flows[b] !== 'undefined') flowVal = safeNum(blend.flows[b]);
      else if (Array.isArray(blend.bunkers) && blend.bunkers[b] && typeof blend.bunkers[b].flow !== 'undefined') flowVal = safeNum(blend.bunkers[b].flow);
      else if (Array.isArray(window && window.LATEST_BLEND && window.LATEST_BLEND.flows) && typeof window.LATEST_BLEND.flows[b] !== 'undefined') flowVal = safeNum(window.LATEST_BLEND.flows[b]);

      if (bottomGcv != null && flowVal != null && heatRate != null && heatRate !== 0) {
        // formula provided: (bottom_gcv * bunker_flow) / heatRate
        // user wants Estimated Generation (24h) so multiply by 24
        const gen24 = (Number(bottomGcv) * Number(flowVal) / Number(heatRate));
        perBunkerEst24[b] = Number.isFinite(gen24) ? gen24 : '--';
      } else {
        perBunkerEst24[b] = '--';
      }
    }

    return { derived, perBunkerEst24 };
  }, [blend, coalDB, snapshot, clientBunkers]);

  // helpers for UI
  function nextBatchSummary(idx) {
    const b = clientBunkers[idx] || { layers: [] };
    if (!b.layers || !b.layers.length) return '--';
    const next = b.layers[b.layers.length - 1];
    const secs = (timers && timers[idx] != null) ? timers[idx] : (next && (next.remainingSeconds != null ? next.remainingSeconds : (next.initialSeconds != null ? next.initialSeconds : null)));
    return secs == null ? '--' : secondsToHHMMSS(secs);
  }

  return (
    <>
      <div className="bunkers-grid" id="bunkersGrid">
        {Array.from({ length: NUM }).map((_, idx) => {
          const timerDisplay = nextBatchSummary(idx);

          return (
            <div key={idx} className="bunker" data-bunker={idx} onClick={() => onOpenSingle(idx)} style={{ position:'relative' }}>
              {/* original renderer expects svg viewBox "0 0 100 150" */}
              <svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid meet" />
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          );
        })}
      </div>

      {/* Row: Coal Flow */}
      <div className="coal-flow-wrap">
        <div className="coal-flow-title">Coal Flow</div>
        <div className="coal-flow-grid" id="coalFlowGrid">
          {flows.map((f, idx) => (
            <div key={idx} className="coal-box" id={`coalFlowBox-${idx}`} data-bunker={idx}>
              <div className="value">{safeFmt(f)}</div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Row: Next Coal Batch (shows only timer) */}
      <div className="coal-flow-wrap">
        <div className="coal-flow-title">Next Coal Batch</div>
        <div className="coal-flow-grid" id="nextBlendGrid">
          {Array.from({ length: NUM }).map((_, idx) => (
            <div key={idx} className="coal-box" id={`nextBlendBox-${idx}`} data-bunker={idx}>
              <div className="value">{ nextBatchSummary(idx) }</div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Row: Estimated Generation (24h) */}
      <div className="coal-flow-wrap">
        <div className="coal-flow-title">Estimated Generation (24h)</div>
        <div className="coal-flow-grid" id="estimatedGenGrid">
          {Array.from({ length: NUM }).map((_, idx) => (
            <div key={idx} className="coal-box" id={`estimatedGenBox-${idx}`} data-bunker={idx}>
              <div className="value">
                { derivedAndEstGen.perBunkerEst24[idx] === '--' ? '--' : Number(derivedAndEstGen.perBunkerEst24[idx]).toFixed(2) }
              </div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Row: Blend Composition (intentionally blank for now) */}
      <div className="coal-flow-wrap">
        <div className="coal-flow-title">Blend Composition</div>
        <div className="coal-flow-grid" id="blendCompGrid">
          {Array.from({ length: NUM }).map((_, idx) => (
            <div key={idx} className="coal-box" id={`blendCompBox-${idx}`} data-bunker={idx}>
              <div className="value small">{''}</div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
