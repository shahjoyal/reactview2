// src/components/BunkersGrid.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';

// --- minimal in-app SVG bunker renderer (safe fallback if dashboard.js is removed) ---
// (unchanged renderer code - kept as in your file)
(function installMinimalSvgRenderer() {
  if (typeof window === 'undefined') return;
  if (window.renderBunkerIntoSVG) return; // don't overwrite if real renderer exists

  const DEFAULT_PALETTE = ["#f39c12","#3498db","#2ecc71","#ef4444","#8b5cf6","#14b8a6","#f97316","#06b6d4"];
  const COAL_COLOR_CACHE = {};

  function normKey(k) { return (k === null || k === undefined) ? '' : String(k).trim().toLowerCase(); }
  function pickColorForCoal(coalName, coalDB) {
    const key = normKey(coalName);
    if (!key) return DEFAULT_PALETTE[0];
    if (COAL_COLOR_CACHE[key]) return COAL_COLOR_CACHE[key];
    if (Array.isArray(coalDB)) {
      const found = coalDB.find(c => {
        if (!c) return false;
        const cand = (c.coal || c.name || '').toString().trim().toLowerCase();
        if (cand && cand === key) return true;
        if ((c._id || c.id) && String(c._id || c.id) === String(coalName)) return true;
        return false;
      });
      if (found && (found.color || found.colour)) {
        COAL_COLOR_CACHE[key] = found.color || found.colour;
        return COAL_COLOR_CACHE[key];
      }
    }
    // deterministic hash -> palette index
    let h = 0;
    for (let i = 0; i < key.length; i++) { h = ((h << 5) - h) + key.charCodeAt(i); h |= 0; }
    const col = DEFAULT_PALETTE[Math.abs(h) % DEFAULT_PALETTE.length];
    COAL_COLOR_CACHE[key] = col;
    return col;
  }

  // UPDATED renderer: supports layer.visualPercent which is an absolute percent (0..100).
  // If any layer has visualPercent, we use those values directly and DO NOT normalize to 100.
  // If no visualPercent found, fall back to old behavior (percent/percentages -> normalize to 100).
  window.renderBunkerIntoSVG = function(svgEl, bunkerData, coalDB, bunkerIndex = 0, doFill = true, scale = 1) {
    try {
      if (!svgEl || !(svgEl instanceof SVGElement)) return;
      // clear
      while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

      // basic bbox for a 100x150 viewBox
      const width = 96 * (scale || 1);
      const height = 146 * (scale || 1);
      const x = 2; const y = 2;

      // outline rect
      const ns = 'http://www.w3.org/2000/svg';
      const outline = document.createElementNS(ns, 'rect');
      outline.setAttribute('x', x);
      outline.setAttribute('y', y);
      outline.setAttribute('width', width);
      outline.setAttribute('height', height);
      outline.setAttribute('rx', 6);
      outline.setAttribute('ry', 6);
      outline.setAttribute('fill', 'none');
      outline.setAttribute('stroke', '#ddd');
      svgEl.appendChild(outline);

      const layers = (bunkerData && Array.isArray(bunkerData.layers)) ? bunkerData.layers.slice() : [];
      if (!layers.length) return;

      // --- pick bottom-active color for entire bunker visual (so color follows bottom layer) ---
      function findBottomActiveLayerIndex(layersArr) {
        for (let i = 0; i < layersArr.length; i++) {
          const L = layersArr[i];
          if (!L) continue;
          const rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
          let pctVal = null;
          if (Array.isArray(rawPct) && rawPct.length) pctVal = Number(rawPct[0]);
          else pctVal = Number(rawPct);
          if (isNaN(pctVal) || pctVal === null) return i; // treat unknown as present
          if (pctVal > 0) return i;
        }
        return 0;
      }
      const bottomIdx = findBottomActiveLayerIndex(layers);
      const bottomCoalName = (layers[bottomIdx] && (layers[bottomIdx].coal || (layers[bottomIdx].coalDoc && (layers[bottomIdx].coalDoc.coal || layers[bottomIdx].coalDoc.name)))) || '';
      const bottomFill = doFill ? pickColorForCoal(bottomCoalName, coalDB || window.COAL_DB || []) : 'none';

      // compute heights: use each layer.visualPercent if present else percent/percentages; renderer treats these as absolute percent of capacity.
      const rawPercents = layers.map(L => {
        if (L && (L.visualPercent != null)) {
          const v = Number(L.visualPercent);
          return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
        }
        const p = (L && (L.percent != null)) ? Number(L.percent) : (L && L.percentages && L.percentages.length ? Number(L.percentages[0]) : null);
        return (isFinite(p) ? Math.max(0, p) : null);
      });

      // When percent is null for some layers, treat as equal share of remaining capacity.
      let totalSpecified = 0;
      let specifiedCount = 0;
      for (const p of rawPercents) { if (p != null) { totalSpecified += p; specifiedCount++; } }
      const remainingCount = layers.length - specifiedCount;
      const finalPct = rawPercents.map(p => {
        if (p != null) return p;
        if (specifiedCount > 0) {
          const rem = Math.max(0, 100 - totalSpecified);
          return rem / remainingCount;
        }
        return 100 / layers.length;
      });

      // finalPct are treated as absolute percentages of the bunker capacity.
      // compute visible heights directly from those absolute percentages (no rescale).
      let yCursor = y + height; // start at bottom
      for (let i = 0; i < layers.length; i++) {
        const L = layers[i] || {};
        const pct = (finalPct[i] != null) ? Math.max(0, Math.min(100, Number(finalPct[i]))) : 0;
        // absolute height = pct% of total bunker height
        const rectH = Math.max(1, Math.round((pct / 100) * height));
        yCursor -= rectH;

        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', x + 2);
        r.setAttribute('y', yCursor + 1); // slight inset for aesthetics
        r.setAttribute('width', width - 4);
        r.setAttribute('height', Math.max(1, rectH - 1));
        const coalName = L.coal || (L.coalDoc && (L.coalDoc.coal || L.coalDoc.name)) || '';
        // Use bottomFill for visual color so color follows bottom layer; keep data-coal per-rect for tooltip
        const fill = bottomFill;
        r.setAttribute('fill', fill);
        r.setAttribute('stroke', '#ffffff55');
        r.setAttribute('data-coal', coalName);
        r.style.cursor = 'pointer';

        // simple mouse tooltip hookup (uses global showCoalRectTooltip if present)
        r.addEventListener('mouseenter', (ev) => {
          if (typeof window.showCoalRectTooltip === 'function') {
            window.showCoalRectTooltip(ev, bunkerIndex, i, L);
          } else {
            const tt = coalName || 'Layer';
            r.setAttribute('title', tt);
          }
        });
        r.addEventListener('mousemove', (ev) => { if (typeof window.moveCoalRectTooltip === 'function') window.moveCoalRectTooltip(ev); });
        r.addEventListener('mouseleave', () => { if (typeof window.hideCoalRectTooltip === 'function') window.hideCoalRectTooltip(); });

        svgEl.appendChild(r);
      }
    } catch (e) {
      // swallow; we don't want this to break the whole app
    }
  };

  // graceful no-op for other expected helpers
  if (!window.updateBunkerDrainVisuals) {
    window.updateBunkerDrainVisuals = function() { /* noop fallback */ };
  }
  if (!window.COAL_DB) window.COAL_DB = [];
})();

/* ---------- helpers (unchanged) ---------- */
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
  const SiO2 = Number(ox.SiO2)||0, Al2O3 = Number(ox.Al2O)||0, Fe2O3 = Number(ox.Fe2O3)||0;
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
function findCoalInDbByNameOrId(coalNameOrId, coalDB, snapshot) {
  if (!coalNameOrId) return null;
  const keyLower = String(coalNameOrId).trim().toLowerCase();
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
function tooltipHtmlForLayer(L, coalDB, snapshot) {
  const name = L.coal || (L.coalDoc && (L.coalDoc.coal || L.coalDoc.name)) || '--';
  const pct = (L.visualPercent != null) ? (Number(L.visualPercent).toFixed(3) + '%') : ((L.percent != null) ? (Number(L.percent).toFixed(3) + '%') : '--');
  const gcv = (L.gcv != null) ? L.gcv : (L.coalDoc && (L.coalDoc.gcv != null) ? L.coalDoc.gcv : '--');
  const cost = (L.cost != null) ? L.cost : (L.coalDoc && (L.coalDoc.cost != null) ? L.coalDoc.cost : '--');

  let aftVal = null;
  if (L.coalDoc) aftVal = calcAFT(L.coalDoc);
  if ((aftVal === null || aftVal === undefined) && L.coal) {
    const found = findCoalInDbByNameOrId(L.coal, coalDB, snapshot);
    if (found) {
      aftVal = calcAFT(found) || (found.AFT || found.aft || found.aftValue || null);
    }
  }
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

/* ---------- normalize snapshot helper (index 0 = visual bottom) ---------- */
function normalizeSnapshot(inSnap) {
  if (!inSnap || typeof inSnap !== 'object') return inSnap;
  const snap = Array.isArray(inSnap) ? inSnap.slice() : Object.assign({}, inSnap);
  function normalizeBunkersArr(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.map(b => {
      if (!b || typeof b !== 'object') return b;
      const nb = Object.assign({}, b);
      if (Array.isArray(nb.layers)) nb.layers = nb.layers.slice().reverse();
      return nb;
    });
  }
  try {
    if (Array.isArray(snap.clientBunkers)) snap.clientBunkers = normalizeBunkersArr(snap.clientBunkers);
    if (Array.isArray(snap.bunkers)) snap.bunkers = normalizeBunkersArr(snap.bunkers);
  } catch (e) { /* swallow */ }
  return snap;
}

/* ---------- safeNum ---------- */
function safeNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* ---------- bottom GCV selection (fixed to choose visual bottom active) ---------- */
function getComputeBottomGcv(clientBunkers, coalDB, bunkerIndex, snapshot) {
  try {
    if (!Array.isArray(clientBunkers) || !clientBunkers[bunkerIndex]) return null;
    const bun = clientBunkers[bunkerIndex];
    if (!Array.isArray(bun.layers) || bun.layers.length === 0) return null;

    // iterate from visual bottom (index 0) upwards and pick first active (same logic as getActiveLayerBottom)
    for (let li = bun.layers.length; li >=0 ; li--) {
      const L = bun.layers[li];
      if (!L) continue;
      let rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
      let pctVal = null;
      if (Array.isArray(rawPct) && rawPct.length) pctVal = safeNum(rawPct[0]);
      else pctVal = safeNum(rawPct);
      if (pctVal == null || pctVal > 0) {
        const g = safeNum(L.gcv);
        if (g !== null) return g;
        if (L.coal) {
          const found = findCoalInDbByNameOrId(L.coal, coalDB, snapshot);
          if (found && (found.gcv !== undefined && found.gcv !== null)) return safeNum(found.gcv);
        }
      }
    }

    const fallback = bun.layers[0];
    if (fallback) {
      const g = safeNum(fallback.gcv);
      if (g !== null) return g;
      if (fallback.coal) {
        const f = findCoalInDbByNameOrId(fallback.coal, coalDB, snapshot);
        if (f && (f.gcv !== undefined && f.gcv !== null)) return safeNum(f.gcv);
      }
    }
  } catch (e) {}
  return null;
}

/* ---------- compute next-above layer GCV + layer object ---------- */
function getComputeNextAboveGcv(clientBunkers, coalDB, bunkerIndex, snapshot) {
  try {
    if (!Array.isArray(clientBunkers) || !clientBunkers[bunkerIndex]) return null;
    const bun = clientBunkers[bunkerIndex];
    if (!Array.isArray(bun.layers) || bun.layers.length === 0) return null;

    // find the visual-bottom active layer index using descending scan (same orientation as your bottom loop)
    let activeIdx = null;
    for (let li = bun.layers.length - 1; li >= 0; li--) {
      const L = bun.layers[li];
      if (!L) continue;
      const rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
      let pctVal = null;
      if (Array.isArray(rawPct) && rawPct.length) pctVal = safeNum(rawPct[0]);
      else pctVal = safeNum(rawPct);
      if (pctVal == null || pctVal > 0) { activeIdx = li; break; }
    }
    if (activeIdx === null) return null;

    const nextIdx = activeIdx - 1; // one layer above in your array orientation
    if (nextIdx < 0) return null;
    const nextLayer = bun.layers[nextIdx];
    if (!nextLayer) return null;

    const g = safeNum(nextLayer.gcv);
    if (g !== null) return g;
    if (nextLayer.coal) {
      const found = findCoalInDbByNameOrId(nextLayer.coal, coalDB, snapshot);
      if (found && (found.gcv !== undefined && found.gcv !== null)) return safeNum(found.gcv);
    }
  } catch (e) {}
  return null;
}

function getNextLayerAbove(bunkerIndex, clientBunkersLocal) {
  try {
    const bun = (clientBunkersLocal && clientBunkersLocal[bunkerIndex]) || null;
    if (!bun || !Array.isArray(bun.layers) || bun.layers.length === 0) return null;

    // same descending scan to find the visual-bottom active index
    let activeIdx = null;
    for (let li = bun.layers.length - 1; li >= 0; li--) {
      const L = bun.layers[li];
      if (!L) continue;
      const rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
      let pctVal = null;
      if (Array.isArray(rawPct) && rawPct.length) pctVal = safeNum(rawPct[0]);
      else pctVal = safeNum(rawPct);
      if (pctVal == null || pctVal > 0) { activeIdx = li; break; }
    }
    if (activeIdx === null) return null;

    const nextIdx = activeIdx - 1;
    if (nextIdx < 0) return null;
    return bun.layers[nextIdx] || null;
  } catch (e) { return null; }
}

/* ---------- compute derived metrics from snapshot (uses snapshot only) ---------- */
function computeDerivedMetricsLocalFromSnapshot(snapshotBlend, coalDB, snapshot, clientBunkers) {
  try {
    const blend = snapshotBlend || { bunkers: [], flows: [], generation: null, totalFlow: null };
    const bf = safeNum(blend.totalFlow);
    let totalFlow = (bf !== null) ? bf : null;

    let sumNumerator = 0;
    let sumFlowsForNumerator = 0;

    const bunkerCount = (Array.isArray(blend.bunkers) ? blend.bunkers.length : (Array.isArray(clientBunkers) ? clientBunkers.length : 8));
    for (let b = 0; b < bunkerCount; b++) {
      let flowVal = null;
      if (snapshot && Array.isArray(snapshot.flows) && typeof snapshot.flows[b] !== 'undefined') flowVal = safeNum(snapshot.flows[b]);
      else if (Array.isArray(snapshot.clientBunkers) && snapshot.clientBunkers[b] && typeof snapshot.clientBunkers[b].flow !== 'undefined') flowVal = safeNum(snapshot.clientBunkers[b].flow);
      else if (Array.isArray(snapshot.bunkers) && snapshot.bunkers[b] && typeof snapshot.bunkers[b].flow !== 'undefined') flowVal = safeNum(snapshot.bunkers[b].flow);

      const bottomGcv = getComputeBottomGcv(clientBunkers, coalDB, b, snapshot);

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

/* ---------- Component (updated to be unit-aware) ---------- */
/*
  Props:
    - apiBase: base API url (default 'http://localhost:5000/api')
    - activeUnit: which unit to fetch (1,2,3,...). default 1
    - blend, coalDB, onOpenSingle as before
*/
export default function BunkersGrid({
  apiBase = 'http://localhost:5000/api',
  activeUnit = 1,
  blend = {},
  coalDB = [],
  onOpenSingle = () => {}
}) {
  const NUM = 8;

  // snapshot state (normalized). This component will poll the API and keep window.SNAPSHOT_NORMALIZED updated.
  const [snapshot, setSnapshot] = useState(() => {
    const s = (typeof window !== 'undefined' && window.SNAPSHOT_NORMALIZED) ? window.SNAPSHOT_NORMALIZED : null;
    return s;
  });

  // helper to build effective URL for the current unit
  const effectiveApiUrl = useMemo(() => {
    const base = (apiBase || '').replace(/\/+$/, '');
    return `${base}/unit/${activeUnit}`;
  }, [apiBase, activeUnit]);

  // poll the API and update snapshot (and window.SNAPSHOT_NORMALIZED)
  useEffect(() => {
    let mounted = true;
    let id = null;

    function normalize(inSnap) { return normalizeSnapshot(inSnap); }

    async function fetchOnce() {
      try {
        const res = await fetch(effectiveApiUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const rawSnapshot = (json && json.doc && json.doc.snapshot) ? json.doc.snapshot
                          : (json && json.snapshot) ? json.snapshot
                          : (json && json.blend && json.blend.snapshot) ? json.blend.snapshot
                          : (json && json.blend) ? json.blend
                          : null;
        if (!rawSnapshot) return;
        const normalized = normalize(rawSnapshot);
        try {
          const curStr = window.SNAPSHOT_NORMALIZED ? JSON.stringify(window.SNAPSHOT_NORMALIZED) : null;
          const newStr = JSON.stringify(normalized);
          if (curStr !== newStr) {
            window.SNAPSHOT_NORMALIZED = normalized;
            window.SNAPSHOT = normalized;
            try { window.SNAPSHOT_UNIT = Number(activeUnit); } catch(e){}
            window.dispatchEvent(new Event('blend:updated'));
            window.dispatchEvent(new Event('flows:update'));
            window.dispatchEvent(new Event('blend:rendered'));
          }
        } catch (e) {
          window.SNAPSHOT_NORMALIZED = normalized;
          window.SNAPSHOT = normalized;
          try { window.SNAPSHOT_UNIT = Number(activeUnit); } catch(e){}
          window.dispatchEvent(new Event('blend:updated'));
          window.dispatchEvent(new Event('flows:update'));
          window.dispatchEvent(new Event('blend:rendered'));
        }
        if (mounted) setSnapshot(normalized);
      } catch (err) {
        // console.warn('snapshot fetch error', err);
      }
    }

    // initial fetch and interval
    fetchOnce();
    id = setInterval(fetchOnce, 2000);

    return () => { mounted = false; if (id) clearInterval(id); };
  }, [effectiveApiUrl, activeUnit]);

  // clientBunkers mirror snapshot (normalized) or fallback empty structure
  const clientBunkers = useMemo(() => {
    if (snapshot && Array.isArray(snapshot.clientBunkers) && snapshot.clientBunkers.length === NUM) return snapshot.clientBunkers;
    if (snapshot && Array.isArray(snapshot.bunkers) && snapshot.bunkers.length === NUM) return snapshot.bunkers;
    return Array.from({ length: NUM }).map(()=>({ layers: [] }));
  }, [snapshot]);

  // getters for flows (snapshot-driven)
  function getFlowFromSnapshot(snapshotLocal, idx) {
    if (!snapshotLocal) return null;
    if (Array.isArray(snapshotLocal.flows) && typeof snapshotLocal.flows[idx] !== 'undefined') {
      const v = safeNum(snapshotLocal.flows[idx]);
      if (v !== null) return v;
      return snapshotLocal.flows[idx];
    }
    if (Array.isArray(snapshotLocal.clientBunkers) && snapshotLocal.clientBunkers[idx] && typeof snapshotLocal.clientBunkers[idx].flow !== 'undefined') {
      const v = safeNum(snapshotLocal.clientBunkers[idx].flow);
      if (v !== null) return v;
      return snapshotLocal.clientBunkers[idx].flow;
    }
    if (Array.isArray(snapshotLocal.bunkers) && snapshotLocal.bunkers[idx] && typeof snapshotLocal.bunkers[idx].flow !== 'undefined') {
      const v = safeNum(snapshotLocal.bunkers[idx].flow);
      if (v !== null) return v;
      return snapshotLocal.bunkers[idx].flow;
    }
    return null;
  }

  const flows = useMemo(() => {
    const out = Array(NUM).fill('--');
    for (let i = 0; i < NUM; i++) {
      const v = getFlowFromSnapshot(snapshot, i);
      out[i] = (v === null || v === undefined) ? '--' : v;
    }
    return out;
  }, [snapshot, clientBunkers]);

  /* ---------- TIMERS: whole-bunker timer and visual drain driven by bunker timer ---------- */
  const initialTimers = useMemo(() => {
    const arr = Array(NUM).fill(null);
    if (snapshot && Array.isArray(snapshot.bunkerTimers)) {
      for (let i=0;i<NUM;i++) {
        const bt = snapshot.bunkerTimers[i];
        if (bt && bt.remainingSeconds != null) arr[i] = Number(bt.remainingSeconds);
        else if (bt && bt.initialSeconds != null) arr[i] = Number(bt.initialSeconds);
        else arr[i] = null;
      }
      return arr;
    }

    for (let i=0;i<NUM;i++) {
      const bun = (snapshot && Array.isArray(snapshot.clientBunkers) && snapshot.clientBunkers[i]) || (snapshot && Array.isArray(snapshot.bunkers) && snapshot.bunkers[i]) || null;
      if (!bun || !Array.isArray(bun.layers) || bun.layers.length === 0) { arr[i] = null; continue; }
      // try sum of layer.remainingSeconds (if present), else sum of layer.initialSeconds, else null
      let sumRem = 0; let sumInit = 0; let anyRem = false; let anyInit = false;
      for (let li = 0; li < bun.layers.length; li++) {
        const L = bun.layers[li];
        if (!L) continue;
        const r = safeNum(L.remainingSeconds);
        const inits = safeNum(L.initialSeconds);
        if (r != null) { sumRem += Number(r); anyRem = true; }
        if (inits != null) { sumInit += Number(inits); anyInit = true; }
      }
      if (anyRem) arr[i] = sumRem;
      else if (anyInit) arr[i] = sumInit;
      else arr[i] = null;
    }
    return arr;
  }, [snapshot]);

  const [timers, setTimers] = useState(initialTimers);
  useEffect(() => { setTimers(initialTimers); }, [initialTimers]);

  // tick whole-bunker timers every second (visual drain driver)
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

  // Keep an array of bunkerInitialSeconds (to compute ratio). Derived once from snapshot and updated when snapshot changes.
  const [bunkerInitialSeconds, setBunkerInitialSeconds] = useState(() => Array(NUM).fill(null));
  useEffect(() => {
    if (!snapshot) return;
    const initials = Array(NUM).fill(null);
    if (Array.isArray(snapshot.bunkerTimers)) {
      for (let i=0;i<NUM;i++) {
        const bt = snapshot.bunkerTimers[i];
        if (bt && bt.initialSeconds != null) initials[i] = Number(bt.initialSeconds);
        else if (bt && bt.remainingSeconds != null) initials[i] = Number(bt.remainingSeconds);
        else initials[i] = null;
      }
    } else {
      for (let i=0;i<NUM;i++) {
        const bun = (snapshot.clientBunkers && snapshot.clientBunkers[i]) || (snapshot.bunkers && snapshot.bunkers[i]) || null;
        if (!bun || !Array.isArray(bun.layers) || bun.layers.length === 0) { initials[i] = null; continue; }
        let sumInit = 0; let anyInit = false;
        for (let li=0; li < bun.layers.length; li++) {
          const L = bun.layers[li];
          const inits = safeNum(L && L.initialSeconds);
          if (inits != null) { sumInit += Number(inits); anyInit = true; }
        }
        initials[i] = anyInit ? sumInit : null;
      }
    }
    setBunkerInitialSeconds(prev => {
      try {
        const a = JSON.stringify(prev || []);
        const b = JSON.stringify(initials || []);
        return a === b ? prev : initials;
      } catch (e) { return initials; }
    });
  }, [snapshot]);

  // activeLayerTimers kept for backward compatibility but not used to drive drain (unchanged)
  const [activeLayerTimers, setActiveLayerTimers] = useState(() => Array(NUM).fill(null));
  useEffect(() => {
    try {
      const next = Array(NUM).fill(null);
      for (let i = 0; i < NUM; i++) {
        const bun = clientBunkers[i];
        if (!bun || !Array.isArray(bun.layers) || bun.layers.length === 0) continue;

        // previous logic: pick visual bottom-most active layer
        let activeIdx = null;
        for (let j = 0; j < bun.layers.length; j++) {
          const L = bun.layers[j];
          if (!L) continue;
          const rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
          let pctVal = null;
          if (Array.isArray(rawPct) && rawPct.length) pctVal = safeNum(rawPct[0]);
          else pctVal = safeNum(rawPct);
          if (pctVal == null || pctVal > 0) { activeIdx = j; break; }
        }
        if (activeIdx === null) activeIdx = 0;

        const active = bun.layers[activeIdx];
        if (active && active.remainingSeconds != null) next[i] = Number(active.remainingSeconds);
        else if (active && active.initialSeconds != null) next[i] = Number(active.initialSeconds);
        else next[i] = null;
      }
      setActiveLayerTimers(prev => {
        try {
          const prevStr = JSON.stringify(prev || []);
          const nextStr = JSON.stringify(next || []);
          return prevStr === nextStr ? prev : next;
        } catch (e) {
          return next;
        }
      });
    } catch (e) { /* swallow */ }
  }, [snapshot, clientBunkers]);

  // ----- per-bunker layer queues + robust ticking (uses refs to avoid snapshot stomping) -----
  const [layerQueues, setLayerQueues] = useState(() => Array(NUM).fill([])); // kept in state for debug/inspection if needed
  const layerQueuesRef = useRef(Array(NUM).fill([]));
  const [activeLayerIndex, setActiveLayerIndex] = useState(() => Array(NUM).fill(0));
  const activeLayerIndexRef = useRef(Array(NUM).fill(0));
  const [displayTimers, setDisplayTimers] = useState(() => Array(NUM).fill(null)); // currently displayed layer remaining seconds

  // ---------- snapshot -> queue merge effect (final: no upward sync for same layer) ----------
  useEffect(() => {
    if (!snapshot) return;

    const SYNC_THRESHOLD = 2; // seconds. adjust up if you want more tolerance

    // build server-side queues (same as before)
    const serverQueues = Array.from({ length: NUM }).map(() => []);
    for (let m = 0; m < NUM; m++) {
      const bun = (snapshot.clientBunkers && snapshot.clientBunkers[m]) || (snapshot.bunkers && snapshot.bunkers[m]) || { layers: [] };
      const bt = (Array.isArray(snapshot.bunkerTimers) && snapshot.bunkerTimers[m]) ? snapshot.bunkerTimers[m] : null;
      const srcLayers = (bt && Array.isArray(bt.layers) && bt.layers.length) ? bt.layers : bun.layers || [];

      serverQueues[m] = (srcLayers || []).map(L => {
        const initial = safeNum(L && (L.initialSeconds != null ? L.initialSeconds : L.initial_seconds)) || 0;
        const remaining = (safeNum(L && L.remainingSeconds) != null) ? safeNum(L.remainingSeconds) : initial;
        return { initial: Number(initial || 0), remaining: (remaining == null ? 0 : Number(remaining)) };
      });
    }

    // update ref + state of queues (for renderer / debugging)
    layerQueuesRef.current = serverQueues;
    setLayerQueues(prev => {
      try {
        const a = JSON.stringify(prev || []);
        const b = JSON.stringify(serverQueues || []);
        return a === b ? prev : serverQueues;
      } catch (e) { return serverQueues; }
    });

    // Merge/sync display timers — IMPORTANT: do NOT sync upward for the same active layer.
    setDisplayTimers(prevDisplay => {
      const nextDisplay = prevDisplay.slice();
      const nextActiveIdx = activeLayerIndexRef.current.slice();
      let anyChange = false;

      for (let i = 0; i < NUM; i++) {
        const q = serverQueues[i] || [];

        // serverActive: first layer with remaining > 0 (like client expects)
        let serverActive = -1;
        for (let k = 0; k < q.length; k++) {
          if (q[k] && isFinite(q[k].remaining) && q[k].remaining > 0) { serverActive = k; break; }
        }
        const serverRemaining = (serverActive >= 0 && q[serverActive]) ? q[serverActive].remaining : null;

        const clientRemaining = prevDisplay[i];
        const clientActive = (activeLayerIndexRef.current && typeof activeLayerIndexRef.current[i] !== 'undefined') ? activeLayerIndexRef.current[i] : null;

        if (clientRemaining == null) {
          // client has no running timer: initialize from server if available
          if (serverRemaining != null) {
            nextDisplay[i] = serverRemaining;
            nextActiveIdx[i] = serverActive >= 0 ? serverActive : 0;
            anyChange = true;
          }
          // else keep null
        } else {
          // client is running a timer. Be conservative — avoid restarting/increasing it.
          if (serverActive === -1) {
            // server reports no active layer: do not stomp an in-progress client timer (preserve client)
          } else if (serverActive !== clientActive) {
            // server changed active layer (advance/replaced). Trust server authority here.
            nextDisplay[i] = serverRemaining;
            nextActiveIdx[i] = serverActive;
            anyChange = true;
          } else {
            // same active layer on both sides — only sync **downwards** (server shows less time)
            // and only if difference exceeds threshold or server is strictly less.
            if (serverRemaining != null) {
              if (serverRemaining < clientRemaining - SYNC_THRESHOLD) {
                nextDisplay[i] = serverRemaining;
                anyChange = true;
              }
              // IMPORTANT: DO NOT set nextDisplay to a *larger* serverRemaining (no upward sync)
            }
          }
        }
      } // end for each bunker

      if (anyChange) {
        // persist updated active indices
        activeLayerIndexRef.current = nextActiveIdx;
        setActiveLayerIndex(prev => {
          try {
            const a = JSON.stringify(prev || []);
            const b = JSON.stringify(nextActiveIdx || []);
            return a === b ? prev : nextActiveIdx;
          } catch (e) { return nextActiveIdx; }
        });
        return nextDisplay;
      }
      return prevDisplay;
    });

  }, [snapshot]);

  // Single stable interval to tick display timers and advance layers
  useEffect(() => {
    const id = setInterval(() => {
      setDisplayTimers(prev => {
        const next = prev.slice();
        let changed = false;

        for (let i = 0; i < NUM; i++) {
          const cur = next[i];

          if (cur == null) {
            // nothing currently displayed: try to pick first non-empty in queue (only if previously null)
            const q = layerQueuesRef.current[i] || [];
            let foundIdx = -1;
            for (let k = 0; k < q.length; k++) {
              if (q[k] && isFinite(q[k].remaining) && q[k].remaining > 0) { foundIdx = k; break; }
            }
            if (foundIdx >= 0) {
              next[i] = layerQueuesRef.current[i][foundIdx].remaining;
              activeLayerIndexRef.current[i] = foundIdx;
              setActiveLayerIndex(prevIdx => {
                const cp = prevIdx.slice();
                cp[i] = foundIdx;
                return cp;
              });
              changed = true;
            }
            continue;
          }

          if (!isFinite(cur) || cur <= 0) {
            // current layer finished -> advance to next available
            const q = layerQueuesRef.current[i] || [];
            const ai = (activeLayerIndexRef.current[i] != null) ? activeLayerIndexRef.current[i] : 0;
            let found = -1;
            for (let k = ai + 1; k < q.length; k++) {
              if (q[k] && isFinite(q[k].remaining) && q[k].remaining > 0) { found = k; break; }
            }
            if (found >= 0) {
              next[i] = q[found].remaining;
              activeLayerIndexRef.current[i] = found;
              setActiveLayerIndex(prevIdx => {
                const cp = prevIdx.slice();
                cp[i] = found;
                return cp;
              });
              changed = true;
            } else {
              // no more layers -> mark null
              if (next[i] !== null) { next[i] = null; changed = true; }
            }
          } else {
            // decrement by 1 second
            next[i] = Math.max(0, Math.round(cur - 1));
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(id);
  }, []); // created once

  /* Helper for UI: show displayTimers[idx] if present else fallback to bunker timers (sum) or '--' */
  function displayedLayerTimerFor(idx) {
    const dt = displayTimers && displayTimers[idx] != null ? displayTimers[idx] : null;
    if (dt != null) return secondsToHHMMSS(dt);
    const secs = (timers && timers[idx] != null) ? timers[idx] : '--';
    return secs === '--' ? '--' : secondsToHHMMSS(secs);
  }

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

  // Next batch summary now shows the whole-bunker timer (timers[idx]) by default — we will use displayedLayerTimerFor when rendering the UI.
  function nextBatchSummaryLocal(idx) {
    const secs = (timers && timers[idx] != null) ? timers[idx] : '--';
    return secs === '--' ? '--' : secondsToHHMMSS(secs);
  }

  /* ---------- NEW: pick colour for timer/est boxes from bottom/active layer (unchanged) ---------- */
  const LOCAL_PALETTE = ["#f39c12","#3498db","#2ecc71","#ef4444","#8b5cf6","#14b8a6","#f97316","#06b6d4"];
  function pickColorForCoalLocal(name, coalDBLocal, snapshotLocal, layerObj) {
    // priority: explicit colour on layer -> coalDoc -> coalDB -> deterministic fallback
    if (layerObj) {
      if (layerObj.color) return layerObj.color;
      if (layerObj.colour) return layerObj.colour;
      if (layerObj.coalDoc && (layerObj.coalDoc.color || layerObj.coalDoc.colour)) return layerObj.coalDoc.color || layerObj.coalDoc.colour;
    }
    if (!name) return null;
    const key = String(name).trim().toLowerCase();
    const found = findCoalInDbByNameOrId(key, coalDBLocal, snapshotLocal);
    if (found) {
      if (found.color) return found.color;
      if (found.colour) return found.colour;
      if (found.colorHex) return found.colorHex;
      if (found.hex) return found.hex;
    }
    // deterministic fallback
    let h = 0;
    for (let i = 0; i < key.length; i++) { h = ((h << 5) - h) + key.charCodeAt(i); h |= 0; }
    return LOCAL_PALETTE[Math.abs(h) % LOCAL_PALETTE.length];
  }

  // helper: map numeric GCV to an hsl color (green ~ high gcv, red ~ low gcv)
  function colorFromGcv(gcv) {
    if (gcv == null || isNaN(gcv)) return '#999'; // neutral if unknown
    // sensible gcv range roughly 2300..7000; clamp and normalize
    const min = 2300, max = 7000;
    const v = Math.max(min, Math.min(max, Number(gcv)));
    const t = (v - min) / (max - min); // 0..1
    // map t=0 -> red (0deg), t=1 -> green (120deg)
    const hue = Math.round((t * 120));
    return `hsl(${hue} 70% 45%)`;
  }

  // find bottom-most active layer (index 0 is visual bottom after normalization)
  function getActiveLayerBottom(idx) {
    const bun = clientBunkers[idx];
    if (!bun || !Array.isArray(bun.layers) || bun.layers.length === 0) return null;
    for (let i = bun.layers.length; i >0 ; i--) {
      const L = bun.layers[i];
      if (!L) continue;
      const rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
      let pctVal = null;
      if (Array.isArray(rawPct) && rawPct.length) pctVal = safeNum(rawPct[0]);
      else pctVal = safeNum(rawPct);
      // consider pctVal === null as present (your code uses this elsewhere)
      if (pctVal == null || pctVal > 0) return L;
    }
    return bun.layers[0] || null;
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
    } catch (e) {}

    return () => {
      try {
        if (created && tooltipEl && tooltipEl.parentNode) tooltipEl.parentNode.removeChild(tooltipEl);
      } catch (e) {}
    };
  }, [coalDB, snapshot]);

  /* ---------- Use existing dashboard renderer when available (bunker-level drain) ---------- */
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        if (Array.isArray(coalDB) && coalDB.length) window.COAL_DB = coalDB;
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

        // create a shallow-deep clone to avoid mutating real snapshot data
        let bdataForSvg;
        try { bdataForSvg = JSON.parse(JSON.stringify(bdata)); } catch (e) { bdataForSvg = Object.assign({}, bdata); }

        // compute original normalized percents for all layers (so visualPercent base distribution exists)
        function computeOrigNormalizedPercents(layersArr) {
          const declared = layersArr.map(L => {
            if (!L) return null;
            const raw = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : null) : L.percent;
            if (Array.isArray(raw) && raw.length) return safeNum(raw[0]);
            return safeNum(raw);
          });
          let totalSpecified = 0;
          let specifiedCount = 0;
          for (const p of declared) { if (p != null) { totalSpecified += p; specifiedCount++; } }
          const remainingCount = declared.length - specifiedCount;
          const finalPct = declared.map(p => {
            if (p != null) return p;
            if (specifiedCount > 0) {
              const rem = Math.max(0, 100 - totalSpecified);
              return rem / remainingCount;
            }
            return 100 / declared.length;
          });
          const sumFinal = finalPct.reduce((s,v)=> s + (isFinite(v)?v:0), 0) || 1;
          return finalPct.map(v => (isFinite(v) ? (v * 100 / sumFinal) : 0));
        }

        const origPercents = Array.isArray(bdataForSvg.layers) && bdataForSvg.layers.length ? computeOrigNormalizedPercents(bdataForSvg.layers) : [];

        // --- BUNKER-LEVEL DRAIN MODEL ---
        // Use bunker initial and remaining timers to scale visualPercent for all layers uniformly.
        const bunkerRem = (timers && timers[idx] != null) ? Number(timers[idx]) : null;
        const bunkerInit = (bunkerInitialSeconds && bunkerInitialSeconds[idx] != null) ? Number(bunkerInitialSeconds[idx]) : null;

        let scaleFactor = 1;
        if (bunkerInit != null && bunkerInit > 0 && bunkerRem != null) {
          scaleFactor = Math.max(0, Math.min(1, bunkerRem / bunkerInit)); // 1 -> full, 0 -> empty
        } else {
          // if we can't compute, keep scaleFactor = 1 (no visual shrink)
          scaleFactor = 1;
        }

        // apply visualPercent = origPercent * scaleFactor  (absolute percent of bunker)
        for (let k = 0; k < bdataForSvg.layers.length; k++) {
          const layerObj = bdataForSvg.layers[k] || {};
          const orig = (origPercents[k] != null ? Number(origPercents[k]) : 0);
          const vp = orig * scaleFactor;
          layerObj.visualPercent = (isFinite(vp) ? Number(vp) : 0);
          bdataForSvg.layers[k] = layerObj;
        }

        if (typeof window !== 'undefined' && typeof window.renderBunkerIntoSVG === 'function') {
          window.renderBunkerIntoSVG(svg, bdataForSvg, window.COAL_DB || coalDB || [], idx, true, 1.2);
        } else {
          while (svg.firstChild) svg.removeChild(svg.firstChild);
          const ns = 'http://www.w3.org/2000/svg';
          const p = document.createElementNS(ns, 'rect');
          p.setAttribute('x','2'); p.setAttribute('y','2'); p.setAttribute('width','96'); p.setAttribute('height','146');
          p.setAttribute('fill','none'); p.setAttribute('stroke','#eee'); svg.appendChild(p);
        }
      }

      if (typeof window !== 'undefined' && typeof window.updateBunkerDrainVisuals === 'function') {
        try { window.updateBunkerDrainVisuals(); } catch(e){ }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('BunkersGrid render error', err);
    }
  }, [clientBunkers, coalDB, timers, bunkerInitialSeconds, snapshot]);

  // nextBlendBinder (expose minimal)
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
    } catch (e) {}
  }, [clientBunkers, coalDB]);

/* ---------- derived metrics + per-bunker est gen (bottom GCV selection unchanged) ---------- */
const derivedAndEstGen = useMemo(() => {
  const blendForCompute = snapshot || { bunkers: [], flows: [], generation: null, totalFlow: null };
  const derived = computeDerivedMetricsLocalFromSnapshot(blendForCompute, coalDB || [], snapshot, clientBunkers);
  const heatRate = derived.heatRate;

  const perBunkerEst24 = Array(NUM).fill('--');
  const perBunkerNextEst24 = Array(NUM).fill('--');
  const perBunkerNextLayerObj = Array(NUM).fill(null); // store next layer object for hover + color

  for (let b = 0; b < NUM; b++) {
    const bottomGcv = getComputeBottomGcv(clientBunkers, coalDB || [], b, snapshot);
    const nextGcv = getComputeNextAboveGcv(clientBunkers, coalDB || [], b, snapshot);
    const flowVal = getFlowFromSnapshot(snapshot, b);

    if (bottomGcv != null && flowVal != null && heatRate != null && heatRate !== 0) {
      const gen24 = (Number(bottomGcv) * Number(flowVal) / Number(heatRate));
      perBunkerEst24[b] = Number.isFinite(gen24) ? gen24 : '--';
    } else {
      perBunkerEst24[b] = '--';
    }

    if (nextGcv != null && flowVal != null && heatRate != null && heatRate !== 0) {
      const gen24Next = (Number(nextGcv) * Number(flowVal) / Number(heatRate));
      perBunkerNextEst24[b] = Number.isFinite(gen24Next) ? gen24Next : '--';
    } else {
      perBunkerNextEst24[b] = '--';
    }

    // capture next-layer object for hover and color (use getNextLayerAbove to retrieve the layer object)
    try {
      const nl = getNextLayerAbove(b, clientBunkers);
      perBunkerNextLayerObj[b] = nl || null;
    } catch (e) {
      perBunkerNextLayerObj[b] = null;
    }
  }

  return { derived, perBunkerEst24, perBunkerNextEst24, perBunkerNextLayerObj };
}, [snapshot, coalDB, clientBunkers, timers]);


  return (
    <>
      {/* Inline CSS for blink and small styles (kept inside component so you can copy/paste easily) */}
      <style>{`
        .blink-red {
          animation: blink-red 1s step-end infinite;
          color: #fff !important;
        }
        @keyframes blink-red {
          0% { background: #ff3b3b; }
          50% { background: #ffffff; color: #ff3b3b; }
          100% { background: #ff3b3b; }
        }
        .value.small { padding: 6px 8px; border-radius: 6px; min-width: 80px; text-align:center; display:inline-block; }
        .value.hoverable { cursor: pointer; }
      `}</style>

      <div className="bunkers-grid" id="bunkersGrid">
        {Array.from({ length: NUM }).map((_, idx) => {
          const timerDisplay = nextBatchSummaryLocal(idx);
          return (
            <div key={idx} className="bunker" data-bunker={idx} onClick={() => onOpenSingle(idx)} style={{ position:'relative' }}>
              <svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid meet" />
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          );
        })}
      </div>

      {/* Coal Flow */}
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

      {/* Estimated Generation (current bottom coal) */}
      <div className="coal-flow-wrap">
        <div className="coal-flow-title"> Estimated Generation as per current coal</div>
        <div className="coal-flow-grid" id="estimatedGenGrid">
          {Array.from({ length: NUM }).map((_, idx) => {
            const activeLayer = getActiveLayerBottom(idx);
            const coalName = activeLayer && (activeLayer.coal || (activeLayer.coalDoc && (activeLayer.coalDoc.coal || activeLayer.coalDoc.name)));
            const bg = pickColorForCoalLocal(coalName, coalDB, snapshot, activeLayer);

            return (
              <div key={idx} className="coal-box" id={`estimatedGenBox-${idx}`} data-bunker={idx}>
                <div
                  className="value"
                  style={ coalName ? { background: bg, color: '#fff', padding: '6px 8px', borderRadius: 6, minWidth: 80, textAlign: 'center' } : { minWidth: 80, textAlign: 'center' } }
                  onMouseEnter={(e) => {
                    try {
                      if (activeLayer) {
                        const html = tooltipHtmlForLayer(activeLayer, coalDB, snapshot);
                        const pageX = e && e.pageX ? e.pageX : (e && e.clientX ? e.clientX + window.scrollX : 0);
                        const pageY = e && e.pageY ? e.pageY : (e && e.clientY ? e.clientY + window.scrollY : 0);
                        showTooltipHtml(html, pageX, pageY);
                      }
                    } catch (err) {}
                  }}
                  onMouseMove={(e) => {
                    try {
                      const pageX = e && e.pageX ? e.pageX : (e && e.clientX ? e.clientX + window.scrollX : 0);
                      const pageY = e && e.pageY ? e.pageY : (e && e.clientY ? e.clientY + window.scrollY : 0);
                      moveTooltip(pageX, pageY);
                    } catch (err) {}
                  }}
                  onMouseLeave={() => { try { hideTooltip(); } catch(err) {} }}
                >
                  { derivedAndEstGen.perBunkerEst24[idx] === '--' ? '--' : Number(derivedAndEstGen.perBunkerEst24[idx]).toFixed(2) }
                </div>
                <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Next Coal Batch */}
      <div className="coal-flow-wrap">
        <div className="coal-flow-title">Next Coal Batch</div>
        <div className="coal-flow-grid" id="nextBlendGrid">
          {Array.from({ length: NUM }).map((_, idx) => {
            // now use per-layer displayed timers if present, fallback to bunker timer
            const displayRaw = (displayTimers && displayTimers[idx] != null) ? displayTimers[idx] : ((timers && timers[idx] != null) ? timers[idx] : null);
            const shouldBlink = (displayRaw != null && displayRaw > 0 && displayRaw < 3600); // blink if less than 1 hour in displayed timer

            // find active layer for hover tooltip but do NOT use its color for box background
            const activeLayer = getActiveLayerBottom(idx);

            return (
              <div key={idx} className="coal-box" id={`nextBlendBox-${idx}`} data-bunker={idx}>
                <div
                  className={`value ${shouldBlink ? 'blink-red' : ''}`}
                  style={ shouldBlink ? { padding: '6px 8px', borderRadius: 6, minWidth: 80, textAlign: 'center', color: '#fff' } : { padding: '6px 8px', borderRadius: 6, minWidth: 80, textAlign: 'center' } }
                  onMouseEnter={(e) => {
                    try {
                      if (activeLayer) {
                        const html = tooltipHtmlForLayer(activeLayer, coalDB, snapshot);
                        const pageX = e && e.pageX ? e.pageX : (e && e.clientX ? e.clientX + window.scrollX : 0);
                        const pageY = e && e.pageY ? e.pageY : (e && e.clientY ? e.clientY + window.scrollY : 0);
                        showTooltipHtml(html, pageX, pageY);
                      }
                    } catch (err) {}
                  }}
                  onMouseMove={(e) => {
                    try {
                      const pageX = e && e.pageX ? e.pageX : (e && e.clientX ? e.clientX + window.scrollX : 0);
                      const pageY = e && e.pageY ? e.pageY : (e && e.clientY ? e.clientY + window.scrollY : 0);
                      moveTooltip(pageX, pageY);
                    } catch (err) {}
                  }}
                  onMouseLeave={() => { try { hideTooltip(); } catch(err) {} }}
                >
                  { displayedLayerTimerFor(idx) }
                </div>
                <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
              </div>
            );
          })}
        </div>
      </div>

{/* Blend Composition (Next Coal Batch Estimated Generation 24h) */}
<div className="coal-flow-wrap">
  <div className="coal-flow-title">Next Coal Batch Estimated Generation </div>
  <div className="coal-flow-grid" id="blendCompGrid">
    {Array.from({ length: NUM }).map((_, idx) => {
      const nextLayer = derivedAndEstGen && Array.isArray(derivedAndEstGen.perBunkerNextLayerObj)
        ? derivedAndEstGen.perBunkerNextLayerObj[idx]
        : getNextLayerAbove(idx, clientBunkers);

      // compute gcv for next layer to drive color. prefer explicit gcv on layer, else fallback to database lookup
      let nextGcv = null;
      try {
        if (nextLayer && (nextLayer.gcv != null)) nextGcv = safeNum(nextLayer.gcv);
        if (nextGcv == null) {
          // try compute via helper
          nextGcv = getComputeNextAboveGcv(clientBunkers, coalDB, idx, snapshot);
        }
      } catch (e) { nextGcv = null; }

      // === CHANGE: prefer the coal/layer explicit color (same as tooltip/hover),
      // fallback to colorFromGcv only if no explicit color found ===
      const coalName = nextLayer && (nextLayer.coal || (nextLayer.coalDoc && (nextLayer.coalDoc.coal || nextLayer.coalDoc.name)));
      const bg = pickColorForCoalLocal(coalName, coalDB, snapshot, nextLayer) || colorFromGcv(nextGcv);

      const val = derivedAndEstGen && Array.isArray(derivedAndEstGen.perBunkerNextEst24)
        ? derivedAndEstGen.perBunkerNextEst24[idx]
        : '--';

      return (
        <div key={idx} className="coal-box" id={`blendCompBox-${idx}`} data-bunker={idx}>
          <div
            className={`value small ${coalName ? 'hoverable' : ''}`}
            style={ coalName ? { background: bg, color: '#fff' } : { background: '#fafafa', color: '#222', border: '1px solid #eee' } }
            onMouseEnter={(e) => {
              try {
                if (nextLayer) {
                  const html = tooltipHtmlForLayer(nextLayer, coalDB, snapshot);
                  const pageX = e.pageX || (e.clientX + window.scrollX);
                  const pageY = e.pageY || (e.clientY + window.scrollY);
                  showTooltipHtml(html, pageX, pageY);
                }
              } catch (err) {}
            }}
            onMouseMove={(e) => {
              try {
                const pageX = e.pageX || (e.clientX + window.scrollX);
                const pageY = e.pageY || (e.clientY + window.scrollY);
                moveTooltip(pageX, pageY);
              } catch (err) {}
            }}
            onMouseLeave={() => { try { hideTooltip(); } catch (err) {} }}
          >
            { val === '--' ? '--' : Number(val).toFixed(2) }
          </div>
          <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
        </div>
      );
    })}
  </div>
</div>

    </>
  );
}
