// src/services/api.js
const API_BASE = window.location.origin + '/api';

/* common fetch wrapper */
async function safeFetchJson(url, opts = {}) {
  try {
    const res = await fetch(url, Object.assign({ credentials: 'same-origin' }, opts));
    if (!res.ok) {
      // return null for non-OK so callers can fallback
      return null;
    }
    const txt = await res.text();
    try { return JSON.parse(txt); } catch (e) { return txt; }
  } catch (e) {
    console.error('safeFetchJson error', e, url);
    return null;
  }
}

export async function fetchCoalDB() {
  // prefer /coals then /coal
  let r = await safeFetchJson(API_BASE + '/coals');
  if (!r) r = await safeFetchJson(API_BASE + '/coal');
  if (!r) return [];
  if (Array.isArray(r)) return r;
  const list = r.coals || r.data || r.items || r.docs || r.list;
  if (Array.isArray(list)) return list;
  return [];
}

export async function fetchBlendLatest() {
  const r = await safeFetchJson(API_BASE + '/blend/latest');
  return r || null;
}

export async function fetchBlendById(id) {
  if (!id) return null;
  const r = await safeFetchJson(API_BASE + '/blend/' + encodeURIComponent(String(id)) + '?_ts=' + Date.now());
  return r || null;
}

/**
 * getUnit(unit)
 * - Tries canonical endpoints and returns parsed JSON if found
 * - Returns server response exactly, which in your example looks like:
 *   { unit: 1, doc: { _id, blendId, snapshot: {...}, savedAt }, blend: {...} }
 */
export async function getUnit(unit = 1) {
  const u = Number(unit) || 1;
  if (![1,2,3].includes(u)) throw new Error('unit must be 1, 2 or 3');

  // Try canonical route first (your server responds to /api/unit/1)
  const tried = [
    API_BASE + '/unit/' + u,
    API_BASE + '/unit/' + u + '/snapshot',
    API_BASE + '/units/' + u,
    API_BASE + '/units/' + u + '/snapshot',
    API_BASE + '/units/summary'
  ];

  for (const url of tried) {
    const r = await safeFetchJson(url);
    if (r) {
      // if `/units/summary` returned a map, try to extract the unit key
      if (url.endsWith('/units/summary') && r[`unit${u}`]) return r[`unit${u}`];
      return r;
    }
  }
  return null;
}

export default {
  fetchCoalDB,
  fetchBlendLatest,
  fetchBlendById,
  getUnit
};
