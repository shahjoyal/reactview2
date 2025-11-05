// dashboard.js (sidebar + overview + single-bunker view) — unit-aware version
const API_BASE = window.location.origin + '/api';
// const DEFAULT_COAL_COLORS = ["#f39c12","#3498db","#2ecc71","#ef4444","#8b5cf6","#14b8a6","#f97316","#06b6d4"];

// // color mapping helpers
// const COAL_COLOR_STORAGE_KEY = 'coalColorMap_v1';
// let COAL_COLOR_MAP = (function loadMap(){
//   try{
//     const j = localStorage.getItem(COAL_COLOR_STORAGE_KEY);
//     if(j) return JSON.parse(j);
//   }catch(e){ /* ignore */ }
//   return {}; // key -> color
// })();

// let _paletteIndex = 0; // used if we must round-robin

// function saveColorMapToStorage(){
//   try{ localStorage.setItem(COAL_COLOR_STORAGE_KEY, JSON.stringify(COAL_COLOR_MAP)); }catch(e){ /* ignore */ }
// }

// /**
//  * normalizeKey - normalize a coal identifier/name to a stable key
//  * Accepts string or numeric id; returns lowercased trimmed string.
//  */
// function normalizeKey(coalNameOrId){
//   if(coalNameOrId === null || typeof coalNameOrId === 'undefined') return '';
//   return String(coalNameOrId).trim().toLowerCase();
// }

// /**
//  * pre-populate map from coalDB entries that already have colours
//  * call this once whenever you have the fetched coalDB
//  */
// function syncColorMapFromCoalDB(coalDB){
//   try{
//     if(!Array.isArray(coalDB)) return;
//     for(const entry of coalDB){
//       if(!entry) continue;
//       // entry might have fields: coal (name), name, id, color or colour
//       const possibleKey = (entry.coal || entry.name || entry.id || '').toString();
//       const key = normalizeKey(possibleKey);
//       const col = entry.color || entry.colour || null;
//       if(key && col && !COAL_COLOR_MAP[key]){
//         COAL_COLOR_MAP[key] = String(col);
//       }
//     }
//     saveColorMapToStorage();
//   }catch(e){ /* ignore */ }
// }

// /**
//  * findCoalColor - returns a stable color for the given coal name/id.
//  * Priority:
//  *   1) explicit colour on coalDB entry (color / colour)
//  *   2) persistent COAL_COLOR_MAP (localStorage)
//  *   3) assign next unused from DEFAULT_COAL_COLORS (or round-robin)
//  */
// function findCoalColor(coalNameOrId, coalDB){
//   try{
//     if(!coalNameOrId) return null;
//     const key = normalizeKey(coalNameOrId);

//     // 1) if map already has it, return
//     if(COAL_COLOR_MAP[key]) return COAL_COLOR_MAP[key];

//     // 2) check coalDB for explicit color (match by name or by id)
//     if(Array.isArray(coalDB)){
//       const byExactName = coalDB.find(c => (c.coal || c.name || '').toString().trim().toLowerCase() === key);
//       if(byExactName && (byExactName.color || byExactName.colour)){
//         COAL_COLOR_MAP[key] = byExactName.color || byExactName.colour;
//         saveColorMapToStorage();
//         return COAL_COLOR_MAP[key];
//       }
//       // try to match by id if coalNameOrId is id-like
//       const byId = coalDB.find(c => (typeof c.id !== 'undefined' && String(c.id) === String(coalNameOrId)) || (c._id && String(c._id) === String(coalNameOrId)));
//       if(byId && (byId.color || byId.colour)){
//         COAL_COLOR_MAP[key] = byId.color || byId.colour;
//         saveColorMapToStorage();
//         return COAL_COLOR_MAP[key];
//       }
//     }

//     // 3) assign an unused color from palette if possible
//     const used = new Set(Object.values(COAL_COLOR_MAP || {}));
//     let color = DEFAULT_COAL_COLORS.find(c => !used.has(c));
//     if(!color){
//       // all used — fallback to round-robin stable assignment
//       color = DEFAULT_COAL_COLORS[_paletteIndex % DEFAULT_COAL_COLORS.length];
//       _paletteIndex++;
//     }

//     COAL_COLOR_MAP[key] = color;
//     saveColorMapToStorage();
//     return color;
//   }catch(e){
//     console.error('findCoalColor error', e);
//     return null;
//   }
// }

/* ---------- Unit / per-unit blend-id mapping (reads same key as input.js) ---------- */
const BLEND_IDS_KEY = '__blendIdsByUnit_v1';
function readBlendIds(){
  try { return JSON.parse(localStorage.getItem(BLEND_IDS_KEY) || '{}'); }
  catch(e){ return {}; }
}
function writeBlendIds(obj){
  try { localStorage.setItem(BLEND_IDS_KEY, JSON.stringify(obj)); }
  catch(e){ /* ignore */ }
}

// persisted current dashboard unit (1..3)
window.DASHBOARD_ACTIVE_UNIT = Number(localStorage.getItem('currentUnit') || 1);
if (!window.DASHBOARD_ACTIVE_UNIT || window.DASHBOARD_ACTIVE_UNIT < 1 || window.DASHBOARD_ACTIVE_UNIT > 3) window.DASHBOARD_ACTIVE_UNIT = 1;

function setActiveUnit(u){
  u = Number(u) || 1;
  if (u < 1) u = 1; if (u > 3) u = 3;
  window.DASHBOARD_ACTIVE_UNIT = u;
  localStorage.setItem('currentUnit', String(u));
  // UI: toggle button active classes
  document.querySelectorAll('.unit-btn').forEach(btn => {
    const bu = Number(btn.dataset.unit || 0);
    btn.classList.toggle('active', bu === u);
    btn.setAttribute('aria-pressed', bu === u ? 'true' : 'false');
  });
}

// /* ---------- fetch helpers ---------- */
// async function fetchCoalDB(){
//   try{ const res = await fetch(API_BASE + '/coal'); if(!res.ok) return []; return await res.json(); }
//   catch(e){ console.error('coal fetch err', e); return []; }
// }
// async function fetchBlendLatest(){
//   try{ const res = await fetch(API_BASE + '/blend/latest'); if(!res.ok) return null; return await res.json(); }
//   catch(e){ console.error('blend fetch err', e); return null; }
// }

// fetch blend by unit mapping: read localStorage mapping key -> id and GET /api/blend/:id
// async function fetchBlendForUnit(unit){
//   try{
//     unit = Number(unit) || window.DASHBOARD_ACTIVE_UNIT || 1;
//     const ids = readBlendIds();
//     const id = ids && ids[unit] ? ids[unit] : null;
//     if(!id) return null;
//     const res = await fetch(API_BASE + '/blend/' + id);
//     if(!res.ok) return null;
//     return await res.json();
//   }catch(e){ console.error('fetchBlendForUnit err', e); return null; }
// }

/* ---------- robust safeNum (unit- & mongo-aware) ----------
   - accepts numbers
   - handles mongodb numeric wrappers ($numberInt, $numberDouble)
   - extracts first numeric token from strings like "10 t/h" or "10.5m3/h"
   - inspects object fields to find a numeric-like candidate
*/
function safeNum(v){
  try{
    if (v === null || typeof v === 'undefined') return null;

    // numeric types
    if (typeof v === 'number' && Number.isFinite(v)) return Number(v);

    // mongo number wrappers and objects
    if (typeof v === 'object'){
      if (v.$numberInt) {
        const n = Number(String(v.$numberInt).replace(/[^\d\.\-]/g,''));
        return Number.isFinite(n) ? n : null;
      }
      if (v.$numberDouble) {
        const n = Number(String(v.$numberDouble).replace(/[^\d\.\-]/g,''));
        return Number.isFinite(n) ? n : null;
      }
      // if object like {value: "10", unit:"t/h"} or similar, try object fields
      for (const k of Object.keys(v)){
        const candidate = v[k];
        if (typeof candidate === 'number' && Number.isFinite(candidate)) return Number(candidate);
        if (typeof candidate === 'string'){
          const s = candidate.trim();
          if (!s) continue;
          const m = s.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
          if (m && m[0] !== undefined){
            const n = Number(m[0]);
            if (Number.isFinite(n)) return n;
          }
        }
      }
      return null;
    }

    // strings: extract first numeric token (handles "10 t/h", "10.5m3/h", " -12.4 ")
    if (typeof v === 'string'){
      const s = v.trim();
      if (!s) return null;
      // optionally strip common thousands separator commas before matching
      const s2 = s.replace(/,/g, '');
      const m = s2.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
      if (m && m[0] !== undefined){
        const n = Number(m[0]);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    }

    // fallback: coerce
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }catch(e){
    return null;
  }
}

// ------------------- BEGIN: derived metrics helpers (ADD HERE) -------------------

/**
 * getBunkerFlow - robustly read a bunker flow value from blend object
 */
function getBunkerFlow(blend, idx){
  try{
    // common places: blend.flows array or blend.bunkers[idx].flow
    if(Array.isArray(blend && blend.flows) && typeof blend.flows[idx] !== 'undefined') {
      const v = safeNum(blend.flows[idx]);
      if(v !== null) return v;
    }
    if(Array.isArray(blend && blend.bunkers) && blend.bunkers[idx] && typeof blend.bunkers[idx].flow !== 'undefined'){
      const v = safeNum(blend.bunkers[idx].flow);
      if(v !== null) return v;
    }
  }catch(e){}
  return null;
}

/**
 * getBottomGcvForBunker - pick the bottom-most draining layer GCV for a bunker
 * Strategy:
 *  1) Prefer bunker.layers (iterate bottom->top, first layer with percent>0).
 *  2) Fallback: scan blend.rows from bottom->top for a row that maps to this bunker
 *     (percentages[b] > 0, or row.percent used as legacy for bunker 0).
 *  3) If row maps to a coal id/name, look up in coalDB for gcv.
 */
function getBottomGcvForBunker(blend, coalDB, bunkerIndex){
  try{
    // 0) If a client-side binder exists, prefer its active layer (it represents the layer currently draining)
    if(window.nextBlendBinder && typeof window.nextBlendBinder.getActiveLayer === 'function'){
      const activeLayer = window.nextBlendBinder.getActiveLayer(bunkerIndex);
      if(activeLayer){
        const g = safeNum(activeLayer.gcv);
        if(g !== null) return g;
        // fallback: try lookup by activeLayer.coal similar to older logic
        if(activeLayer.coal){
          const keyLower = String(activeLayer.coal || '').trim().toLowerCase();
          const found = (Array.isArray(coalDB) ? coalDB.find(c => {
            if(!c) return false;
            if(c.coal && String(c.coal).trim().toLowerCase() === keyLower) return true;
            if(c.name && String(c.name).trim().toLowerCase() === keyLower) return true;
            if((c._id || c.id) && String(c._id || c.id) === String(activeLayer.coal)) return true;
            return false;
          }) : null);
          if(found && (found.gcv !== undefined && found.gcv !== null)) return safeNum(found.gcv);
        }
      }
    }

    // 1) from bunker.layers (bottom->top)
    if(Array.isArray(blend && blend.bunkers) && blend.bunkers[bunkerIndex] && Array.isArray(blend.bunkers[bunkerIndex].layers)){
      const layers = blend.bunkers[bunkerIndex].layers;
      for(let li = layers.length - 1; li >= 0; li--){
        const L = layers[li];
        if(!L) continue;
        const rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
        let pctVal = null;
        if(Array.isArray(rawPct) && rawPct.length) pctVal = safeNum(rawPct[0]);
        else pctVal = safeNum(rawPct);
        if(pctVal && pctVal > 0){
          const g = safeNum(L.gcv);
          if(g !== null) return g;
          if(L.coal){
            const keyLower = String(L.coal || '').trim().toLowerCase();
            const found = (Array.isArray(coalDB) ? coalDB.find(c => {
              if(!c) return false;
              if(c.coal && String(c.coal).trim().toLowerCase() === keyLower) return true;
              if(c.name && String(c.name).trim().toLowerCase() === keyLower) return true;
              if((c._id || c.id) && String(c._id || c.id) === String(L.coal)) return true;
              return false;
            }) : null);
            if(found && (found.gcv !== undefined && found.gcv !== null)) return safeNum(found.gcv);
          }
        }
      }
    }

    // 2) fallback: scan blend.rows bottom->top (legacy behavior)
    if(Array.isArray(blend && blend.rows)){
      for(let r = blend.rows.length - 1; r >= 0; r--){
        const row = blend.rows[r];
        if(!row) continue;
        let p = null;
        if(Array.isArray(row.percentages) && row.percentages.length > bunkerIndex){
          p = safeNum(row.percentages[bunkerIndex]);
        } else if(typeof row.percent === 'number' && bunkerIndex === 0){
          p = safeNum(row.percent);
        } else if(row.percent){
          p = safeNum(row.percent);
        }
        if(p === null || p === 0) continue;

        if(row.gcv !== undefined && row.gcv !== null){
          const g = safeNum(row.gcv);
          if(g !== null) return g;
        }

        if(row.coal && typeof row.coal === 'object' && (row.coal[String(bunkerIndex)] || row.coal[bunkerIndex] )){
          const ref = row.coal[String(bunkerIndex)] || row.coal[bunkerIndex];
          const keyLower = String(ref || '').trim().toLowerCase();
          const found = (Array.isArray(coalDB) ? coalDB.find(c => {
            if(!c) return false;
            if(c.coal && String(c.coal).trim().toLowerCase() === keyLower) return true;
            if(c.name && String(c.name).trim().toLowerCase() === keyLower) return true;
            if((c._id || c.id) && String(c._id || c.id) === String(ref)) return true;
            return false;
          }) : null);
          if(found && (found.gcv !== undefined && found.gcv !== null)) return safeNum(found.gcv);
        }

        if(row.coal && typeof row.coal === 'string'){
          const keyLower = String(row.coal).trim().toLowerCase();
          const found = (Array.isArray(coalDB) ? coalDB.find(c => {
            if(!c) return false;
            if(c.coal && String(c.coal).trim().toLowerCase() === keyLower) return true;
            if(c.name && String(c.name).trim().toLowerCase() === keyLower) return true;
            if((c._id || c.id) && String(c._id || c.id) === String(row.coal)) return true;
            return false;
          }) : null);
          if(found && (found.gcv !== undefined && found.gcv !== null)) return safeNum(found.gcv);
        }
      }
    }
  }catch(e){
    console.error('getBottomGcvForBunker error', e);
  }
  return null;
}

// ------------------- NextBlendBinder: use DB timers (or fallback percent flow calc) to drive active layer countdowns ----------

function parseTimerToSeconds(timerVal){
  if(timerVal === null || typeof timerVal === 'undefined') return null;
  if(typeof timerVal === 'number' && Number.isFinite(timerVal)) return Math.max(0, Math.floor(timerVal));
  if(typeof timerVal === 'object'){
    if(timerVal.$numberInt) return Math.max(0, Number(timerVal.$numberInt) | 0);
    if(timerVal.$numberDouble) return Math.max(0, Math.floor(Number(timerVal.$numberDouble)));
    try { timerVal = String(timerVal); } catch(e){ return null; }
  }
  const s = String(timerVal).trim();
  if(!s) return null;
  if(s.indexOf(':') >= 0){
    const parts = s.split(':').map(x => Number(x.replace(/^0+/, '') || 0));
    if(parts.length === 3 && parts.every(p => !isNaN(p))){
      return parts[0]*3600 + parts[1]*60 + parts[2];
    } else if(parts.length === 2 && parts.every(p => !isNaN(p))){
      return parts[0]*60 + parts[1];
    }
    const m = s.match(/(\d+)/g);
    if(m && m.length) return Math.max(0, Number(m.join('')));
    return null;
  }
  const n = Number(s.replace(/[^0-9\.\-]/g,''));
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

function buildSequencesFromBlend(blend){
  const BUNKER_COUNT = (Array.isArray(blend && blend.bunkers) ? blend.bunkers.length : 8);
  const capacity = safeNum(blend && blend.bunkerCapacity);
  const seqs = Array.from({length: BUNKER_COUNT}, () => []);
  for(let b = 0; b < BUNKER_COUNT; b++){
    const fVal = getBunkerFlow(blend, b);
    const bdata = (Array.isArray(blend && blend.bunkers) && blend.bunkers[b]) ? blend.bunkers[b] : { layers: [] };
    const layers = Array.isArray(bdata.layers) ? bdata.layers.slice() : [];
    // iterate bottom->top (last -> first)
    for(let li = layers.length - 1; li >= 0; li--){
      const L = layers[li];
      if(!L){ seqs[b].push(null); continue; }
      // prefer explicit layer.timer
      const tsec = parseTimerToSeconds(L.timer);
      if(tsec !== null && !isNaN(tsec)){
        seqs[b].push(Math.max(0, Math.floor(tsec)));
        continue;
      }
      // otherwise use percent -> seconds if possible
      const rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
      let pct = 0;
      if(Array.isArray(rawPct) && rawPct.length) pct = safeNum(rawPct[0]) || 0;
      else pct = safeNum(rawPct) || 0;
      if(pct === 0){
        seqs[b].push(null);
        continue;
      }
      if(capacity !== null && fVal !== null && fVal > 0){
        const hours = (pct / 100) * Number(capacity) / Number(fVal);
        const seconds = Math.max(0, Math.ceil(hours * 3600));
        seqs[b].push(seconds);
      } else {
        seqs[b].push(null);
      }
    }
  }
  return seqs;
}

class NextBlendBinder {
  constructor(blend){
    this.blend = blend || null;
    this.sequences = buildSequencesFromBlend(this.blend || {});
    // defensive: ensure sequences is an array
    if(!Array.isArray(this.sequences)) this.sequences = [];
    // active index per bunker (index into sequences[b], 0 = bottom)
    this.activeIdx = Array.from({length: this.sequences.length}, () => null);
    // remaining seconds per bunker
    this.remaining = Array.from({length: this.sequences.length}, () => null);
    this._tickHandle = null;
    this._lastDispatchedSnapshot = null;
    // initialize active / remaining
    this._resetFromSequences();
  }

  _resetFromSequences(){
    // defensive: ensure sequences is array
    if(!Array.isArray(this.sequences)) this.sequences = [];
    for(let b = 0; b < this.sequences.length; b++){
      const seq = this.sequences[b] || [];
      // find first valid (non-null) element (bottom-most)
      let found = null;
      for(let i = 0; i < seq.length; i++){ if(seq[i] !== null && typeof seq[i] !== 'undefined'){ found = i; break; } }
      if(found !== null){
        this.activeIdx[b] = found;
        this.remaining[b] = seq[found];
      } else {
        this.activeIdx[b] = null;
        this.remaining[b] = null;
      }
    }
    // ensure arrays exist and have at least length 0
    if(!Array.isArray(this.activeIdx)) this.activeIdx = [];
    if(!Array.isArray(this.remaining)) this.remaining = [];
    this._maybeDispatch();
  }

  updateBlend(newBlend){
    this.blend = newBlend || null;
    const newSeq = buildSequencesFromBlend(this.blend || {});
    this.sequences = Array.isArray(newSeq) ? newSeq : [];
    // replace sequences, and attempt to preserve remaining if possible:
    // simple approach: if the previous remaining is null or we can't map, reset to DB values
    this.activeIdx = Array.from({length: this.sequences.length}, () => null);
    this.remaining = Array.from({length: this.sequences.length}, () => null);
    this._resetFromSequences();
  }

  start(){
    if(this._tickHandle) return;
    this._tickHandle = setInterval(() => this._tick(), 1000);
    // dispatch once immediately so UI can use binder state
    this._maybeDispatch(true);
  }

  stop(){
    if(this._tickHandle){ clearInterval(this._tickHandle); this._tickHandle = null; }
  }

  _tick(){
    let changed = false;
    for(let b = 0; b < this.sequences.length; b++){
      const rem = this.remaining[b];
      if(rem === null || typeof rem === 'undefined') continue;
      if(rem > 0){
        this.remaining[b] = rem - 1;
        changed = true;
      } else {
        // rem === 0 -> advance to next valid element in that sequence
        const seq = this.sequences[b] || [];
        const currIdx = this.activeIdx[b];
        let nextIdx = null;
        if(Array.isArray(seq)){
          for(let i = (currIdx === null ? 0 : currIdx + 1); i < seq.length; i++){
            if(seq[i] !== null && typeof seq[i] !== 'undefined'){
              nextIdx = i;
              break;
            }
          }
        }
        if(nextIdx !== null){
          this.activeIdx[b] = nextIdx;
          this.remaining[b] = seq[nextIdx];
          changed = true;
        } else {
          // no more layers -> clear
          if(this.activeIdx[b] !== null || this.remaining[b] !== null){
            this.activeIdx[b] = null;
            this.remaining[b] = null;
            changed = true;
          }
        }
      }
    }
    if(changed) this._maybeDispatch();
  }

  _maybeDispatch(force){
    // build a small snapshot to compare so we don't constantly dispatch identical events
    const snapshot = JSON.stringify({activeIdx: this.activeIdx, remaining: this.remaining});
    if(!force && snapshot === this._lastDispatchedSnapshot) return;
    this._lastDispatchedSnapshot = snapshot;
    try{
      const ev = new CustomEvent('nextBlend:updated', { detail: { activeIdx: this.activeIdx.slice(), remaining: this.remaining.slice() } });
      window.dispatchEvent(ev);
    }catch(e){}
  }

  // return the active layer object for a bunker (from the latest blend),
  // or null if none. This makes downstream lookups simple.
  getActiveLayer(bunkerIndex){
    try{
      if(!this.blend || !Array.isArray(this.blend.bunkers) || !Array.isArray(this.blend.bunkers[bunkerIndex].layers)) return null;
      const layers = this.blend.bunkers[bunkerIndex].layers;
      const idxInSeq = this.activeIdx[bunkerIndex];
      if(idxInSeq === null || typeof idxInSeq === 'undefined') return null;
      // sequences are built bottom->top by iterating layers from end->0; mapping:
      // originalLayerIndex = layers.length - 1 - idxInSeq
      const orig = (layers.length - 1 - idxInSeq);
      if(orig < 0 || orig >= layers.length) return null;
      return layers[orig] || null;
    }catch(e){
      return null;
    }
  }
}

// expose class for debug
window.NextBlendBinder = NextBlendBinder;

/**
 * computeDerivedMetrics - computes avgGCV & heatRate using bottom-coal gcv * flow logic
 * returns { avgGCV: number|null, heatRate: number|null, totalFlow: number|null }
 */
// function computeDerivedMetrics(blend, coalDB){
//   try{
//     if(!blend) return { avgGCV: null, heatRate: null, totalFlow: null };

//     // totalFlow preference: blend.totalFlow if valid else sum of available flows
//     const bf = safeNum(blend.totalFlow);
//     let totalFlow = (bf !== null) ? bf : null;

//     let sumNumerator = 0;
//     let sumFlowsForNumerator = 0;

//     const bunkerCount = (Array.isArray(blend.bunkers) ? blend.bunkers.length : 8);
//     for(let b = 0; b < bunkerCount; b++){
//       const flowVal = getBunkerFlow(blend, b);
//       const bottomGcv = getBottomGcvForBunker(blend, coalDB, b);
//       if(flowVal !== null && bottomGcv !== null){
//         sumNumerator += (Number(bottomGcv) * Number(flowVal));
//         sumFlowsForNumerator += Number(flowVal);
//       }
//     }

//     if(totalFlow === null){
//       // fallback to sumFlowsForNumerator if server totalFlow not present
//       totalFlow = (sumFlowsForNumerator > 0) ? sumFlowsForNumerator : null;
//     }

//     const avgGCV = (totalFlow && totalFlow > 0) ? (sumNumerator / totalFlow) : null;

//     // generation fallback
//     const generation = safeNum(blend.generation);
//     let heatRate = null;
//     if(avgGCV !== null && totalFlow !== null && generation !== null && generation > 0){
//       heatRate = (avgGCV * Number(totalFlow)) / Number(generation);
//     }

//     return { avgGCV: (avgGCV === null ? null : Number(avgGCV)), heatRate: (heatRate === null ? null : Number(heatRate)), totalFlow: (totalFlow === null ? null : Number(totalFlow)) };
//   }catch(e){
//     console.error('computeDerivedMetrics error', e);
//     return { avgGCV: null, heatRate: null, totalFlow: null };
//   }
// }

// /**
//  * recomputeAndPopulate - reuses window.LATEST_BLEND & window.COAL_DB to recompute summary metrics
//  */
// function recomputeAndPopulate(){
//   try{
//     const blend = window.LATEST_BLEND || null;
//     const coalDB = window.COAL_DB || [];
//     if(!blend) return;
//     const derived = computeDerivedMetrics(blend, coalDB);

//     // preserve other metrics that server may provide
//     const metrics = {
//       generation: (blend.generation !== undefined ? blend.generation : null),
//       totalFlow: (derived.totalFlow !== null ? derived.totalFlow : (blend.totalFlow !== undefined ? blend.totalFlow : null)),
//       avgGCV: (derived.avgGCV !== null ? derived.avgGCV : (blend.avgGCV !== undefined ? blend.avgGCV : null)),
//       avgAFT: (blend.avgAFT !== undefined ? blend.avgAFT : null),
//       heatRate: (derived.heatRate !== null ? derived.heatRate : (blend.heatRate !== undefined ? blend.heatRate : null)),
//       costRate: (blend.costRate !== undefined ? blend.costRate : null)
//     };
//     populateStats(metrics);
//   }catch(e){ console.error('recomputeAndPopulate err', e); }
// }

// // ------------------- END: derived metrics helpers -------------------


// /* ---------- Tooltip helpers (floating DOM tooltip) ---------- */
// const coalTip = document.getElementById('coalTooltip');
// function buildTooltipHtml({name, pct, gcv, cost, aft}){
//   const lines = [];
//   if(name) lines.push(`<strong>${name}</strong>`);
//   if(typeof pct !== 'undefined') lines.push(`%: ${pct}`);
//   if(typeof gcv !== 'undefined') lines.push(`GCV: ${gcv}`);
//   if(typeof cost !== 'undefined') lines.push(`Cost: ${cost}`);
//   if(typeof aft !== 'undefined' && aft !== null) lines.push(`AFT: ${aft}`);
//   return lines.join('<br>');
// }
// function showCoalRectTooltip(ev, rowIndex, millIndex, layerData){
//   try{
//     coalTip.innerHTML = buildTooltipHtml({
//       name: layerData.coal || layerData.name || 'No name',
//       pct: layerData.percent != null ? layerData.percent : '--',
//       gcv: layerData.gcv != null ? layerData.gcv : '--',
//       cost: layerData.cost != null ? layerData.cost : '--',
//       aft: (window.LATEST_BLEND && Array.isArray(window.LATEST_BLEND.aftPerMill)) ? (window.LATEST_BLEND.aftPerMill[millIndex] || '--') : '--'
//     });
//     coalTip.style.display = 'block';
//     coalTip.setAttribute('aria-hidden','false');
//     moveCoalRectTooltip(ev);
//   }catch(e){ console.error('showCoalRectTooltip', e); }
// }
// function moveCoalRectTooltip(ev){
//   if(!coalTip) return;
//   const x = (ev.pageX + 12);
//   const y = (ev.pageY + 12);
//   coalTip.style.left = x + 'px';
//   coalTip.style.top = y + 'px';
// }
// function hideCoalRectTooltip(){
//   if(!coalTip) return;
//   coalTip.style.display = 'none';
//   coalTip.setAttribute('aria-hidden','true');
// }

/* ---------- Render functions ---------- */
/* render a bunker into a given svg element (svg uses viewBox "0 0 100 150")
   IMPORTANT: assign a unique svg.id (if not present) and use that id for clipPath to avoid duplicate clipPath conflicts
*/
function renderBunkerIntoSVG(svg, bunkerData, coalDB, bunkerIndex = 0, strokeOpenTop = true, strokeWidth = 1.3){
  if(!svg) return;

  // ensure unique svg id
  if(!svg.id){
    svg.id = 'svg_' + Math.random().toString(36).slice(2);
  }
  const topY = 10, midY = 100, bottomY = 140;
  const usableH = bottomY - topY;

  // closed path for clip (so fills clip correctly)
  const clipPathClosed = `M10 ${topY} L10 ${midY} L45 ${bottomY} L55 ${bottomY} L90 ${midY} L90 ${topY} L10 ${topY}`;
  // stroke paths (left and right) to show open top if requested
  const leftStroke = `M10 ${topY} L10 ${midY} L45 ${bottomY}`;
  const rightStroke = `M90 ${topY} L90 ${midY} L55 ${bottomY}`;

  const clipId = `${svg.id}-clip`;

  // layers expected bottom->top
  const layers = Array.isArray(bunkerData && bunkerData.layers) ? bunkerData.layers.slice() : [];
  // propagate color from layer if present
  const filtered = layers
    .map(l => ({
      coal: l.coal || '',
      percent: safeNum(l.percent) || 0,
      gcv: safeNum(l.gcv),
      cost: safeNum(l.cost),
      rowIndex: (typeof l.rowIndex !== 'undefined' && l.rowIndex !== null) ? l.rowIndex : null,
      color: (typeof l.color !== 'undefined' && l.color !== null) ? String(l.color) : null  // <- NEW
    }))
    .filter(l => l.percent > 0);


  // --- reverse display order so the first layer in data renders last (top) ---
  filtered.reverse();

  // build svg: defs + strokes + rects
  let inner = `<defs><clipPath id="${clipId}"><path d="${clipPathClosed}" /></clipPath></defs>`;

  // outlines - if strokeOpenTop true, draw left & right only (open top)
  if(strokeOpenTop){
    inner += `<path d="${leftStroke}" stroke="#000" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
    inner += `<path d="${rightStroke}" stroke="#000" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
  } else {
    inner += `<path d="${clipPathClosed}" stroke="#000" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
  }

  // rects clipped
  let cum = 0;
  for(let i=0;i<filtered.length;i++){
    const pct = Math.max(0, Math.min(100, filtered[i].percent));
    const h = (pct / 100) * usableH;
    const y = bottomY - (cum + h);
    // prefer layer.color, then DB color, then default palette
    const color = filtered[i].color || findCoalColor(filtered[i].coal, coalDB) || DEFAULT_COAL_COLORS[i % DEFAULT_COAL_COLORS.length];

    // JSON-escape for attribute
    const layerJson = JSON.stringify(filtered[i]).replace(/"/g,'&quot;');

    inner += `<g clip-path="url(#${clipId})">` +
             `<rect x="10" y="${y}" width="80" height="${h}" fill="${color}" data-row="${filtered[i].rowIndex}" data-mill="${bunkerIndex}" data-pct="${filtered[i].percent}" ` +
             `onmouseenter="window.showCoalRectTooltip && window.showCoalRectTooltip(event, ${filtered[i].rowIndex || 0}, ${bunkerIndex}, ${layerJson})" ` +
             `onmousemove="window.moveCoalRectTooltip && window.moveCoalRectTooltip(event)" ` +
             `onmouseleave="window.hideCoalRectTooltip && window.hideCoalRectTooltip()" />` +
             `</g>`;
    cum += h;
  }

  svg.innerHTML = inner;
}

/* ---------- UI update helpers ---------- */
// function populateStats(metrics){
//   const setText = (id, v) => { const el = document.getElementById(id); if(el) el.innerText = (v === null || typeof v === 'undefined') ? '--' : String(v); };
//   setText('GEN', metrics.generation !== undefined ? metrics.generation : '--');
//   setText('TOTALFLOW', (metrics.totalFlow !== undefined) ? Number(metrics.totalFlow).toFixed(2) : '--');
//   setText('AVGGCV', (metrics.avgGCV !== undefined) ? Number(metrics.avgGCV).toFixed(2) : '--');
//   setText('AVGAFT', (metrics.avgAFT !== undefined && metrics.avgAFT !== null) ? Number(metrics.avgAFT).toFixed(2) : '--');
//   setText('HEATRATE', (metrics.heatRate !== undefined && metrics.heatRate !== null) ? Number(metrics.heatRate).toFixed(2) : '--');
//   setText('COSTRATE', (metrics.costRate !== undefined) ? Number(metrics.costRate).toFixed(2) : '--');
// }

/* ---------- render overview (all bunkers) ---------- */
function renderOverview(blend, coalDB){
  // ensure we leave single-mode and restore multi-column layout
  try { document.body.classList.remove('single-mode'); } catch(e) { /* ignore */ }

  const bunkers = document.querySelectorAll('.bunker');
  bunkers.forEach((bEl, idx) => {
    const bdata = (Array.isArray(blend.bunkers) && blend.bunkers[idx]) ? blend.bunkers[idx] : { layers: [] };
    const svg = bEl.querySelector('svg');
    // ensure svg has unique id for its clip
    if(!svg.id) svg.id = `ov_svg_${idx}_${Math.random().toString(36).slice(2)}`;
    renderBunkerIntoSVG(svg, bdata, coalDB, idx, true, 1.3);
  });

  // show overview, hide single
  const ov = document.getElementById('overviewView');
  const single = document.getElementById('singleView');
  if(ov) ov.style.display = '';
  if(single) single.style.display = 'none';

  const topOverlay = document.getElementById('topOverlay');
  if(topOverlay) topOverlay.style.display = '';

  // show all arrows
  if(topOverlay){
    const arrows = topOverlay.querySelectorAll('.arrow');
    arrows.forEach(a => a.style.display = '');
    // remove any single arrow duplicates
    const singleArrow = topOverlay.querySelector('.arrow.single');
    if(singleArrow) singleArrow.style.display = 'none';
  }
}

/* ---------- render single bunker view ---------- */
function renderSingle(bunkerIndex, blend, coalDB){
  // ensure body enters single-mode so CSS expands the layout
  try { document.body.classList.add('single-mode'); } catch(e) { /* ignore */ }

  const singleSvg = document.getElementById('singleSvg');
  const singleLabel = document.getElementById('singleLabel');
  const bdata = (Array.isArray(blend.bunkers) && blend.bunkers[bunkerIndex]) ? blend.bunkers[bunkerIndex] : { layers: [] };

  // ensure svg has unique id
  if(!singleSvg.id) singleSvg.id = `single_svg_${bunkerIndex}_${Math.random().toString(36).slice(2)}`;

  // render to single svg with larger strokes and open top
  renderBunkerIntoSVG(singleSvg, bdata, coalDB, bunkerIndex, true, 1.6);

  singleLabel.textContent = `Bunker ${bunkerIndex + 1}`;

  // show single and hide overview
  const ov = document.getElementById('overviewView');
  const singleView = document.getElementById('singleView');
  if(ov) ov.style.display = 'none';
  if(singleView) singleView.style.display = '';

  // top overlay: hide all arrows and show one centered arrow
  const topOverlay = document.getElementById('topOverlay');
  if(topOverlay){
    topOverlay.style.display = '';
    const arrows = topOverlay.querySelectorAll('.arrow');
    arrows.forEach(a => a.style.display = 'none');
    let singleArrow = topOverlay.querySelector('.arrow.single');
    if(!singleArrow){
      singleArrow = document.createElement('div');
      singleArrow.className = 'arrow single';
      topOverlay.appendChild(singleArrow);
    }
    singleArrow.style.left = '50%';
    singleArrow.style.display = '';
  }
}

/* ---------- refresh main data and render according to active tab (unit-aware) ---------- */
// async function refreshAndRender(activeMode, activeIndex, unit){
//   // prevent re-entrancy (avoid races when user switches units quickly or auto-refresh runs)
//   if(window.__refresh_in_progress) {
//     //console.debug('refreshAndRender skipped due to in-progress refresh');
//     return;
//   }
//   window.__refresh_in_progress = true;

//   try {
//     // unit param optional; defaults to persisted
//     unit = Number(unit || window.DASHBOARD_ACTIVE_UNIT || 1);
//     window.DASHBOARD_ACTIVE_UNIT = unit;

//     // fetch coalDB
//     let coalDB = [];
//     try { coalDB = await fetchCoalDB(); } catch(e){ console.warn('fetchCoalDB failed', e); }
//     window.COAL_DB = coalDB || [];
//     try { syncColorMapFromCoalDB(window.COAL_DB); } catch(e){ /* ignore */ }

//     // --- fetch unit-specific blend (with multiple fallbacks & cache-bust) ---
//     let blend = null;
//     let usedPath = 'none';
//     try {
//       if(typeof fetchBlendForUnit === 'function'){
//         // let fetchBlendForUnit do its thing; if it calls server, that function may cache — we don't modify it here
//         blend = await fetchBlendForUnit(unit);
//         if(blend) usedPath = 'fetchBlendForUnit';
//       }
//     } catch(e) {
//       console.warn('fetchBlendForUnit threw', e);
//       blend = null;
//     }

//     // fallback: try mapping in localStorage and fetch by _id (cache-busted)
//     if(!blend){
//       try {
//         const raw = localStorage.getItem('__blendIdsByUnit_v1') || localStorage.getItem('__blendIdsByUnit') || '{}';
//         let mapping = {};
//         try { mapping = JSON.parse(raw); } catch(e){ mapping = {}; }
//         let mappedId = mapping && (mapping[String(unit)] || mapping['unit'+String(unit)] || null);
//         if(!mappedId && mapping && mapping.byUnit && mapping.byUnit[String(unit)]) mappedId = mapping.byUnit[String(unit)];
//         if(mappedId){
//           usedPath = 'mappedId';
//           try {
//             // cache-bust the GET so we don't get stale content from browser cache/proxy
//             const resp = await fetch('/api/blend/' + mappedId + '?_ts=' + Date.now(), { method: 'GET', credentials: 'same-origin' });
//             if(resp && resp.ok){
//               const j = await resp.json();
//               blend = j && j._id ? j : (j && j.data ? j.data : j);
//             }
//           } catch(e){
//             console.warn('fetch by mappedId failed', e);
//           }
//         }
//       } catch(e){
//         console.warn('mapping fallback failed', e);
//       }
//     }

//     // tertiary: fetch latest (cache-bust)
//     if(!blend){
//       try {
//         const j = await (await fetch('/api/blend/latest?_ts=' + Date.now(), { credentials: 'same-origin' })).json();
//         blend = j && j._id ? j : (j && j.data ? j.data : j);
//         usedPath = 'latest';
//       } catch(e) {
//         console.warn('fetchBlendLatest failed', e);
//         blend = null;
//       }
//     }

//     window.LATEST_BLEND = blend || null;
//     console.debug('refreshAndRender: usedPath=', usedPath, 'blendId=', (blend && blend._id) ? (blend._id.$oid || blend._id) : blend && blend._id);

//     // ---------- Binder handling (prefer updateBlend else recreate) ----------
//     function recreateBinder(blendObj){
//       try { if(window.nextBlendBinder && typeof window.nextBlendBinder.stop === 'function'){ try { window.nextBlendBinder.stop(); } catch(e){ console.warn('prev binder stop err', e); } } } catch(e){}
//       try { if(window.__nextBlend_recompute_timer){ clearInterval(window.__nextBlend_recompute_timer); window.__nextBlend_recompute_timer = null; } } catch(e){}
//       try { if(window.__nextBlend_tick_timer){ clearInterval(window.__nextBlend_tick_timer); window.__nextBlend_tick_timer = null; } } catch(e){}
//       if(typeof NextBlendBinder === 'function'){
//         try {
//           window.nextBlendBinder = new NextBlendBinder(blendObj || {});
//           if(typeof window.nextBlendBinder.start === 'function'){ try { window.nextBlendBinder.start(); } catch(e){ console.warn('binder start error', e); } }
//         } catch(e) {
//           console.error('create binder failed', e);
//           window.nextBlendBinder = { start: function(){}, stop: function(){}, updateBlend: function(){}, state: [] };
//         }
//       } else {
//         window.nextBlendBinder = { start: function(){}, stop: function(){}, updateBlend: function(){}, state: [] };
//       }
//     }

//     try {
//       if(window.nextBlendBinder && typeof window.nextBlendBinder.updateBlend === 'function'){
//         try {
//           window.nextBlendBinder.updateBlend(blend || {});
//         } catch(e){
//           console.warn('updateBlend threw, recreating binder', e);
//           recreateBinder(blend || {});
//         }
//       } else {
//         recreateBinder(blend || {});
//       }
//     } catch(e){
//       console.error('binder handling top-level error, recreating', e);
//       recreateBinder(blend || {});
//     }

//     // ---------- Build flowsForUI (exact first 8 entries) ----------
//     let flowsForUI = [];
//     try {
//       if(blend && Array.isArray(blend.flows) && blend.flows.length) flowsForUI = blend.flows.slice(0,8);
//       else if(blend && Array.isArray(blend.bunkers)) flowsForUI = blend.bunkers.map(b => (b && typeof b.flow !== 'undefined') ? b.flow : undefined).slice(0,8);
//     } catch(e){ flowsForUI = []; }

//     // ---------- Render first (so DOM is created by render functions) ----------
//     if(!blend){
//       populateStats({});
//       if(activeMode === 'overview') renderOverview({ bunkers: [] }, window.COAL_DB || []);
//       else renderSingle(activeIndex || 0, { bunkers: [] }, window.COAL_DB || []);
//       // dispatch rendered early so listeners that expect post-render can run
//       try { window.dispatchEvent(new CustomEvent('blend:rendered', { detail: { blend: null } })); } catch(e){}
//       // still continue so timers clear below
//     } else {
//       // render using the obtained blend
//       if(activeMode === 'overview') renderOverview(blend, window.COAL_DB || []);
//       else renderSingle(activeIndex || 0, blend, window.COAL_DB || []);
//     }

//     // --- Now notify listeners about the blend & flows (they can now update DOM) ---
//     try {
//       window.dispatchEvent(new CustomEvent('blend:updated', { detail: { blend } }));
//       window.dispatchEvent(new CustomEvent('flows:update', { detail: { flows: flowsForUI } }));
//       window.dispatchEvent(new CustomEvent('nextBlend:updated', { detail: { blend } }));
//       const binderState = (window.nextBlendBinder && window.nextBlendBinder.state) ? window.nextBlendBinder.state : [];
//       window.dispatchEvent(new CustomEvent('nextBlend:state', { detail: { state: binderState } }));
//     } catch(e){ console.warn('event dispatch failed', e); }

//     // ---------- Timer sync: start after a small tick so handlers can update DOM first ----------
//     // helper functions (same as previously used)
//     function parseHMSString(s){
//       if(!s) return null;
//       try {
//         const parts = String(s).trim().split(':').map(p => parseInt(p,10));
//         if(parts.length === 3) return (parts[0]||0)*3600 + (parts[1]||0)*60 + (parts[2]||0);
//         if(parts.length === 2) return (parts[0]||0)*60 + (parts[1]||0);
//         if(parts.length === 1) return parts[0]||0;
//       } catch(e){}
//       return null;
//     }
//     function getBlendCreatedAtMs(b){
//       try {
//         if(!b) return null;
//         if(typeof b.createdAt === 'number') return b.createdAt;
//         if(typeof b.createdAt === 'string') {
//           const d = new Date(b.createdAt);
//           if(!isNaN(d)) return d.getTime();
//         }
//         if(b.createdAt && b.createdAt.$date){
//           if(typeof b.createdAt.$date === 'object' && b.createdAt.$date.$numberLong){
//             return Number(b.createdAt.$date.$numberLong);
//           }
//           if(typeof b.createdAt.$date === 'string'){
//             const d = new Date(b.createdAt.$date); if(!isNaN(d)) return d.getTime();
//           }
//         }
//         if(b.createdAt && b.createdAt.$numberLong) return Number(b.createdAt.$numberLong);
//       } catch(e){}
//       return null;
//     }
//     function buildRemainingMsArrayForBlend(b){
//       const box = 8;
//       const now = Date.now();
//       const createdAtMs = getBlendCreatedAtMs(b) || now;
//       const elapsed = Math.max(0, now - createdAtMs);
//       const results = new Array(box).fill(null);
//       try {
//         if(!b || !Array.isArray(b.bunkers)) return results;
//         for(let i=0;i<box;i++){
//           const bunker = b.bunkers[i];
//           if(!bunker || !Array.isArray(bunker.layers) || bunker.layers.length === 0){ results[i] = null; continue; }
//           const layer = bunker.layers[0];
//           const tstr = layer && layer.timer ? layer.timer : (layer && layer.remaining ? layer.remaining : null);
//           const secs = parseHMSString(tstr);
//           if(secs === null){ results[i] = null; continue; }
//           const remainMs = Math.max(0, secs*1000 - elapsed);
//           results[i] = remainMs;
//         }
//       } catch(e){ /* swallow */ }
//       return results;
//     }
//     function findTimerElementForBunker(index){
//       try {
//         const selectors = [
//           `#bunker-${index} .timer`,
//           `#bunker-${index} .bunker-timer`,
//           `.bunker[data-index="${index}"] .timer`,
//           `.bunker[data-index="${index}"] .bunker-timer`,
//           `.bunker-timer[data-index="${index}"]`,
//           `.bunker .timer:nth-of-type(${index+1})`,
//           `.bunker-timer:nth-of-type(${index+1})`,
//           '.bunker .timer',
//           '.bunker-timer'
//         ];
//         for(const sel of selectors){
//           const el = document.querySelector(sel);
//           if(el) return el;
//         }
//         const byClass = document.querySelectorAll('.bunker .timer');
//         if(byClass && byClass.length > index) return byClass[index];
//         const bySimple = document.querySelectorAll('.bunker-timer');
//         if(bySimple && bySimple.length > index) return bySimple[index];
//       } catch(e){}
//       return null;
//     }
//     function formatMsToHMS(ms){
//       if(ms === null || typeof ms === 'undefined') return '--:--:--';
//       const t = Math.max(0, Math.floor(ms/1000));
//       const h = Math.floor(t/3600); const m = Math.floor((t%3600)/60); const s = t%60;
//       return (String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0'));
//     }

//     // start timer sync after a micro delay so event listeners and render changes are applied
//     setTimeout(() => {
//       try {
//         const newRemaining = buildRemainingMsArrayForBlend(blend);
//         window.__unit_timer_values = newRemaining.slice();

//         // clear old interval if present
//         try { if(window.__unit_timer_interval){ clearInterval(window.__unit_timer_interval); window.__unit_timer_interval = null; } } catch(e){}

//         // immediate render into DOM (post-render)
//         for(let i=0;i<newRemaining.length;i++){
//           const el = findTimerElementForBunker(i);
//           if(el){
//             el.textContent = formatMsToHMS(newRemaining[i]);
//             try { el.dataset.remainingMs = newRemaining[i] !== null ? String(newRemaining[i]) : ''; } catch(e){}
//           }
//         }

//         // single ticking interval
//         window.__unit_timer_interval = setInterval(() => {
//           try {
//             for(let i=0;i<window.__unit_timer_values.length;i++){
//               const v = window.__unit_timer_values[i];
//               if(typeof v === 'number' && v > 0){
//                 window.__unit_timer_values[i] = Math.max(0, v - 1000);
//               } else {
//                 window.__unit_timer_values[i] = (typeof v === 'number') ? 0 : null;
//               }
//               const el = findTimerElementForBunker(i);
//               if(el){
//                 el.textContent = formatMsToHMS(window.__unit_timer_values[i]);
//                 try { el.dataset.remainingMs = window.__unit_timer_values[i] !== null ? String(window.__unit_timer_values[i]) : ''; } catch(e){}
//               }
//             }
//             try { window.dispatchEvent(new CustomEvent('timers:tick', { detail: { values: window.__unit_timer_values.slice() } })); } catch(e){}
//           } catch(e){ console.warn('unit timer interval tick failed', e); }
//         }, 1000);

//       } catch(e){ console.warn('timer sync failed', e); }
//     }, 0);

//     // ---------- compute derived metrics and populate stats (unchanged) ----------
//     try{
//       const derived = computeDerivedMetrics(blend, window.COAL_DB || []);
//       const metrics = {
//         generation: (blend.generation !== undefined ? blend.generation : null),
//         totalFlow: (derived.totalFlow !== null ? derived.totalFlow : (blend.totalFlow !== undefined ? blend.totalFlow : null)),
//         avgGCV: (derived.avgGCV !== null ? derived.avgGCV : (blend.avgGCV !== undefined ? blend.avgGCV : null)),
//         avgAFT: (blend.avgAFT !== undefined ? blend.avgAFT : null),
//         heatRate: (derived.heatRate !== null ? derived.heatRate : (blend.heatRate !== undefined ? blend.heatRate : null)),
//         costRate: (blend.costRate !== undefined ? blend.costRate : null)
//       };
//       populateStats(metrics);
//     } catch(e){
//       populateStats({
//         generation: blend.generation,
//         totalFlow: blend.totalFlow,
//         avgGCV: blend.avgGCV,
//         avgAFT: blend.avgAFT,
//         heatRate: blend.heatRate,
//         costRate: blend.costRate
//       });
//     }

//     // Final rendered hook
//     try { window.dispatchEvent(new CustomEvent('blend:rendered', { detail: { blend } })); } catch(e){}
//   } finally {
//     // release re-entrancy guard
//     window.__refresh_in_progress = false;
//   }
// }




// /* ---------- sidebar behaviour ---------- */
// function setActiveTab(mode, index){
//   document.querySelectorAll('.sidebar .item').forEach(it => it.classList.remove('active'));
//   if(mode === 'overview'){
//     const ov = document.getElementById('tab-overview');
//     if(ov) ov.classList.add('active');
//   } else {
//     const sel = Array.from(document.querySelectorAll('.sidebar .item')).find(el => el.dataset.mode === 'bunker' && Number(el.dataset.index) === index);
//     if(sel) sel.classList.add('active');
//   }
// }




// /* ---------- init and wiring ---------- */
// document.addEventListener('DOMContentLoaded', () => {
//   // expose tooltip functions for inline handlers
//   window.showCoalRectTooltip = showCoalRectTooltip;
//   window.moveCoalRectTooltip = moveCoalRectTooltip;
//   window.hideCoalRectTooltip = hideCoalRectTooltip;

//   // Initialize unit buttons if present: wire them up and set persisted active state
//   const unitBtns = Array.from(document.querySelectorAll('.unit-btn'));
//   if(unitBtns && unitBtns.length){
//     unitBtns.forEach((btn, idx) => {
//       const u = Number(btn.dataset.unit || (idx + 1));
//       btn.dataset.unit = String(u);
//       btn.addEventListener('click', async () => {
//         setActiveUnit(u);
//         // refresh current tab for selected unit
//         const active = document.querySelector('.sidebar .item.active');
//         const mode = active ? active.dataset.mode : 'overview';
//         const idx = active && active.dataset.index ? Number(active.dataset.index) : 0;
//         await refreshAndRender(mode, idx, u);
//       });
//     });
//     // apply persisted active unit UI state
//     setActiveUnit(window.DASHBOARD_ACTIVE_UNIT || 1);
//   }

//   // sidebar click handlers (bunker tabs)
//   document.querySelectorAll('.sidebar .item').forEach(it => {
//     it.addEventListener('click', async (e) => {
//       const mode = it.dataset.mode;
//       const idx = (typeof it.dataset.index !== 'undefined') ? Number(it.dataset.index) : null;
//       setActiveTab(mode, idx);
//       // render functions themselves toggle single-mode class, so just call refresh
//       await refreshAndRender(mode, idx || 0, window.DASHBOARD_ACTIVE_UNIT || 1);
//     });
//   });

//   // refresh button reloads page
//   const refreshBtn = document.getElementById('refreshBtn');
//   if(refreshBtn) refreshBtn.addEventListener('click', () => location.reload());

//   // ensure we start without single-mode
//   try { document.body.classList.remove('single-mode'); } catch(e) {}

//   // initial render: overview active by default, use persisted unit
//   setActiveTab('overview', null);
//   refreshAndRender('overview', 0, window.DASHBOARD_ACTIVE_UNIT || 1).catch(e => console.error(e));

//   // keep summary updated when flows or blends or next-blend timers change
//   window.addEventListener('flows:update', function(){ recomputeAndPopulate(); }, false);
//   window.addEventListener('blend:updated', function(){ 
//     // ensure we refresh stored LATEST_BLEND if other code updates it, then recompute
//     try{ recomputeAndPopulate(); }catch(e){}
//   }, false);
//   window.addEventListener('nextBlend:updated', function(){ recomputeAndPopulate(); }, false);

//   // periodic short tick to catch internal binder state changes (e.g. nextBlendBinder idx advancement)
//   window.__derivedMetrics_recompute_timer = setInterval(recomputeAndPopulate, 1000);

//   // optional periodic update to re-fetch (kept but can be removed)
//   // setInterval(() => {
//   //   const active = document.querySelector('.sidebar .item.active');
//   //   const mode = active ? active.dataset.mode : 'overview';
//   //   const idx = active && active.dataset.index ? Number(active.dataset.index) : 0;
//   //   refreshAndRender(mode, idx).catch(e => console.error(e));
//   // }, 12000);
// });
