// src/components/BunkersGrid.jsx
import React, { useEffect, useMemo, useState } from 'react';

// --- minimal in-app SVG bunker renderer (safe fallback if dashboard.js is removed) ---
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
      // assume layers are already in visual order where index 0 = visual bottom (like your normalizeSnapshot)
      if (!layers.length) return;

      // compute heights: if percent is available use it (sum of visible percents may not be 100), else split evenly
      const percents = layers.map(L => {
        const p = (L && (L.percent != null)) ? Number(L.percent) : (L && L.percentages && L.percentages.length ? Number(L.percentages[0]) : null);
        return (isFinite(p) ? Math.max(0, p) : null);
      });

      let totalSpecified = 0;
      let specifiedCount = 0;
      for (const p of percents) { if (p != null) { totalSpecified += p; specifiedCount++; } }
      const remainingCount = layers.length - specifiedCount;

      // compute final percent for each layer (fall back to equal split)
      const finalPct = percents.map(p => {
        if (p != null) return p;
        // if some specified exist, distribute remaining equally; else equal split
        if (specifiedCount > 0) {
          const rem = Math.max(0, 100 - totalSpecified);
          return rem / remainingCount;
        }
        return 100 / layers.length;
      });

      // normalize to total 100 (avoid tiny rounding drift)
      const sumFinal = finalPct.reduce((s,v)=> s + (isFinite(v)?v:0), 0) || 1;
      const normalized = finalPct.map(v => (isFinite(v) ? (v * 100 / sumFinal) : 0));

      // draw stacked rects from bottom
      let yCursor = y + height; // start at bottom
      for (let i = 0; i < layers.length; i++) {
        const L = layers[i] || {};
        const pct = normalized[i] || 0;
        const rectH = Math.max(1, Math.round((pct / 100) * height));
        yCursor -= rectH;

        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', x + 2);
        r.setAttribute('y', yCursor + 1); // slight inset for aesthetics
        r.setAttribute('width', width - 4);
        r.setAttribute('height', Math.max(1, rectH - 1));
        const coalName = L.coal || (L.coalDoc && (L.coalDoc.coal || L.coalDoc.name)) || '';
        const fill = doFill ? pickColorForCoal(coalName, coalDB || window.COAL_DB || []) : 'none';
        r.setAttribute('fill', fill);
        r.setAttribute('stroke', '#ffffff55');
        r.setAttribute('data-coal', coalName);
        r.style.cursor = 'pointer';

        // simple mouse tooltip hookup (uses global showCoalRectTooltip if present)
        r.addEventListener('mouseenter', (ev) => {
          if (typeof window.showCoalRectTooltip === 'function') {
            window.showCoalRectTooltip(ev, bunkerIndex, i, L);
          } else {
            // fallback simple title
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
      // console.warn('renderBunkerIntoSVG error', e);
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
  const pct = (L.percent != null) ? (Number(L.percent).toFixed(3) + '%') : '--';
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

/* ---------- NEW: sequential timer computation for bottom-first consumption ---------- */
/* We will:
   - Prefer authoritative per-layer durations found in snapshot.bunkerTimers[idx].layers[*].remainingSeconds / layerTimerSeconds / initialSeconds
   - If not present, compute per-layer duration = (percent_fraction * bunkerCapacity) / flow  (hours -> seconds)
   - Simulate elapsed = now - savedAt (we try snapshot.savedAt / bunkerTimer.savedAt / layer saved time)
   - Walk layers bottom -> top subtracting elapsed; return the active layer and remaining seconds
*/
function tryParseSavedTimestamp(obj) {
  if (!obj) return null;
  const candKeys = ['savedAt','savedTimestamp','timerSavedAt','saved_at','timestamp','ts','time','saved','savedOn','createdAt'];
  for (const k of candKeys) {
    if (typeof obj[k] !== 'undefined' && obj[k] !== null) {
      const cand = obj[k];
      if (typeof cand === 'number') {
        if (cand < 1e11) return cand * 1000;
        return cand;
      }
      if (typeof cand === 'string') {
        const n = Number(cand);
        if (!Number.isNaN(n)) {
          if (n < 1e11) return n * 1000;
          return n;
        }
        const p = Date.parse(cand);
        if (!Number.isNaN(p)) return p;
      }
    }
  }
  if (typeof obj === 'number') {
    if (obj < 1e11) return obj * 1000;
    return obj;
  }
  if (typeof obj === 'string') {
    const n = Number(obj);
    if (!Number.isNaN(n)) {
      if (n < 1e11) return n * 1000;
      return n;
    }
    const p = Date.parse(obj);
    if (!Number.isNaN(p)) return p;
  }
  return null;
}
function getBunkerCapacityFrom(bun, snapshot, idx) {
  if (!bun) return null;
  const candProps = ['capacity','bunkerCapacity','capacityTon','size','cap'];
  for (const p of candProps) {
    if (typeof bun[p] !== 'undefined' && bun[p] !== null) {
      const v = safeNum(bun[p]);
      if (v !== null) return v;
    }
  }
  if (snapshot && Array.isArray(snapshot.bunkerCapacities) && typeof snapshot.bunkerCapacities[idx] !== 'undefined') {
    const v = safeNum(snapshot.bunkerCapacities[idx]);
    if (v !== null) return v;
  }
  // fallback: snapshot.bunkerCapacity or snapshot.bunkerCapacity (single)
  if (snapshot && typeof snapshot.bunkerCapacity !== 'undefined') {
    const v = safeNum(snapshot.bunkerCapacity);
    if (v !== null && v > 0) return v;
  }
  return 1000; // fallback default
}

// get per-layer original seconds (authoritative order must match clientBunkers order - bottom index 0)
function getLayerOriginalSeconds(layer, bunkerTimerLayerEntry, bun, snapshot, idx, flowVal, capacity) {
  // 1) prefer bunkerTimerLayerEntry.remainingSeconds / initialSeconds / layerTimerSeconds
  if (bunkerTimerLayerEntry) {
    if (typeof bunkerTimerLayerEntry.remainingSeconds !== 'undefined' && bunkerTimerLayerEntry.remainingSeconds !== null) {
      const v = safeNum(bunkerTimerLayerEntry.remainingSeconds);
      if (v !== null) return Number(v);
    }
    if (typeof bunkerTimerLayerEntry.initialSeconds !== 'undefined' && bunkerTimerLayerEntry.initialSeconds !== null) {
      const v = safeNum(bunkerTimerLayerEntry.initialSeconds);
      if (v !== null) return Number(v);
    }
    if (typeof bunkerTimerLayerEntry.layerTimerSeconds !== 'undefined' && bunkerTimerLayerEntry.layerTimerSeconds !== null) {
      const v = safeNum(bunkerTimerLayerEntry.layerTimerSeconds);
      if (v !== null) return Number(v);
    }
  }
  // 2) try layer.remainingSeconds / layer.initialSeconds / layer.layerTimerSeconds fields
  if (layer) {
    if (typeof layer.remainingSeconds !== 'undefined' && layer.remainingSeconds !== null) {
      const v = safeNum(layer.remainingSeconds);
      if (v !== null) return Number(v);
    }
    if (typeof layer.initialSeconds !== 'undefined' && layer.initialSeconds !== null) {
      const v = safeNum(layer.initialSeconds);
      if (v !== null) return Number(v);
    }
    if (typeof layer.layerTimerSeconds !== 'undefined' && layer.layerTimerSeconds !== null) {
      const v = safeNum(layer.layerTimerSeconds);
      if (v !== null) return Number(v);
    }
  }
  // 3) compute from percent * capacity / flow
  const rawPct = (layer && layer.percent != null) ? layer.percent : (layer && layer.percentages && layer.percentages.length ? layer.percentages[0] : null);
  const pct = (function parsePercentToFraction(raw) {
    if (raw === null || raw === undefined) return null;
    let vv = null;
    if (Array.isArray(raw) && raw.length) vv = safeNum(raw[0]);
    else vv = safeNum(raw);
    if (vv === null) return null;
    if (vv > 1) return vv / 100;
    return vv;
  })(rawPct);
  if (pct === null || pct <= 0) return null;
  // mass = pct * capacity
  if (!capacity || capacity <= 0) return null;
  if (!flowVal || flowVal <= 0) return null;
  const mass = pct * capacity; // same units as flow
  const hours = mass / flowVal;
  return hours * 3600;
}

// main sequential computation: returns { remainingSeconds, activeLayer, activeLayerIndex, consumedSecondsSoFar }
function computeSequentialRemainingForBunker(bun, bunkerTimerEntry, snapshot, idx, nowMs) {
  try {
    // determine the flows and capacity used for computed durations fallback
    let flowVal = null;
    if (snapshot && Array.isArray(snapshot.flows) && typeof snapshot.flows[idx] !== 'undefined') flowVal = safeNum(snapshot.flows[idx]);
    if (flowVal === null && typeof bun.flow !== 'undefined') flowVal = safeNum(bun.flow);
    const capacity = getBunkerCapacityFrom(bun, snapshot, idx);

    // decide where to get layers sequence: prefer bunkerTimerEntry.layers if it exists (should match bottom->top order)
    const timerLayers = (bunkerTimerEntry && Array.isArray(bunkerTimerEntry.layers)) ? bunkerTimerEntry.layers : null;
    const layers = (bun && Array.isArray(bun.layers)) ? bun.layers : [];

    // saved timestamp: try bunkerTimerEntry.savedAt -> snapshot.savedAt -> top-level snapshot savedAt -> now fallback
    let savedAtMs = null;
    if (bunkerTimerEntry) savedAtMs = tryParseSavedTimestamp(bunkerTimerEntry) || savedAtMs;
    if (!savedAtMs && snapshot && snapshot.savedAt) savedAtMs = tryParseSavedTimestamp(snapshot.savedAt) || savedAtMs;
    if (!savedAtMs && snapshot && snapshot.savedAtAt) savedAtMs = tryParseSavedTimestamp(snapshot.savedAtAt) || savedAtMs;
    // if there is top-level savedAt field in snapshot object itself (server response shape may differ)
    if (!savedAtMs && snapshot && snapshot.saved) savedAtMs = tryParseSavedTimestamp(snapshot.saved) || savedAtMs;
    if (!savedAtMs) savedAtMs = null;

    // elapsed in seconds since savedAt (if no savedAt, we will *not* subtract elapsed; instead treat saved as 'now')
    const elapsedSinceSaved = (savedAtMs ? Math.max(0, (nowMs - savedAtMs) / 1000) : 0);

    // We'll walk layers bottom-first. For each layer determine originalDurationSeconds,
    // then subtract consumed time (elapsedSinceSaved + previous layers) to find the active one.
    let elapsedToConsume = elapsedSinceSaved;
    // If savedAtMs not present, treat elapsedToConsume = 0 (so current timers are used as-is)
    if (!savedAtMs) elapsedToConsume = 0;

    // iterate index order: 0 .. n-1 (bottom to top) — normalizedSnapshot ensures bottom index 0
    for (let li = 0; li < Math.max(layers.length, (timerLayers ? timerLayers.length : 0)); li++) {
      const layer = layers[li] || null;
      const timerEntryLayer = (timerLayers && timerLayers[li]) ? timerLayers[li] : null;

      const originalSec = getLayerOriginalSeconds(layer, timerEntryLayer, bun, snapshot, idx, flowVal, capacity);
      if (originalSec === null) {
        // if no duration info for this layer, skip it (can't consume)
        continue;
      }

      if (elapsedToConsume < originalSec) {
        // this is the active layer: remaining = originalSec - elapsedToConsume
        const remaining = Math.max(0, originalSec - elapsedToConsume);
        // determine the active layer object to show tooltip and color: prefer timerEntryLayer content then layer
        const activeLayer = timerEntryLayer || layer || null;
        return { remainingSeconds: remaining, activeLayer, activeLayerIndex: li };
      } else {
        // this layer fully consumed; reduce elapsedToConsume and proceed to next
        elapsedToConsume = elapsedToConsume - originalSec;
        continue;
      }
    }

    // All layers consumed (or none had durations) => return 0 and no active layer
    return { remainingSeconds: 0, activeLayer: null, activeLayerIndex: null };
  } catch (e) {
    return { remainingSeconds: null, activeLayer: null, activeLayerIndex: null };
  }
}

/* ---------- Component (unit-aware) ---------- */
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
    // allow apiBase to be either 'http://host:port/api' or full '/api/unit/1'
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
            // attach unit info on global snapshot for other scripts that might want to know
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

  // getters for flows and timers (snapshot-driven)
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

  // tick to force recompute remaining seconds every second (we do not mutate percents)
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => { setNowMs(Date.now()); }, 1000);
    return () => clearInterval(id);
  }, []);

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

  // compute active-layer remaining & active-layer object for a bunker idx
  function computeActiveLayerInfo(idx) {
    const b = clientBunkers[idx] || { layers: [] };
    const bunkerTimerEntry = (snapshot && Array.isArray(snapshot.bunkerTimers) && snapshot.bunkerTimers[idx]) ? snapshot.bunkerTimers[idx] : null;
    return computeSequentialRemainingForBunker(b, bunkerTimerEntry, snapshot, idx, nowMs);
  }

  function safeFmt(v) {
    if (v === null || typeof v === 'undefined') return '--';
    if (typeof v === 'number') return Number.isFinite(v) ? v : '--';
    return v;
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

  /* ---------- Use existing dashboard renderer when available ---------- */
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

        if (typeof window !== 'undefined' && typeof window.renderBunkerIntoSVG === 'function') {
          window.renderBunkerIntoSVG(svg, bdata, window.COAL_DB || coalDB || [], idx, true, 1.2);
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
  }, [clientBunkers, coalDB, nowMs, snapshot]);

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

  /* ---------- derived metrics + per-bunker est gen (unchanged) ---------- */
  function getComputeBottomGcv(clientBunkersLocal, coalDBLocal, bunkerIndex, snapshotLocal) {
    try {
      if (!Array.isArray(clientBunkersLocal) || !clientBunkersLocal[bunkerIndex]) return null;
      const bun = clientBunkersLocal[bunkerIndex];
      if (!Array.isArray(bun.layers) || bun.layers.length === 0) return null;

      for (let li = bun.layers.length; li >=0; li--) {
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
            const found = findCoalInDbByNameOrId(L.coal, coalDBLocal, snapshotLocal);
            if (found && (found.gcv !== undefined && found.gcv !== null)) return safeNum(found.gcv);
          }
        }
      }

      const fallback = bun.layers[0];
      if (fallback) {
        const g = safeNum(fallback.gcv);
        if (g !== null) return g;
        if (fallback.coal) {
          const f = findCoalInDbByNameOrId(fallback.coal, coalDBLocal, snapshotLocal);
          if (f && (f.gcv !== undefined && f.gcv !== null)) return safeNum(f.gcv);
        }
      }
    } catch (e) {}
    return null;
  }

  function getComputeAboveActiveGcv(clientBunkersLocal, coalDBLocal, bunkerIndex, snapshotLocal) {
    try {
      if (!Array.isArray(clientBunkersLocal) || !clientBunkersLocal[bunkerIndex]) return null;
      const bun = clientBunkersLocal[bunkerIndex];
      if (!Array.isArray(bun.layers) || bun.layers.length === 0) return null;

      // find active layer index (first layer with pct > 0, same logic you already use elsewhere)
      let activeIdx = -1;
      for (let li = bun.layers.length ; li >=0; li--) {
        const L = bun.layers[li];
        if (!L) continue;
        let rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
        let pctVal = null;
        if (Array.isArray(rawPct) && rawPct.length) pctVal = safeNum(rawPct[0]);
        else pctVal = safeNum(rawPct);
        if (pctVal == null || pctVal > 0) { activeIdx = li; break; }
      }
      if (activeIdx === -1) activeIdx = 0; // fallback

      const aboveIdx = activeIdx + 1;
      if (aboveIdx >= 0 && aboveIdx < bun.layers.length) {
        const target = bun.layers[aboveIdx];
        if (target) {
          const g = safeNum(target.gcv);
          if (g !== null) return g;
          if (target.coal) {
            const found = findCoalInDbByNameOrId(target.coal, coalDBLocal, snapshotLocal);
            if (found && (found.gcv !== undefined && found.gcv !== null)) return safeNum(found.gcv);
          }
        }
      }

      // fallback to bottom GCV if above not available
      return getComputeBottomGcv(clientBunkersLocal, coalDBLocal, bunkerIndex, snapshotLocal);
    } catch (e) {
      return null;
    }
  }

  const derivedAndEstGen = useMemo(() => {
    const blendForCompute = snapshot || { bunkers: [], flows: [], generation: null, totalFlow: null };
    const derived = computeDerivedMetricsLocalFromSnapshot(blendForCompute, coalDB || [], snapshot, clientBunkers);
    const heatRate = derived.heatRate;

    const perBunkerEst24 = Array(NUM).fill('--');
    const perBunkerNextEst24 = Array(NUM).fill('--'); // <-- NEW

    for (let b = 0; b < NUM; b++) {
      const bottomGcv = getComputeBottomGcv(clientBunkers, coalDB || [], b, snapshot);
      const flowVal = getFlowFromSnapshot(snapshot, b);

      if (bottomGcv != null && flowVal != null && heatRate != null && heatRate !== 0) {
        const gen24 = (Number(bottomGcv) * Number(flowVal) / Number(heatRate));
        perBunkerEst24[b] = Number.isFinite(gen24) ? gen24 : '--';
      } else {
        perBunkerEst24[b] = '--';
      }

      // compute next-batch estimate using "above-active" GCV
      const aboveGcv = getComputeAboveActiveGcv(clientBunkers, coalDB || [], b, snapshot);
      if (aboveGcv != null && flowVal != null && heatRate != null && heatRate !== 0) {
        const gen24Next = (Number(aboveGcv) * Number(flowVal) / Number(heatRate));
        perBunkerNextEst24[b] = Number.isFinite(gen24Next) ? gen24Next : '--';
      } else {
        perBunkerNextEst24[b] = '--';
      }
    }

    return { derived, perBunkerEst24, perBunkerNextEst24 };
  }, [snapshot, coalDB, clientBunkers, nowMs]);

  /* ---------- Local colour picker used for timer boxes (matches SVG logic & DB) ---------- */
  const LOCAL_PALETTE = ["#f39c12","#3498db","#2ecc71","#ef4444","#8b5cf6","#14b8a6","#f97316","#06b6d4"];
  function pickColorForCoalLocal(name, coalDBLocal, snapshotLocal, layerObj) {
    // priority:
    // 1) layerObj.color or layerObj.coalDoc.color
    // 2) coalDB / snapshot match by id or name (color/colour/colorHex)
    // 3) deterministic palette hash fallback
    if (layerObj) {
      if (layerObj.color) return layerObj.color;
      if (layerObj.colour) return layerObj.colour;
      if (layerObj.coalDoc && (layerObj.coalDoc.color || layerObj.coalDoc.colour)) return layerObj.coalDoc.color || layerObj.coalDoc.colour;
    }
    if (!name) return LOCAL_PALETTE[0];
    const key = String(name).trim().toLowerCase();
    const found = findCoalInDbByNameOrId(key, coalDBLocal, snapshotLocal);
    if (found) {
      if (found.color) return found.color;
      if (found.colour) return found.colour;
      if (found.colorHex) return found.colorHex;
      // possible other aliases
      if (found.hex) return found.hex;
    }
    // deterministic hash fallback
    let h = 0;
    for (let i = 0; i < key.length; i++) { h = ((h << 5) - h) + key.charCodeAt(i); h |= 0; }
    return LOCAL_PALETTE[Math.abs(h) % LOCAL_PALETTE.length];
  }

  return (
    <>
      <div className="bunkers-grid" id="bunkersGrid">
        {Array.from({ length: NUM }).map((_, idx) => {
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

      {/* Estimated Generation */}
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

      {/* Next Coal Batch */}
      <div className="coal-flow-wrap">
        <div className="coal-flow-title">Next Coal Batch</div>
        <div className="coal-flow-grid" id="nextBlendGrid">
          {Array.from({ length: NUM }).map((_, idx) => {
            // compute active layer & remaining for this bunker
            const seq = computeActiveLayerInfo(idx);
            const remaining = seq && typeof seq.remainingSeconds === 'number' ? seq.remainingSeconds : null;
            const activeLayer = seq && seq.activeLayer ? seq.activeLayer : null;

            // determine coal name robustly
            const coalName = (activeLayer && (activeLayer.coal || (activeLayer.coalDoc && (activeLayer.coalDoc.coal || activeLayer.coalDoc.name)))) ||
                             (activeLayer && (activeLayer.coalId || activeLayer.coalId)) || null;

            // pick color from layer first then db
            const bg = pickColorForCoalLocal(coalName, coalDB, snapshot, activeLayer);

            // tooltip handlers show active layer info
            const onEnter = (ev) => {
              try {
                if (!activeLayer) return;
                const pageX = ev && ev.pageX ? ev.pageX : (ev && ev.clientX ? ev.clientX + window.scrollX : 0);
                const pageY = ev && ev.pageY ? ev.pageY : (ev && ev.clientY ? ev.clientY + window.scrollY : 0);
                const html = tooltipHtmlForLayer(activeLayer, coalDB, snapshot);
                showTooltipHtml(html, pageX, pageY);
              } catch (e) {}
            };
            const onMove = (ev) => {
              try {
                const pageX = ev && ev.pageX ? ev.pageX : (ev && ev.clientX ? ev.clientX + window.scrollX : 0);
                const pageY = ev && ev.pageY ? ev.pageY : (ev && ev.clientY ? ev.clientY + window.scrollY : 0);
                moveTooltip(pageX, pageY);
              } catch (e) {}
            };
            const onLeave = () => { try { hideTooltip(); } catch (e) {} };

            return (
              <div key={idx} className="coal-box" id={`nextBlendBox-${idx}`} data-bunker={idx}>
                <div
                  className="value"
                  onMouseEnter={onEnter}
                  onMouseMove={onMove}
                  onMouseLeave={onLeave}
                  style={ coalName ? { background: bg, color: '#fff', padding: '6px 8px', borderRadius: 6, minWidth: 80, textAlign: 'center' } : { minWidth: 80, textAlign: 'center' } }
                >
                  { remaining === null ? '--' : secondsToHHMMSS(remaining) }
                </div>
                <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
              </div>
            );
          })}
        </div>
      </div>



      {/* Next Coal Batch Estimated Generation */}
      <div className="coal-flow-wrap">
        <div className="coal-flow-title">Next Coal Batch Estimated Generation</div>
        <div className="coal-flow-grid" id="blendCompGrid">
          {Array.from({ length: NUM }).map((_, idx) => (
            <div key={idx} className="coal-box" id={`blendCompBox-${idx}`} data-bunker={idx}>
              <div className="value small">
                { (derivedAndEstGen.perBunkerNextEst24 && derivedAndEstGen.perBunkerNextEst24[idx] !== '--')
                  ? Number(derivedAndEstGen.perBunkerNextEst24[idx]).toFixed(2)
                  : '--' }
              </div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------- helper used inside derivedAndEstGen earlier (kept here) ---------- */
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
