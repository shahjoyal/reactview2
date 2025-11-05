// src/components/SingleBunker.jsx
import React, { useEffect } from 'react';

/**
 * SingleBunker — reads the same normalized snapshot used by BunkersGrid
 * and calls the shared renderer so visuals/hover/percents match exactly.
 */
export default function SingleBunker({ idx = 0 }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // helper: resolve the authoritative normalized snapshot (used by BunkersGrid)
    function resolveSnapshot() {
      return window.__DEBUG_SNAPSHOT ||
             window.SNAPSHOT_NORMALIZED ||
             (window.LATEST_BLEND && window.LATEST_BLEND.doc && window.LATEST_BLEND.doc.snapshot) ||
             (window.LATEST_BLEND && window.LATEST_BLEND.snapshot) ||
             null;
    }

    // safe numeric extractor (same idea as safeNum used elsewhere)
    const safeNum = (v) => {
      try {
        if (v == null) return null;
        if (typeof v === 'number' && isFinite(v)) return Number(v);
        if (typeof v === 'string') {
          const s = v.replace(/,/g, '').trim();
          const m = s.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
          if (m && m[0]) return Number(m[0]);
          return null;
        }
        if (typeof v === 'object') {
          if (v.$numberInt) return Number(String(v.$numberInt).replace(/[^\d\.\-]/g,'')) || null;
          if (v.$numberDouble) return Number(String(v.$numberDouble).replace(/[^\d\.\-]/g,'')) || null;
          for (const k of Object.keys(v)) {
            const c = v[k];
            if (typeof c === 'number' && isFinite(c)) return Number(c);
            if (typeof c === 'string') {
              const s2 = c.replace(/,/g, '').trim();
              const m2 = s2.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
              if (m2 && m2[0]) return Number(m2[0]);
            }
          }
        }
        const n = Number(v);
        return isFinite(n) ? n : null;
      } catch (e) {
        return null;
      }
    };

    function getBunkerObject(snapshot) {
      if (!snapshot) return { layers: [] };

      // prefer clientBunkers (this is what BunkersGrid normalizes)
      if (Array.isArray(snapshot.clientBunkers) && snapshot.clientBunkers[idx]) {
        return snapshot.clientBunkers[idx];
      }

      // bunkerTimers may contain layers (mirror of clientBunkers)
      if (Array.isArray(snapshot.bunkerTimers) && snapshot.bunkerTimers[idx] && Array.isArray(snapshot.bunkerTimers[idx].layers)) {
        return { layers: snapshot.bunkerTimers[idx].layers };
      }

      // older shape: snapshot.bunkers
      if (Array.isArray(snapshot.bunkers) && snapshot.bunkers[idx]) {
        return snapshot.bunkers[idx];
      }

      return { layers: [] };
    }

    function renderNow() {
      try {
        const snapshot = resolveSnapshot();
        const coalDB = window.__DEBUG_COAL_DB || window.COAL_DB || [];

        const bunkerObj = getBunkerObject(snapshot);

        // ensure SVG present
        let svg = document.getElementById('singleSvg');
        if (!svg) return;

        if (!svg.id) svg.id = `single_svg_${idx}_${Math.random().toString(36).slice(2)}`;

        // If the shared renderer is present, use it (keeps overview & single identical)
        if (typeof window.renderBunkerIntoSVG === 'function') {
          try {
            // NOTE: renderBunkerIntoSVG expects layers bottom->top (BunkersGrid normalizes snapshot to that)
            window.renderBunkerIntoSVG(svg, bunkerObj, coalDB, idx, true, 1.0);
            return;
          } catch (err) {
            // fallback to internal if renderBunkerIntoSVG throws for any reason
            // eslint-disable-next-line no-console
            console.warn('renderBunkerIntoSVG threw, falling back to inline renderer', err);
          }
        }

        // fallback inline renderer (keeps same visual as earlier fallback)
        const topY = 10, midY = 100, bottomY = 140;
        const usableH = bottomY - topY;
        const clipPathClosed = `M10 ${topY} L10 ${midY} L45 ${bottomY} L55 ${bottomY} L90 ${midY} L90 ${topY} L10 ${topY}`;
        const DEFAULT_PALETTE = ['#f39c12','#3498db','#2ecc71','#ef4444','#8b5cf6','#f97316','#06b6d4','#a3e635'];

        // build inner HTML with clip + outlines + rects
        let inner = `<defs><clipPath id="${svg.id}-clip"><path d="${clipPathClosed}" /></clipPath></defs>`;
        inner += `<path d="${clipPathClosed}" stroke="#000" stroke-width="1.2" fill="none" />`;

        const layers = Array.isArray(bunkerObj.layers) ? bunkerObj.layers.slice() : [];
        // follow same expectation as renderBunkerIntoSVG: layers array is bottom->top
        let cum = 0;
        for (let i = 0; i < layers.length; i++) {
          const L = layers[i] || {};
          const pctRaw = (typeof L.visualPercent !== 'undefined' && L.visualPercent !== null) ? L.visualPercent : (typeof L.percent !== 'undefined' ? L.percent : null);
          const pct = Math.max(0, Math.min(100, Number(safeNum(pctRaw) || 0)));
          const h = (pct / 100) * usableH;
          const y = bottomY - (cum + h);
          const color = L.color || (L.coalDoc && (L.coalDoc.color || L.coalDoc.hex)) || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
          const layerJson = JSON.stringify({
            coal: L.coal || L.name || '',
            percent: pct,
            gcv: L.gcv || (L.coalDoc && L.coalDoc.gcv) || null,
            cost: L.cost || (L.coalDoc && L.coalDoc.cost) || null,
            rowIndex: (typeof L.rowIndex !== 'undefined' ? L.rowIndex : i),
            color: color
          }).replace(/"/g, '&quot;');
          inner += `<g clip-path="url(#${svg.id}-clip)">` +
                   `<rect x="10" y="${y}" width="80" height="${h}" fill="${color}" data-row="${L.rowIndex || i}" data-mill="${idx}" data-pct="${pct}" ` +
                   `onmouseenter="window.showCoalRectTooltip && window.showCoalRectTooltip(event, ${L.rowIndex || 0}, ${idx}, ${layerJson})" ` +
                   `onmousemove="window.moveCoalRectTooltip && window.moveCoalRectTooltip(event)" ` +
                   `onmouseleave="window.hideCoalRectTooltip && window.hideCoalRectTooltip()" />` +
                   `</g>`;
          cum += h;
        }

        if (!layers.length) {
          inner += `<text x="50" y="${(topY + bottomY) / 2}" text-anchor="middle" fill="#666" font-size="8">No data</text>`;
        }

        svg.innerHTML = inner;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('SingleBunker render error', e);
      }
    } // renderNow

    // initial render attempt
    renderNow();

    // re-render when BunkersGrid updates snapshot (it dispatches 'blend:rendered' and 'blend:updated')
    const onBlendRendered = () => renderNow();
    window.addEventListener('blend:rendered', onBlendRendered);
    window.addEventListener('blend:updated', onBlendRendered);

    // also re-render on DOM click that opens single view (safe)
    const onClickDoc = () => renderNow();
    document.addEventListener('click', onClickDoc);

    // cleanup
    return () => {
      window.removeEventListener('blend:rendered', onBlendRendered);
      window.removeEventListener('blend:updated', onBlendRendered);
      document.removeEventListener('click', onClickDoc);
    };
  }, [idx]);

  return (
    <div className="single-bunker-wrap">
      <div className="single-bunker">
        <svg id="singleSvg" viewBox="0 0 100 150" preserveAspectRatio="xMidYMid meet"></svg>
        <div id="singleLabel" className="label">Bunker {idx + 1}</div>
      </div>
      <div className="single-bunker-legend" style={{ marginTop: 12 }}>
        {/* Legend will be built from snapshot if needed elsewhere; keep minimal here */}
      </div>
    </div>
  );
}
