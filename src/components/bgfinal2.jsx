// src/components/BunkersGrid.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";

/*
  Self-contained BunkersGrid for when dashboard.js is NOT present.
  - Renders V-shaped bunker SVGs (no horizontal connector).
  - Implements local binder (bottom-first sequencing) and exposes window.nextBlendBinder.
  - Creates tooltip DOM (#coalTooltip) and handles hover.
  - Uses layer.color / layer.coalDoc.color or hashed palette fallback.
  - Drain animation updates rect heights every tick (1s tick + small smoothing).
*/

function secondsToHHMMSS(secondsRaw) {
  if (!isFinite(secondsRaw) || secondsRaw === null) return "--";
  const s = Math.max(0, Math.round(secondsRaw));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
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

/* tooltip helpers (component will create #coalTooltip in document.body) */
function showTooltipHtml(html, pageX, pageY) {
  const t = document.getElementById("coalTooltip");
  if (!t) return;
  t.innerHTML = html;
  t.style.display = "block";
  t.style.left = pageX + 10 + "px";
  t.style.top = pageY + 10 + "px";
}
function moveTooltip(pageX, pageY) {
  const t = document.getElementById("coalTooltip");
  if (!t) return;
  t.style.left = pageX + 10 + "px";
  t.style.top = pageY + 10 + "px";
}
function hideTooltip() {
  const t = document.getElementById("coalTooltip");
  if (!t) return;
  t.style.display = "none";
  t.innerHTML = "";
}
function tooltipHtmlForLayer(L) {
  const name = L.coal || (L.coalDoc && L.coalDoc.coal) || "--";
  const pct = (L.percent != null) ? (Number(L.percent).toFixed(3) + "%") : "--";
  const gcv = L.gcv != null ? L.gcv : (L.coalDoc && L.coalDoc.gcv ? L.coalDoc.gcv : "--");
  const cost = L.cost != null ? L.cost : (L.coalDoc && L.coalDoc.cost ? L.coalDoc.cost : "--");
  const aft = L.coalDoc ? Math.round(calcAFT(L.coalDoc)) : "--";
  return `<div style="font-weight:700;margin-bottom:6px">${name}</div>
          <div style="font-size:12px">Percent: ${pct}</div>
          <div style="font-size:12px">GCV: ${gcv}</div>
          <div style="font-size:12px">Cost: ${cost}</div>
          <div style="font-size:12px">AFT: ${aft}</div>`;
}

/* small palette generator fallback */
function colorFromString(s) {
  if (!s) return "#C0C0C0";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  const hue = Math.abs(h) % 360;
  // HSL to hex quick convert (pastel-ish)
  const l = 55; const sPerc = 60;
  return `hsl(${hue} ${sPerc}% ${l}%)`;
}

export default function BunkersGrid({ blend = {}, coalDB = [], onOpenSingle = () => {} }) {
  const NUM = 8;
  const snapshot = (typeof window !== "undefined" && window.SNAPSHOT_NORMALIZED) ? window.SNAPSHOT_NORMALIZED : null;

  // clientBunkers fallback: snapshot.clientBunkers -> snapshot.bunkers -> blend.bunkers -> empty
  const clientBunkers = useMemo(() => {
    if (snapshot && Array.isArray(snapshot.clientBunkers) && snapshot.clientBunkers.length === NUM) return snapshot.clientBunkers;
    if (snapshot && Array.isArray(snapshot.bunkers) && snapshot.bunkers.length === NUM) return snapshot.bunkers;
    if (Array.isArray(blend.bunkers) && blend.bunkers.length === NUM) return blend.bunkers;
    return Array.from({ length: NUM }).map(() => ({ layers: [] }));
  }, [snapshot, blend]);

  // flows fallback
  const flows = useMemo(() => {
    if (Array.isArray(blend.flows) && blend.flows.length === NUM) return blend.flows;
    if (snapshot && Array.isArray(snapshot.flows) && snapshot.flows.length === NUM) return snapshot.flows;
    return Array(NUM).fill(0);
  }, [blend, snapshot]);

  // Build per-bunker sequences (seconds per layer) and initial remaining state.
  // Priorities:
  //  - Use explicit layer.initialSeconds or layer.remainingSeconds if present.
  //  - Else estimate duration proportionally from percent (sensible fallback: assume total per-bunker window = 8 hours).
  const DEFAULT_BUNKER_TOTAL_SECONDS = (blend && blend.defaultBunkerTotalHours) ? (blend.defaultBunkerTotalHours * 3600) : 8 * 3600;

  const binderRef = useRef(null); // { sequences: [ [s1, s2 ...], ... ], activeIdx: [], remaining: [] }

  useEffect(() => {
    // build binder data fresh whenever clientBunkers or flows change
    const sequences = Array(NUM).fill(null).map(() => []);
    const activeIdx = Array(NUM).fill(0);
    const remaining = Array(NUM).fill(null);

    for (let b = 0; b < NUM; b++) {
      const layers = (clientBunkers[b] && Array.isArray(clientBunkers[b].layers)) ? clientBunkers[b].layers : [];
      // compute sumPercent (if present) to proportionally estimate durations
      let sumPct = 0;
      for (let li = 0; li < layers.length; li++) {
        const L = layers[li];
        const pct = (L && (L.percent != null)) ? Number(L.percent) : 0;
        sumPct += pct;
      }
      // if sumPct === 0, we'll fallback to equal fractions
      let totalSec = DEFAULT_BUNKER_TOTAL_SECONDS;
      // if blend provides a per-bunker duration (e.g. estimatedDurationSecondsPerBunker) use that
      if (blend && blend.estimatedDurationSecondsPerBunker && Number.isFinite(blend.estimatedDurationSecondsPerBunker)) {
        totalSec = Number(blend.estimatedDurationSecondsPerBunker);
      }

      // Build sequence bottom-first. Assumption: layers[0] is bottom, last is top.
      for (let li = 0; li < layers.length; li++) {
        const L = layers[li] || {};
        // priority for explicit durations
        let secs = null;
        if (L.initialSeconds != null && isFinite(Number(L.initialSeconds))) secs = Number(L.initialSeconds);
        else if (L.remainingSeconds != null && isFinite(Number(L.remainingSeconds))) {
          // if remaining provided but no initial, treat initial = remaining
          secs = Number(L.remainingSeconds);
        } else if (L.estimatedSeconds != null && isFinite(Number(L.estimatedSeconds))) secs = Number(L.estimatedSeconds);

        // fallback: estimate by percent out of totalSec
        if (secs == null) {
          if (sumPct > 0 && Number(L.percent) > 0) {
            secs = (Number(L.percent) / sumPct) * totalSec;
          } else {
            // equal split across layers if no percents
            secs = totalSec / Math.max(1, layers.length);
          }
        }
        sequences[b].push(Math.max(0, Math.round(secs)));
      }

      // set initial remaining: prefer layer.remainingSeconds for bottom layer, else sequences[0]
      if (sequences[b].length) {
        const bottomLayer = layers[0] || {};
        if (bottomLayer && bottomLayer.remainingSeconds != null && isFinite(Number(bottomLayer.remainingSeconds))) {
          remaining[b] = Number(bottomLayer.remainingSeconds);
        } else {
          remaining[b] = sequences[b][0];
        }
        activeIdx[b] = 0;
      } else {
        remaining[b] = null;
        activeIdx[b] = -1;
      }
    }

    binderRef.current = { sequences, activeIdx, remaining };
    // expose binder on window for other components if desired
    if (typeof window !== "undefined") window.nextBlendBinder = {
      sequences: sequences,
      activeIdx: activeIdx,
      remaining: remaining,
      getActiveLayer: (b) => {
        const bun = clientBunkers[b];
        if (!bun || !Array.isArray(bun.layers)) return null;
        const ai = activeIdx[b];
        return (ai >= 0 && bun.layers[ai]) ? bun.layers[ai] : null;
      }
    };

    // emit initial event
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nextBlend:updated", { detail: { sequences, activeIdx, remaining } }));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientBunkers, blend]);

  // local timer tick: decrement the current active layer remaining for each bunker bottom-first,
  // advance activeIdx when remaining hits 0.
  useEffect(() => {
    let mounted = true;
    const id = setInterval(() => {
      if (!mounted) return;
      const binder = binderRef.current;
      if (!binder) return;
      let changed = false;
      for (let b = 0; b < NUM; b++) {
        const ai = binder.activeIdx[b];
        if (ai == null || ai < 0) continue;
        if (binder.remaining[b] == null) continue;
        if (binder.remaining[b] > 0) {
          binder.remaining[b] = Math.max(0, binder.remaining[b] - 1);
          changed = true;
        } else {
          // already 0 => advance if possible
          if (ai < binder.sequences[b].length - 1) {
            binder.activeIdx[b] = ai + 1;
            binder.remaining[b] = binder.sequences[b][ai + 1];
            changed = true;
          } else {
            // finished - nothing to do further
          }
        }
      }
      if (changed) {
        // update exposed window object & emit event
        if (typeof window !== "undefined" && window.nextBlendBinder) {
          window.nextBlendBinder.sequences = binder.sequences.slice();
          window.nextBlendBinder.activeIdx = binder.activeIdx.slice();
          window.nextBlendBinder.remaining = binder.remaining.slice();
        }
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nextBlend:updated", { detail: { sequences: binder.sequences.slice(), activeIdx: binder.activeIdx.slice(), remaining: binder.remaining.slice() } }));
        // we don't call setState here because rendering is driven by requestAnimationFrame/DOM updates later
      }
    }, 1000);
    return () => { mounted = false; clearInterval(id); };
  }, [clientBunkers]);

  // small state to force React re-render occasionally so labels / timer text update (every 1s)
  const [, tickRerender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tickRerender(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // create tooltip element once
  useEffect(() => {
    if (typeof document === "undefined") return;
    let created = false;
    let tEl = document.getElementById("coalTooltip");
    if (!tEl) {
      tEl = document.createElement("div");
      tEl.id = "coalTooltip";
      tEl.style.position = "fixed";
      tEl.style.display = "none";
      tEl.style.pointerEvents = "none";
      tEl.style.background = "rgba(255,255,255,0.98)";
      tEl.style.color = "#000";
      tEl.style.padding = "8px 10px";
      tEl.style.borderRadius = "6px";
      tEl.style.boxShadow = "0 6px 18px rgba(0,0,0,0.12)";
      tEl.style.fontSize = "12px";
      tEl.style.zIndex = 99999;
      tEl.style.maxWidth = "260px";
      tEl.style.lineHeight = "1.25";
      tEl.style.border = "1px solid rgba(0,0,0,0.06)";
      document.body.appendChild(tEl);
      created = true;
    }
    // register lightweight window helpers for compatibility
    try {
      window.showCoalRectTooltip = function(ev, rowIndex, millIndex, layerData) {
        try {
          const pageX = ev && ev.pageX ? ev.pageX : (ev && ev.clientX ? ev.clientX + window.scrollX : 0);
          const pageY = ev && ev.pageY ? ev.pageY : (ev && ev.clientY ? ev.clientY + window.scrollY : 0);
          if (layerData) showTooltipHtml(tooltipHtmlForLayer(layerData), pageX, pageY);
        } catch (e) {}
      };
      window.moveCoalRectTooltip = function(ev) {
        try {
          const pageX = ev && ev.pageX ? ev.pageX : (ev && ev.clientX ? ev.clientX + window.scrollX : 0);
          const pageY = ev && ev.pageY ? ev.pageY : (ev && ev.clientY ? ev.clientY + window.scrollY : 0);
          moveTooltip(pageX, pageY);
        } catch (e) {}
      };
      window.hideCoalRectTooltip = function() { try { hideTooltip(); } catch (e) {} };
    } catch (e) {}

    return () => {
      if (created && tEl && tEl.parentNode) tEl.parentNode.removeChild(tEl);
      // don't remove window helpers to avoid breaking external scripts that might expect them
    };
  }, []);

  // render & DOM-sync: we will draw layers (rects) for each bunker inside an SVG, using a clipPath for the V-shaped bunker.
  // We'll also update the top active layer height according to binder remaining fraction (drain effect).
  useEffect(() => {
    // For each bunker, render its SVG contents (outline + rects)
    for (let b = 0; b < NUM; b++) {
      const container = document.querySelector(`.bunker[data-bunker="${b}"]`);
      if (!container) continue;
      const svg = container.querySelector("svg");
      if (!svg) continue;
      // clear existing content
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      const ns = "http://www.w3.org/2000/svg";
      svg.setAttribute("viewBox", "0 0 100 150");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

      // define clipPath for V-shaped bunker
      const defs = document.createElementNS(ns, "defs");
      const clipPath = document.createElementNS(ns, "clipPath");
      const clipId = `bunkerClip-${b}`;
      clipPath.setAttribute("id", clipId);

      // path (no horizontal connector): left wall down to V apex to right wall up
      const path = document.createElementNS(ns, "path");
      // coordinates chosen within 0..100 x 0..150
      // top left (15,12) down to (15,110) -> V (50,138) -> (85,110) up to (85,12)
      const d = `M15 12 L15 110 L50 138 L85 110 L85 12 Z`;
      path.setAttribute("d", d);
      clipPath.appendChild(path);
      defs.appendChild(clipPath);

      // also draw the outline stroke (so bunker shape is visible)
      const outline = document.createElementNS(ns, "path");
      outline.setAttribute("d", d);
      outline.setAttribute("fill", "none");
      outline.setAttribute("stroke", "rgba(0,0,0,0.12)");
      outline.setAttribute("stroke-width", "1.5");
      svg.appendChild(defs);
      svg.appendChild(outline);

      // compute the available fill box: bounding box of path roughly x:[15,85] y:[12,138]
      // We'll map fill area topY = 12, bottomY = 110 (keep some margin inside apex)
      const fillTop = 18; // top inside
      const fillBottom = 110; // bottom inside just above the V apex
      const fillLeft = 16;
      const fillRight = 84;
      const fillWidth = fillRight - fillLeft;
      const fillHeight = fillBottom - fillTop;

      const layers = (clientBunkers[b] && Array.isArray(clientBunkers[b].layers)) ? clientBunkers[b].layers : [];
      // compute normalized flex values (like earlier): use percent if sum > 0 else equal
      const sumPct = layers.reduce((s,L)=> s + (Number(L && L.percent)||0), 0);
      const flexVals = layers.map(L => {
        const raw = Number(L && L.percent) || 0;
        if (sumPct > 0) return raw / sumPct;
        return 1 / Math.max(1, layers.length);
      });

      // cumulative stacking bottom-up. layers[0] is bottom.
      let yCursor = fillBottom;
      for (let li = 0; li < layers.length; li++) {
        const L = layers[li] || {};
        const frac = (flexVals && typeof flexVals[li] === "number") ? flexVals[li] : (1 / Math.max(1,layers.length));
        const layerH = Math.max(1, frac * fillHeight);
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", String(fillLeft));
        // rectangle y anchored from top, so compute y = yCursor - layerH
        const y = yCursor - layerH;
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(fillWidth));
        rect.setAttribute("height", String(layerH));
        // color selection: prefer layer.color -> layer.coalDoc.color -> palette from coal name -> fallback gray
        const col = (L && (L.color || (L.coalDoc && (L.coalDoc.color || L.coalDoc.colour)))) ||
                    (L && L.coal ? colorFromString(L.coal) : null) ||
                    "#C0C0C0";
        rect.setAttribute("fill", col);
        rect.setAttribute("opacity", "0.95");
        rect.setAttribute("data-layer-index", String(li));
        rect.setAttribute("data-bunker-index", String(b));
        rect.setAttribute("class", "bunker-layer-rect");
        // attach tooltip handlers for this rect: show details for this layer
        rect.addEventListener("mouseenter", (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          showTooltipHtml(tooltipHtmlForLayer(L), ev.pageX || (ev.clientX + window.scrollX), ev.pageY || (ev.clientY + window.scrollY));
        });
        rect.addEventListener("mousemove", (ev) => {
          moveTooltip(ev.pageX || (ev.clientX + window.scrollX), ev.pageY || (ev.clientY + window.scrollY));
        });
        rect.addEventListener("mouseleave", (ev) => {
          hideTooltip();
        });
        // clip to bunker shape
        rect.setAttribute("clip-path", `url(#${clipId})`);

        // store logical metadata on element for runtime drain adjustment
        rect.dataset.origHeight = String(layerH);
        rect.dataset.origY = String(y);
        rect.dataset.layerIdx = String(li);

        svg.appendChild(rect);
        yCursor = y; // next layer sits above
      }

      // store attributes on the SVG or container for later manipulation (drain animation)
      svg.dataset.fillTop = String(fillTop);
      svg.dataset.fillBottom = String(fillBottom);
      svg.dataset.fillHeight = String(fillHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientBunkers, tickRerender]);

  // drain animation loop: every tick (250ms) adjust top active layer's rect height using binderRef
  useEffect(() => {
    let alive = true;
    const tickMs = 200;

    function doTick() {
      if (!alive) return;
      const binder = binderRef.current;
      if (!binder) {
        if (alive) setTimeout(doTick, tickMs);
        return;
      }
      for (let b = 0; b < NUM; b++) {
        const container = document.querySelector(`.bunker[data-bunker="${b}"]`);
        if (!container) continue;
        const svg = container.querySelector("svg");
        if (!svg) continue;
        const rects = Array.from(svg.querySelectorAll("rect.bunker-layer-rect"));
        if (!rects.length) continue;
        // top-most visual layer is last appended (li increasing). But active draining layer is binder.activeIdx[b]
        const activeIdx = binder.activeIdx[b];
        if (activeIdx == null || activeIdx < 0 || activeIdx >= rects.length) {
          // no active, fade none
          continue;
        }
        // find rect corresponding to activeIdx
        let targetRect = null;
        for (const r of rects) {
          if (String(r.dataset.layerIdx) === String(activeIdx)) { targetRect = r; break; }
        }
        if (!targetRect) continue;

        // original geometry
        const origH = parseFloat(targetRect.dataset.origHeight) || 0;
        const origY = parseFloat(targetRect.dataset.origY) || 0;

        // compute fraction remaining = remaining / initial
        const seq = binder.sequences[b];
        const init = (seq && seq[activeIdx] != null && isFinite(seq[activeIdx])) ? Number(seq[activeIdx]) : 1;
        const rem = (binder.remaining[b] != null && isFinite(binder.remaining[b])) ? Number(binder.remaining[b]) : 0;
        const frac = Math.max(0, Math.min(1, init > 0 ? rem / init : (rem > 0 ? 1 : 0)));
        const newH = origH * frac;
        const newY = origY + (origH - newH);

        // apply only if noticeable
        const curH = parseFloat(targetRect.getAttribute("height") || 0);
        const curY = parseFloat(targetRect.getAttribute("y") || 0);
        if (Math.abs(curH - newH) > 0.5 || Math.abs(curY - newY) > 0.5) {
          targetRect.setAttribute("height", String(Math.max(0, newH)));
          targetRect.setAttribute("y", String(newY));
        }
        // optional fade
        const baseOpacity = 0.95;
        const minOpacity = 0.35;
        const newOp = minOpacity + (baseOpacity - minOpacity) * frac;
        targetRect.setAttribute("opacity", String(newOp));
      }

      if (alive) setTimeout(doTick, tickMs);
    }

    setTimeout(doTick, 80);
    return () => { alive = false; };
  }, [clientBunkers]);

  // helpers for UI
  function safeFmt(v) {
    if (v === null || typeof v === "undefined") return "--";
    if (typeof v === "number") return Number.isFinite(v) ? v : "--";
    return v;
  }

  function nextBatchSummary(idx) {
    const binder = binderRef.current;
    if (binder && Array.isArray(binder.remaining)) {
      const rem = binder.remaining[idx];
      return rem == null ? "--" : secondsToHHMMSS(rem);
    }
    return "--";
  }

  return (
    <>
      <div className="bunkers-grid" id="bunkersGrid" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {Array.from({ length: NUM }).map((_, idx) => (
          <div key={idx} className="bunker" data-bunker={idx} onClick={() => onOpenSingle(idx)} style={{ position: "relative", width: 120 }}>
            <svg style={{ width: "100%", height: 180 }} viewBox="0 0 100 150" preserveAspectRatio="xMidYMid meet" />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 6, textAlign: "center", pointerEvents: "none", fontSize: 12 }}>
              <div style={{ display: "inline-block", padding: "2px 6px", borderRadius: 6, background: "rgba(255,255,255,0.95)" }}>
                {nextBatchSummary(idx)}
              </div>
            </div>
            <div className="label" style={{ textAlign: "center", marginTop: 6 }}>Coal Mill {String.fromCharCode(65 + idx)}</div>
          </div>
        ))}
      </div>

      {/* Flow / Next batch / Estimated Gen / Blend comp rows (kept simple) */}
      <div className="coal-flow-wrap" style={{ marginTop: 18 }}>
        <div className="coal-flow-title">Coal Flow</div>
        <div className="coal-flow-grid" id="coalFlowGrid" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {flows.map((f, idx) => (
            <div key={idx} className="coal-box" id={`coalFlowBox-${idx}`} data-bunker={idx} style={{ width: 120, padding: 8, borderRadius: 6, background: "#fafafa", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.02)" }}>
              <div className="value">{safeFmt(f)}</div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="coal-flow-wrap" style={{ marginTop: 12 }}>
        <div className="coal-flow-title">Next Coal Batch</div>
        <div className="coal-flow-grid" id="nextBlendGrid" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {Array.from({ length: NUM }).map((_, idx) => (
            <div key={idx} className="coal-box" id={`nextBlendBox-${idx}`} data-bunker={idx} style={{ width: 120, padding: 8, borderRadius: 6, background: "#fff" }}>
              <div className="value">{nextBatchSummary(idx)}</div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="coal-flow-wrap" style={{ marginTop: 12 }}>
        <div className="coal-flow-title">Estimated Generation (24h)</div>
        <div className="coal-flow-grid" id="estimatedGenGrid" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {Array.from({ length: NUM }).map((_, idx) => (
            <div key={idx} className="coal-box" id={`estimatedGenBox-${idx}`} data-bunker={idx} style={{ width: 120, padding: 8, borderRadius: 6, background: "#fff" }}>
              <div className="value">--</div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="coal-flow-wrap" style={{ marginTop: 12 }}>
        <div className="coal-flow-title">Blend Composition</div>
        <div className="coal-flow-grid" id="blendCompGrid" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {Array.from({ length: NUM }).map((_, idx) => (
            <div key={idx} className="coal-box" id={`blendCompBox-${idx}`} data-bunker={idx} style={{ width: 120, padding: 8, borderRadius: 6, background: "#fff" }}>
              <div className="value small">{""}</div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
