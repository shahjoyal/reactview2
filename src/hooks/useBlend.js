// src/hooks/useBlend.js
import { useEffect, useRef, useState } from 'react';
import { fetchCoalDB, getUnit } from '../services/api';

function computeTimersSeconds(norm) {
  const out = Array(8).fill(null);
  if (!norm) return out;
  for (let i = 0; i < 8; i++) {
    const bt = (norm.bunkerTimers && norm.bunkerTimers[i]) ? norm.bunkerTimers[i] : null;
    if (bt && bt.remainingSeconds != null) {
      out[i] = Math.max(0, Math.round(Number(bt.remainingSeconds)));
      continue;
    }
    const flow = Number((norm.flows && norm.flows[i]) ? norm.flows[i] : 0);
    const bc = Number(norm.bunkerCapacity || 0);
    const totalPct = (norm.clientBunkers && norm.clientBunkers[i] && Array.isArray(norm.clientBunkers[i].layers))
      ? norm.clientBunkers[i].layers.reduce((s, L) => s + (Number(L.percent) || 0), 0)
      : 0;
    if (flow > 0 && bc > 0 && totalPct > 0) {
      const hours = (totalPct / 100) * bc / flow;
      out[i] = Math.max(0, Math.round(hours * 3600));
    } else {
      out[i] = null;
    }
  }
  return out;
}

function normalizeUnitResp(unitResp) {
  if (!unitResp) return null;
  // server returns { unit, doc: { snapshot }, blend }
  const doc = unitResp.doc || unitResp;
  const snapshot = (doc && doc.snapshot) ? doc.snapshot : (unitResp.snapshot ? unitResp.snapshot : doc);
  // normalize arrays
  const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
  const flows = Array.isArray(snapshot.flows) ? snapshot.flows : (Array(8).fill(0));
  const bunkerCapacity = Number(snapshot.bunkerCapacity || snapshot.bunker_capacity || 0);
  const clientBunkers = Array.isArray(snapshot.clientBunkers) ? snapshot.clientBunkers
    : (Array.isArray(snapshot.bunkers) ? snapshot.bunkers.map(b=>({ layers: b.layers || [] })) : Array.from({length:8}).map(()=>({ layers: [] })));
  const bunkerTimers = Array.isArray(snapshot.bunkerTimers) ? snapshot.bunkerTimers : [];
  const metrics = snapshot.metrics || {};
  const coalColorMap = snapshot.coalColorMap || snapshot.coalColors || snapshot.colorMap || {};
  return { rows, flows, bunkerCapacity, clientBunkers, bunkerTimers, metrics, coalColorMap, raw: snapshot };
}

export default function useBlend() {
  const mounted = useRef(false);
  const [coalDB, setCoalDB] = useState([]);
  const [snapshot, setSnapshot] = useState(null); // normalized snapshot from /api/unit
  const [blend, setBlend] = useState({ rows: [], flows: [], bunkers: [] });
  const [timersSeconds, setTimersSeconds] = useState(Array(8).fill(null));

  async function load(unit = Number(localStorage.getItem('currentUnit') || 1)) {
    try {
      // 1) coal DB
      const coals = await fetchCoalDB();
      setCoalDB(coals || []);
      // 2) unit snapshot
      const unitResp = await getUnit(unit);
      if (!unitResp) {
        // fallback: try latest blend (not authoritative) — but we prefer unit
        setSnapshot(null);
        return { coalDB: coals, blend: null };
      }
      const norm = normalizeUnitResp(unitResp);
      setSnapshot(norm);

      // build enriched clientBunkers with color (prefer layer.color or coalDoc.color)
      const mapByName = {};
      const mapById = {};
      (coals || []).forEach(c => {
        if (!c) return;
        if (c.coal) mapByName[String(c.coal).toLowerCase()] = c.color || c.colour || null;
        if (c._id) mapById[String(c._id)] = c.color || c.colour || null;
      });

      const enriched = Array.from({ length: 8 }).map((_, i) => {
        const b = (norm.clientBunkers && norm.clientBunkers[i]) ? norm.clientBunkers[i] : { layers: [] };
        const layers = (Array.isArray(b.layers) ? b.layers.map(l => {
          const layer = Object.assign({}, l);
          const name = (layer.coal || '').toString();
          let color = null;
          if (name && mapByName[name.toLowerCase()]) color = mapByName[name.toLowerCase()];
          else if (layer.coalId && mapById[String(layer.coalId)]) color = mapById[String(layer.coalId)];
          if (!color && (layer.color || layer.colour)) color = layer.color || layer.colour;
          layer.color = color || layer.color || null;
          return layer;
        }) : []);
        return { layers };
      });

      // prefer server-sent blend if present, but FORCE flows to unit snapshot flows (authoritative)
      const serverBlend = unitResp.blend || null;
      const authoritativeFlows = norm.flows.map(v => Number(v||0));
      const blendObj = serverBlend ? Object.assign({}, serverBlend, { flows: authoritativeFlows }) : {
        rows: norm.rows || [],
        flows: authoritativeFlows,
        bunkers: enriched.map(b => ({ layers: b.layers || [] })),
        bunkerCapacity: norm.bunkerCapacity || 0,
        generation: norm.raw && norm.raw.generation ? Number(norm.raw.generation) : (serverBlend ? serverBlend.generation : 0),
        metrics: norm.metrics || {}
      };

      setBlend(blendObj);
      const tsecs = computeTimersSeconds(Object.assign({}, norm, { clientBunkers: enriched }));
      setTimersSeconds(tsecs);

      // set globals for legacy dashboard.js
      try {
        window.COAL_DB = coals || window.COAL_DB || [];
        window.COAL_COLOR_MAP = Object.assign({}, mapByName, mapById);
        window.LATEST_BLEND = blendObj;
        window.CLIENT_BUNKERS = enriched;
        window.BUNKER_TIMERS = norm.bunkerTimers || [];
        window.TIMERS_SECONDS = tsecs;
        window.SNAPSHOT_NORMALIZED = norm;
      } catch (e) { /* ignore */ }

      // call renderer once (non-invasive)
      requestAnimationFrame(() => {
        try {
          if (typeof window.syncColorMapFromCoalDB === 'function') window.syncColorMapFromCoalDB(window.COAL_DB);
          if (typeof window.refreshAndRender === 'function') window.refreshAndRender('overview', 0, Number(unit));
          else if (typeof window.renderOverview === 'function') window.renderOverview(window.LATEST_BLEND, window.COAL_DB);
        } catch (e) {}
      });

      return { coalDB: coals, snapshot: norm, blend: blendObj };
    } catch (err) {
      console.error('useBlend.load error', err);
      return { coalDB, snapshot, blend };
    }
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      load().catch(console.error);
    }
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    coalDB,
    snapshot,
    blend,
    timersSeconds,
    refreshAll: load
  };
}
