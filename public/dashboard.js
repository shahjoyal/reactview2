// // dashboard.js (sidebar + overview + single-bunker view) — unit-aware version
// const API_BASE = window.location.origin + '/api';

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

// add this helper near renderBunkerIntoSVG (or anywhere above renderSingle)
function synthesizeLayersForBunker(blend, bunkerIndex) {
  // Returns an array of layer-like objects: { coal, percent, gcv, cost, rowIndex, color }
  // Heuristics:
  //  - if blend.rows exists and rows have per-bunker data, extract entries for this bunker
  //  - if rows have 'bunker' numeric field, take rows where bunker == bunkerIndex
  //  - otherwise try rows[].bunkers[idx] or rows[].perBunker map
  //  - normalize numeric values using safeNum and fallback to percent-like assumptions
  const out = [];
  try {
    if (!blend || typeof blend !== 'object') return out;
    const rows = Array.isArray(blend.rows) ? blend.rows : [];

    // quick path: rows that explicitly reference this bunker by numeric field
    const explicit = rows.filter(r => r && (Number.isFinite(safeNum(r.bunker)) || Number.isFinite(safeNum(r.bunkerIndex))));
    if (explicit.length) {
      explicit.forEach((r, i) => {
        const bVal = safeNum(r.bunker) ?? safeNum(r.bunkerIndex);
        // accept 0-based or 1-based bunker markers
        if (bVal === bunkerIndex || bVal === (bunkerIndex + 1)) {
          const coal = r.coal || r.coalName || r.name || r.code || '';
          const pct = safeNum(r.percent) ?? safeNum(r.pct) ?? safeNum(r.qty) ?? null;
          const gcv = safeNum(r.gcv) ?? null;
          const cost = safeNum(r.cost) ?? null;
          out.push({ coal, percent: pct || 0, gcv, cost, rowIndex: (typeof r.rowIndex !== 'undefined' ? r.rowIndex : i), color: r.color || null });
        }
      });
      if (out.length) return out;
    }

    // rows where each row contains a 'bunkers' array -> use row.bunkers[idx]
    const rowsWithBunkersArray = rows.filter(r => Array.isArray(r.bunkers) && r.bunkers.length > bunkerIndex);
    if (rowsWithBunkersArray.length) {
      rowsWithBunkersArray.forEach((r, i) => {
        const bucket = r.bunkers[bunkerIndex];
        let pct = null, gcv = null, cost = null;
        if (bucket != null) {
          if (typeof bucket === 'number') pct = safeNum(bucket);
          else if (typeof bucket === 'object') {
            pct = safeNum(bucket.percent) ?? safeNum(bucket.qty) ?? safeNum(bucket.amount) ?? safeNum(bucket.value);
            gcv = safeNum(bucket.gcv) ?? null;
            cost = safeNum(bucket.cost) ?? null;
          }
        }
        const coal = r.coal || r.coalName || r.name || '';
        out.push({ coal, percent: pct || 0, gcv, cost, rowIndex: (typeof r.rowIndex !== 'undefined' ? r.rowIndex : i), color: r.color || null });
      });
      if (out.length) return out;
    }

    // rows that have a perBunker/perMill map keyed by index
    const rowsWithPerMaps = rows.filter(r => r && (r.perBunker || r.perMill || r.perUnit || r.allocations));
    if (rowsWithPerMaps.length) {
      rowsWithPerMaps.forEach((r, i) => {
        const m = r.perBunker || r.perMill || r.perUnit || r.allocations || {};
        const val = (m && (m[String(bunkerIndex)] ?? m[String(bunkerIndex+1)] ?? m[bunkerIndex] ?? m[bunkerIndex+1])) ?? null;
        const pct = safeNum(val);
        const coal = r.coal || r.coalName || r.name || '';
        const gcv = safeNum(r.gcv) ?? null;
        const cost = safeNum(r.cost) ?? null;
        out.push({ coal, percent: pct || 0, gcv, cost, rowIndex: (typeof r.rowIndex !== 'undefined' ? r.rowIndex : i), color: r.color || null });
      });
      if (out.length) return out;
    }

    // fallback: if rows have numeric qty/amount/value fields, try to normalize by bunker capacity if available
    const numericRows = rows.filter(r => r && (Number.isFinite(safeNum(r.qty)) || Number.isFinite(safeNum(r.amount)) || Number.isFinite(safeNum(r.value)) || Number.isFinite(safeNum(r.percent))));
    if (numericRows.length) {
      const capArr = Array.isArray(blend.bunkerCapacities) ? blend.bunkerCapacities : null;
      const defaultCap = safeNum(blend.bunkerCapacity) || null;
      numericRows.forEach((r, i) => {
        const qty = safeNum(r.qty) ?? safeNum(r.amount) ?? safeNum(r.value) ?? safeNum(r.percent) ?? null;
        let pct = qty;
        const cap = (capArr && typeof capArr[bunkerIndex] !== 'undefined') ? safeNum(capArr[bunkerIndex]) : defaultCap;
        if (cap && qty != null) {
          // if qty seems like weight and cap present, compute percent
          pct = (Number(qty) / Number(cap)) * 100;
        }
        const coal = r.coal || r.coalName || r.name || '';
        const gcv = safeNum(r.gcv) ?? null;
        const cost = safeNum(r.cost) ?? null;
        out.push({ coal, percent: pct || 0, gcv, cost, rowIndex: (typeof r.rowIndex !== 'undefined' ? r.rowIndex : i), color: r.color || null });
      });
      // filter zero
      const filtered = out.filter(o => safeNum(o.percent) && safeNum(o.percent) > 0);
      if (filtered.length) return filtered;
    }
  } catch (e) {
    // ignore errors but return whatever we built
  }
  return out;
}

// replace your existing renderSingle with this function
function renderSingle(bunkerIndex, blend, coalDB){
  try { document.body.classList.add('single-mode'); } catch(e) { /* ignore */ }

  const singleSvg = document.getElementById('singleSvg');
  const singleLabel = document.getElementById('singleLabel');

  // attempt to use the provided blend.bunkers entry
  let bdata = (Array.isArray(blend && blend.bunkers) && blend.bunkers[bunkerIndex]) ? blend.bunkers[bunkerIndex] : { layers: [] };

  // if layers empty, try to synthesize them from blend.rows or related fields
  if (!(Array.isArray(bdata.layers) && bdata.layers.length)) {
    const synth = synthesizeLayersForBunker(blend || (window.SNAPSHOT_NORMALIZED || window.LATEST_BLEND || window.SNAPSHOT || {}), bunkerIndex);
    if (synth && synth.length) {
      // convert synthesized objects into the expected layer shape
      bdata = { layers: synth.map((s, i) => ({
        coal: s.coal || '',
        percent: (typeof s.percent !== 'undefined' && s.percent !== null) ? s.percent : 0,
        gcv: (typeof s.gcv !== 'undefined' ? s.gcv : null),
        cost: (typeof s.cost !== 'undefined' ? s.cost : null),
        rowIndex: (typeof s.rowIndex !== 'undefined' ? s.rowIndex : (i)),
        color: (typeof s.color !== 'undefined' ? s.color : null)
      }))};
    }
  }

  // ensure svg has unique id
  if(singleSvg && !singleSvg.id) singleSvg.id = `single_svg_${bunkerIndex}_${Math.random().toString(36).slice(2)}`;

  // Call the existing renderer (it expects bunkerData.layers array)
  try {
    renderBunkerIntoSVG(singleSvg, bdata, coalDB, bunkerIndex, true, 1.6);
  } catch (e) {
    // if renderer throws, fallback to writing a simple placeholder (keeps UI visible)
    try {
      if (singleSvg) singleSvg.innerHTML = '<text x="50" y="75" text-anchor="middle" fill="#666">Render failed</text>';
    } catch (ee) {}
  }

  if(singleLabel) singleLabel.textContent = `Bunker ${bunkerIndex + 1}`;

  // show single and hide overview
  const ov = document.getElementById('overviewView');
  const singleView = document.getElementById('singleView');
  if(ov) ov.style.display = 'none';
  if(singleView) singleView.style.display = '';

  // overlay arrow logic stays the same
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

function renderSingle(bunkerIndex, blend, coalDB){
  try { document.body.classList.add('single-mode'); } catch(e) {}

  const singleSvg = document.getElementById('singleSvg');
  const singleLabel = document.getElementById('singleLabel');

  // ✅ Prefer snapshot.clientBunkers or snapshot.bunkerTimers if available
  let bdata =
    (blend && blend.doc && blend.doc.snapshot && Array.isArray(blend.doc.snapshot.clientBunkers) && blend.doc.snapshot.clientBunkers[bunkerIndex]) ||
    (blend && blend.doc && blend.doc.snapshot && Array.isArray(blend.doc.snapshot.bunkerTimers) && blend.doc.snapshot.bunkerTimers[bunkerIndex]) ||
    (Array.isArray(blend.bunkers) && blend.bunkers[bunkerIndex]) ||
    { layers: [] };

  // ensure SVG id
  if (singleSvg && !singleSvg.id)
    singleSvg.id = `single_svg_${bunkerIndex}_${Math.random().toString(36).slice(2)}`;

  // render to SVG using your existing renderer
  renderBunkerIntoSVG(singleSvg, bdata, coalDB, bunkerIndex, true, 1.6);

  if (singleLabel) singleLabel.textContent = `Bunker ${bunkerIndex + 1}`;

  // show/hide views
  const ov = document.getElementById('overviewView');
  const singleView = document.getElementById('singleView');
  if (ov) ov.style.display = 'none';
  if (singleView) singleView.style.display = '';

  // top overlay arrow logic (unchanged)
  const topOverlay = document.getElementById('topOverlay');
  if (topOverlay){
    topOverlay.style.display = '';
    const arrows = topOverlay.querySelectorAll('.arrow');
    arrows.forEach(a => a.style.display = 'none');
    let singleArrow = topOverlay.querySelector('.arrow.single');
    if (!singleArrow){
      singleArrow = document.createElement('div');
      singleArrow.className = 'arrow single';
      topOverlay.appendChild(singleArrow);
    }
    singleArrow.style.left = '50%';
    singleArrow.style.display = '';
  }
}


