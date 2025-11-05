// src/components/StatsPanel.jsx
import React, { useEffect, useRef } from "react";

/**
 * StatsPanel - computes derived metrics (Avg GCV, Avg AFT, Heat Rate, Total Flow)
 * Now prefers reading from window.SNAPSHOT_NORMALIZED (snapshot) when available.
 *
 * Change: compute Avg AFT (flow-weighted) and Cost/MT (flow-weighted) from snapshot data (DB),
 *        do NOT use blend.costRate when snapshot layer costs are available.
 */

export default function StatsPanel() {
  const blockIntervalRef = useRef(null);

  function fmt(date) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function nextQuarterStart(now = new Date()) {
    const totalMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const startMinutes = Math.ceil(totalMinutes / 15) * 15;
    const h = Math.floor(startMinutes / 60) % 24;
    const m = startMinutes % 60;
    const d = new Date(now.getTime());
    d.setHours(h, m, 0, 0);
    return d;
  }

  function buildBlockLabels() {
    const now = new Date();
    const firstStart = nextQuarterStart(now);
    const labels = [];
    for (let i = 0; i < 4; i++) {
      const start = new Date(firstStart.getTime() + i * 15 * 60 * 1000);
      const end = new Date(start.getTime() + 15 * 60 * 1000);
      labels.push(`${fmt(start)} - ${fmt(end)}`);
    }
    return labels;
  }

  function updateBlockTableDom() {
    try {
      const labels = buildBlockLabels();
      for (let i = 0; i < 4; i++) {
        const row = document.getElementById(`blockRow-${i}`);
        if (!row) continue;
        const timeCell = row.querySelector(".block-time");
        if (timeCell) timeCell.textContent = labels[i];
      }
    } catch (e) { }
  }

  function safeNum(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function findCoalInDbByNameOrId(coalNameOrId, coalDB, snapshot) {
    if (!coalNameOrId) return null;
    const keyLower = String(coalNameOrId).trim().toLowerCase();
    if (Array.isArray(coalDB)) {
      const found = coalDB.find((c) => {
        if (!c) return false;
        if (c.coal && String(c.coal).trim().toLowerCase() === keyLower) return true;
        if (c.name && String(c.name).trim().toLowerCase() === keyLower) return true;
        if ((c._id || c.id) && String(c._id || c.id) === String(coalNameOrId)) return true;
        return false;
      });
      if (found) return found;
    }
    try {
      if (typeof window !== "undefined" && Array.isArray(window.COAL_DB)) {
        const f = window.COAL_DB.find((c) => {
          if (!c) return false;
          if (c.coal && String(c.coal).trim().toLowerCase() === keyLower) return true;
          if (c.name && String(c.name).trim().toLowerCase() === keyLower) return true;
          if ((c._id || c.id) && String(c._id || c.id) === String(coalNameOrId)) return true;
          return false;
        });
        if (f) return f;
      }
    } catch (e) {}
    if (snapshot && Array.isArray(snapshot.coals)) {
      const s = snapshot.coals.find((c) => {
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

  // resolve bunker flow (prefers blend.flows or snapshot.flows as used below)
  function getBunkerFlow(blend, b, snapshot) {
    try {
      if (snapshot && Array.isArray(snapshot.flows) && typeof snapshot.flows[b] !== "undefined") {
        const f = safeNum(snapshot.flows[b]);
        if (f !== null) return f;
      }
      if (Array.isArray(blend.flows) && typeof blend.flows[b] !== "undefined") {
        const f = safeNum(blend.flows[b]);
        if (f !== null) return f;
      }
      if (Array.isArray(blend.bunkers) && blend.bunkers[b] && typeof blend.bunkers[b].flow !== "undefined") {
        const f = safeNum(blend.bunkers[b].flow);
        if (f !== null) return f;
      }
    } catch (e) {}
    return null;
  }

  // bottom selection heuristics (prefer nextBlendBinder activeLayer)
  function getBottomGcvForBunker(blend, coalDB, bunkerIndex, snapshot, clientBunkers) {
    try {
      if (clientBunkers && Array.isArray(clientBunkers) && clientBunkers[bunkerIndex] && Array.isArray(clientBunkers[bunkerIndex].layers)) {
        const layers = clientBunkers[bunkerIndex].layers;
        for (let li = layers.length; li >=0 ; li--) {
          const L = layers[li];
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
      }

      // fallback: scan blend.bunkers bottom->top
      if (Array.isArray(blend && blend.bunkers) && blend.bunkers[bunkerIndex] && Array.isArray(blend.bunkers[bunkerIndex].layers)) {
        const layers = blend.bunkers[bunkerIndex].layers;
        for (let li = layers.length; li >=0 ; li--) {
          const L = layers[li];
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
      }
    } catch (e) {}
    return null;
  }

  function getBottomAftForBunker(blend, coalDB, bunkerIndex, snapshot, clientBunkers) {
    try {
      if (typeof window !== "undefined" && window.nextBlendBinder && typeof window.nextBlendBinder.getActiveLayer === "function") {
        const active = window.nextBlendBinder.getActiveLayer(bunkerIndex);
        if (active) {
          if (active.coalDoc) {
            const a = calcAFT(active.coalDoc);
            if (a != null) return a;
          }
          if (active.AFT != null) return safeNum(active.AFT);
          if (active.coal) {
            const f = findCoalInDbByNameOrId(active.coal, coalDB, snapshot);
            if (f) {
              const a = calcAFT(f);
              if (a != null) return a;
              if (f.AFT != null) return safeNum(f.AFT);
            }
          }
        }
      }

      // try clientBunkers if provided (normalized)
      if (clientBunkers && Array.isArray(clientBunkers) && clientBunkers[bunkerIndex] && Array.isArray(clientBunkers[bunkerIndex].layers)) {
        const layers = clientBunkers[bunkerIndex].layers;
        for (let li = 0; li < layers.length; li++) {
          const L = layers[li];
          if (!L) continue;
          let rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
          let pctVal = null;
          if (Array.isArray(rawPct) && rawPct.length) pctVal = safeNum(rawPct[0]);
          else pctVal = safeNum(rawPct);
          if (pctVal == null || pctVal > 0) {
            if (L.coalDoc) {
              const a = calcAFT(L.coalDoc);
              if (a != null) return a;
            }
            if (L.AFT != null) return safeNum(L.AFT);
            if (L.coal) {
              const f = findCoalInDbByNameOrId(L.coal, coalDB, snapshot);
              if (f) {
                const a = calcAFT(f);
                if (a != null) return a;
                if (f.AFT != null) return safeNum(f.AFT);
              }
            }
          }
        }
      }

      // fallback to blend layers
      if (Array.isArray(blend && blend.bunkers) && blend.bunkers[bunkerIndex] && Array.isArray(blend.bunkers[bunkerIndex].layers)) {
        const layers = blend.bunkers[bunkerIndex].layers;
        for (let li = 0; li < layers.length; li++) {
          const L = layers[li];
          if (!L) continue;
          let rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
          let pctVal = null;
          if (Array.isArray(rawPct) && rawPct.length) pctVal = safeNum(rawPct[0]);
          else pctVal = safeNum(rawPct);
          if (pctVal == null || pctVal > 0) {
            if (L.coalDoc) {
              const a = calcAFT(L.coalDoc);
              if (a != null) return a;
            }
            if (L.AFT != null) return safeNum(L.AFT);
            if (L.coal) {
              const f = findCoalInDbByNameOrId(L.coal, coalDB, snapshot);
              if (f) {
                const a = calcAFT(f);
                if (a != null) return a;
                if (f.AFT != null) return safeNum(f.AFT);
              }
            }
          }
        }
      }
    } catch (e) {}
    return null;
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

  function computeDerivedMetricsLocal(blend, coalDB) {
    try {
      if (!blend) return { avgGCV: null, heatRate: null, totalFlow: null, avgAFT: null, costRate: null };

      const snapshot = (typeof window !== "undefined" ? window.SNAPSHOT_NORMALIZED : null);

      const bunkerCount = Array.isArray(blend.bunkers) ? Math.min(blend.bunkers.length, 8) : 8;
      let sumNumerator = 0;
      let sumFlowsForNumerator = 0;
      let sumAftNumerator = 0;

      const bf = safeNum(blend.totalFlow);
      let totalFlow = (bf !== null) ? bf : null;

      // For cost calculation (flow-weighted)
      let totalTonnageForCost = 0;   // in same unit as flow (TPH basis)
      let totalCostNumerator = 0;    // currency * ton

      for (let b = 0; b < bunkerCount; b++) {
        const flowVal = getBunkerFlow(blend, b, snapshot);
        const bottomGcv = getBottomGcvForBunker(blend, coalDB, b, snapshot, (snapshot ? (snapshot.clientBunkers || snapshot.bunkers) : null));
        const bottomAft = getBottomAftForBunker(blend, coalDB, b, snapshot, (snapshot ? (snapshot.clientBunkers || snapshot.bunkers) : null));

        if (flowVal !== null && bottomGcv !== null) {
          sumNumerator += Number(bottomGcv) * Number(flowVal);
          sumFlowsForNumerator += Number(flowVal);
        }
        if (flowVal !== null && bottomAft !== null) {
          sumAftNumerator += Number(bottomAft) * Number(flowVal);
        }

        // --- Flow-weighted cost computation using snapshot (DB) first, then blend layers, then coalDB ---
        // prefer snapshot.clientBunkers if present (structure similar to blend.bunkers)
        const layerSource = (snapshot && Array.isArray(snapshot.clientBunkers) && snapshot.clientBunkers[b] && Array.isArray(snapshot.clientBunkers[b].layers))
          ? snapshot.clientBunkers[b].layers
          : (Array.isArray(blend.bunkers) && blend.bunkers[b] && Array.isArray(blend.bunkers[b].layers) ? blend.bunkers[b].layers : []);

        if (flowVal !== null && Array.isArray(layerSource) && layerSource.length) {
          for (let li = 0; li < layerSource.length; li++) {
            const L = layerSource[li];
            if (!L) continue;
            // read pct (allow arrays or single numbers)
            let rawPct = (L.percent === undefined || L.percent === null) ? (L.percentages ? L.percentages : 0) : L.percent;
            let pctVal = null;
            if (Array.isArray(rawPct) && rawPct.length) pctVal = safeNum(rawPct[0]);
            else pctVal = safeNum(rawPct);
            if (!pctVal || pctVal <= 0) continue; // nothing from this layer

            const tonnage = (pctVal / 100) * Number(flowVal); // relative tonnage (TPH basis)

            // find cost for this coal/layer: prefer snapshot layer fields
            let costPerTon = null;
            const possibleFields = ["cost", "price", "costRate", "rate", "cost_per_ton", "costMT", "costPerTon", "pricePerTon"];

            // 1) check layer object itself (snapshot priority)
            for (let f of possibleFields) {
              if (L[f] !== undefined && L[f] !== null) {
                const c = safeNum(L[f]);
                if (c !== null) { costPerTon = c; break; }
              }
            }

            // 2) if layer has a coal reference, try snapshot.coals first then coalDB
            if (costPerTon === null && L.coal) {
              const foundInSnapshot = snapshot && Array.isArray(snapshot.coals) ? snapshot.coals.find(c => {
                if (!c) return false;
                if (c.coal && String(c.coal).trim().toLowerCase() === String(L.coal).trim().toLowerCase()) return true;
                if (c.name && String(c.name).trim().toLowerCase() === String(L.coal).trim().toLowerCase()) return true;
                if ((c._id || c.id) && String(c._id || c.id) === String(L.coal)) return true;
                return false;
              }) : null;
              if (foundInSnapshot) {
                for (let f of possibleFields) {
                  if (foundInSnapshot[f] !== undefined && foundInSnapshot[f] !== null) {
                    const c = safeNum(foundInSnapshot[f]);
                    if (c !== null) { costPerTon = c; break; }
                  }
                }
              }
              // 3) fallback to coalDB
              if (costPerTon === null) {
                const foundInDb = findCoalInDbByNameOrId(L.coal, coalDB, snapshot);
                if (foundInDb) {
                  for (let f of possibleFields) {
                    if (foundInDb[f] !== undefined && foundInDb[f] !== null) {
                      const c = safeNum(foundInDb[f]);
                      if (c !== null) { costPerTon = c; break; }
                    }
                  }
                }
              }
            }

            // 4) if still null and layer has coalDoc object, check it
            if (costPerTon === null && L.coalDoc) {
              for (let f of possibleFields) {
                if (L.coalDoc[f] !== undefined && L.coalDoc[f] !== null) {
                  const c = safeNum(L.coalDoc[f]);
                  if (c !== null) { costPerTon = c; break; }
                }
              }
            }

            // accumulate cost only if we have a costPerTon
            if (costPerTon !== null) {
              totalTonnageForCost += tonnage;
              totalCostNumerator += tonnage * Number(costPerTon);
            }
          } // layers loop
        }
      } // bunker loop

      if (totalFlow === null) {
        totalFlow = (sumFlowsForNumerator > 0) ? sumFlowsForNumerator : null;
      }

      const avgGCV = (totalFlow && totalFlow > 0) ? (sumNumerator / totalFlow) : null;
      // avgAFT using flow-weighted average (only AFT)
      const avgAFT = (totalFlow && totalFlow > 0 && sumAftNumerator >= 0) ? (sumAftNumerator / totalFlow) : null;

      // compute flow-weighted cost/MT (if we found any cost info)
      let costRate = null;
      if (totalTonnageForCost > 0) {
        costRate = totalCostNumerator / totalTonnageForCost;
      } else {
        // fallback to blend.costRate only if no per-layer cost info
        costRate = (blend.costRate !== undefined ? safeNum(blend.costRate) : null);
      }

      const generation = safeNum(blend.generation);
      let heatRate = null;
      if (avgGCV !== null && totalFlow !== null && generation !== null && generation > 0) {
        heatRate = (avgGCV * Number(totalFlow)) / Number(generation);
      } else {
        const hr = safeNum(blend.heatRate);
        heatRate = (hr !== null) ? hr : null;
      }

      return {
        avgGCV: avgGCV === null ? null : Number(avgGCV),
        heatRate: heatRate === null ? null : Number(heatRate),
        totalFlow: totalFlow === null ? null : Number(totalFlow),
        avgAFT: avgAFT === null ? null : Number(avgAFT),
        costRate: costRate === null ? null : Number(costRate)
      };
    } catch (e) {
      return { avgGCV: null, heatRate: null, totalFlow: null, avgAFT: null, costRate: null };
    }
  }

  function populateStats(metrics) {
    const setText = (id, v, decimals = 2) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (v === null || typeof v === "undefined") { el.innerText = "--"; return; }
      if (typeof v === "number") el.innerText = Number.isFinite(v) ? v.toFixed(decimals) : "--";
      else el.innerText = String(v);
    };

    setText("GEN", metrics.generation !== undefined ? metrics.generation : "--", 2);
    setText("TOTALFLOW", (metrics.totalFlow !== undefined) ? (metrics.totalFlow === null ? null : Number(metrics.totalFlow)) : null, 2);
    setText("AVGGCV", (metrics.avgGCV !== undefined) ? (metrics.avgGCV === null ? null : Number(metrics.avgGCV)) : null, 2);
    setText("AVGAFT", (metrics.avgAFT !== undefined) ? (metrics.avgAFT === null ? null : Number(metrics.avgAFT)) : null, 2);
    setText("HEATRATE", (metrics.heatRate !== undefined) ? (metrics.heatRate === null ? null : Number(metrics.heatRate)) : null, 2);
    setText("COSTRATE", (metrics.costRate !== undefined) ? (metrics.costRate === null ? null : Number(metrics.costRate)) : null, 2);
  }

  function tryRecomputeAndPopulate() {
    try {
      // prefer snapshot (normalized) as primary data source
      const snapshot = (typeof window !== "undefined" && window.SNAPSHOT_NORMALIZED) ? window.SNAPSHOT_NORMALIZED : null;
      const blend = snapshot || (typeof window !== "undefined" && window.LATEST_BLEND ? window.LATEST_BLEND : (window.LATEST_BLEND || {}));
      const coalDB = (typeof window !== "undefined" && Array.isArray(window.COAL_DB)) ? window.COAL_DB : [];

      let derived = null;
      if (typeof window !== "undefined" && typeof window.computeDerivedMetrics === "function") {
        try {
          derived = window.computeDerivedMetrics(blend, coalDB);
        } catch (e) { derived = null; }
      }
      if (!derived || typeof derived !== "object") {
        derived = computeDerivedMetricsLocal(blend, coalDB);
      }

      const metrics = {
        generation: (blend && blend.generation !== undefined ? blend.generation : null),
        totalFlow: (derived.totalFlow !== null ? derived.totalFlow : (blend.totalFlow !== undefined ? blend.totalFlow : null)),
        avgGCV: (derived.avgGCV !== null ? derived.avgGCV : (blend.avgGCV !== undefined ? blend.avgGCV : null)),
        avgAFT: (derived.avgAFT !== null ? derived.avgAFT : (blend.avgAFT !== undefined ? blend.avgAFT : null)),
        heatRate: (derived.heatRate !== null ? derived.heatRate : (blend.heatRate !== undefined ? blend.heatRate : null)),
        costRate: (derived.costRate !== null ? derived.costRate : (blend.costRate !== undefined ? blend.costRate : null))
      };

      if (typeof window !== "undefined" && typeof window.populateStats === "function") {
        try { window.populateStats(metrics); return; } catch (e) {}
      }
      populateStats(metrics);
    } catch (e) {
      try {
        if (typeof window !== "undefined" && typeof window.populateStats === "function") window.populateStats({}); 
      } catch (ee) {}
    }
  }

  useEffect(() => {
    updateBlockTableDom();
    tryRecomputeAndPopulate();

    function onBlendUpdated() { tryRecomputeAndPopulate(); updateBlockTableDom(); }
    function onFlowsUpdate() { tryRecomputeAndPopulate(); }
    function onBlendRendered() { tryRecomputeAndPopulate(); }
    function onNextBlendUpdated() { tryRecomputeAndPopulate(); }

    window.addEventListener("blend:updated", onBlendUpdated, false);
    window.addEventListener("flows:update", onFlowsUpdate, false);
    window.addEventListener("blend:rendered", onBlendRendered, false);
    window.addEventListener("nextBlend:updated", onNextBlendUpdated, false);

    blockIntervalRef.current = setInterval(updateBlockTableDom, 15000);
    const recomputeTimer = setInterval(tryRecomputeAndPopulate, 1000);

    return () => {
      window.removeEventListener("blend:updated", onBlendUpdated, false);
      window.removeEventListener("flows:update", onFlowsUpdate, false);
      window.removeEventListener("blend:rendered", onBlendRendered, false);
      window.removeEventListener("nextBlend:updated", onNextBlendUpdated, false);
      if (blockIntervalRef.current) { clearInterval(blockIntervalRef.current); blockIntervalRef.current = null; }
      clearInterval(recomputeTimer);
    };
  }, []);

  return (
    <div className="stats-column">
      <div className="stats-panel" id="statsPanel" aria-hidden="false">
        <div style={{ fontSize: 13, fontWeight: 800 }}>Summary</div>

        <div className="stat-row">
          <div className="stat-label">GEN</div>
          <div className="stat-value" id="GEN">--</div>
        </div>

        <div className="stat-row">
          <div className="stat-label">Flow (TPH)</div>
          <div className="stat-value" id="TOTALFLOW">--</div>
        </div>

        <div className="stat-row">
          <div className="stat-label">Avg GCV</div>
          <div className="stat-value" id="AVGGCV">--</div>
        </div>

        <div className="stat-row">
          <div className="stat-label">Avg AFT</div>
          <div className="stat-value" id="AVGAFT">--</div>
        </div>

        <div className="stat-row">
          <div className="stat-label">Heat Rate</div>
          <div className="stat-value" id="HEATRATE">--</div>
        </div>

        <div className="stat-row">
          <div className="stat-label">Average Coal Consumption Cost(₹/MT)</div>
          <div className="stat-value" id="COSTRATE">--</div>
        </div>

        <div id="blockTableWrap" className="block-table-wrap" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Next Blocks</div>
          <table className="block-table" id="blockTable" aria-label="Next blocks table" style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #fff", color: "inherit" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #fff", padding: 4 }}>Block</th>
              </tr>
            </thead>
            <tbody>
              <tr id="blockRow-0"><td className="block-time" style={{ border: "1px solid #fff", padding: 4 }}>--</td></tr>
              <tr id="blockRow-1"><td className="block-time" style={{ border: "1px solid #fff", padding: 4 }}>--</td></tr>
              <tr id="blockRow-2"><td className="block-time" style={{ border: "1px solid #fff", padding: 4 }}>--</td></tr>
              <tr id="blockRow-3"><td className="block-time" style={{ border: "1px solid #fff", padding: 4 }}>--</td></tr>
            </tbody>
          </table>
        </div>

        <div style={{ opacity: 0.85, fontSize: 11, marginTop: 6 }} />
      </div>
    </div>
  );
}
