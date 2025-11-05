// // src/components/BunkersGrid.jsx
// import React, { useEffect, useMemo, useState } from 'react';

// function secondsToHHMMSS(secondsRaw) {
//   if (!isFinite(secondsRaw) || secondsRaw === null) return '--';
//   const s = Math.max(0, Math.round(secondsRaw));
//   const h = Math.floor(s / 3600);
//   const m = Math.floor((s % 3600) / 60);
//   const sec = s % 60;
//   return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
// }

// /* simple AFT calc used in tooltip (same formula as server) */
// function calcAFT(ox) {
//   if (!ox) return null;
//   const total = ["SiO2","Al2O3","Fe2O3","CaO","MgO","Na2O","K2O","SO3","TiO2"]
//     .reduce((s,k)=> s + (Number(ox[k])||0), 0);
//   if (total === 0) return null;
//   const SiO2 = Number(ox.SiO2)||0, Al2O3 = Number(ox.Al2O3)||0, Fe2O3 = Number(ox.Fe2O3)||0;
//   const CaO = Number(ox.CaO)||0, MgO = Number(ox.MgO)||0, Na2O = Number(ox.Na2O)||0, K2O = Number(ox.K2O)||0;
//   const SO3 = Number(ox.SO3)||0, TiO2 = Number(ox.TiO2)||0;
//   const sum = SiO2 + Al2O3;
//   let aft = 0;
//   if (sum < 55) {
//     aft = 1245 + (1.1 * SiO2) + (0.95 * Al2O3) - (2.5 * Fe2O3) - (2.98 * CaO) - (4.5 * MgO)
//       - (7.89 * (Na2O + K2O)) - (1.7 * SO3) - (0.63 * TiO2);
//   } else if (sum < 75) {
//     aft = 1323 + (1.45 * SiO2) + (0.683 * Al2O3) - (2.39 * Fe2O3) - (3.1 * CaO) - (4.5 * MgO)
//       - (7.49 * (Na2O + K2O)) - (2.1 * SO3) - (0.63 * TiO2);
//   } else {
//     aft = 1395 + (1.2 * SiO2) + (0.9 * Al2O3) - (2.5 * Fe2O3) - (3.1 * CaO) - (4.5 * MgO)
//       - (7.2 * (Na2O + K2O)) - (1.7 * SO3) - (0.63 * TiO2);
//   }
//   return Number(aft);
// }

// /* tooltip DOM helpers (use existing #coalTooltip element) */
// function showTooltipHtml(html, pageX, pageY) {
//   const t = document.getElementById('coalTooltip');
//   if (!t) return;
//   t.innerHTML = html;
//   t.style.display = 'block';
//   t.style.left = (pageX + 10) + 'px';
//   t.style.top = (pageY + 10) + 'px';
// }
// function moveTooltip(pageX, pageY) {
//   const t = document.getElementById('coalTooltip');
//   if (!t) return;
//   t.style.left = (pageX + 10) + 'px';
//   t.style.top = (pageY + 10) + 'px';
// }
// function hideTooltip() {
//   const t = document.getElementById('coalTooltip');
//   if (!t) return;
//   t.style.display = 'none';
//   t.innerHTML = '';
// }

// export default function BunkersGrid({ blend = {}, coalDB = [], onOpenSingle = () => {} }) {
//   const NUM = 8;

//   // primary sources: window.SNAPSHOT_NORMALIZED (preferred) else blend
//   const snapshot = (typeof window !== 'undefined' && window.SNAPSHOT_NORMALIZED) ? window.SNAPSHOT_NORMALIZED : null;

//   // clientBunkers fallback order:
//   // snapshot.clientBunkers -> snapshot.bunkers -> blend.bunkers -> empty
//   const clientBunkers = useMemo(() => {
//     if (snapshot && Array.isArray(snapshot.clientBunkers) && snapshot.clientBunkers.length === NUM) {
//       return snapshot.clientBunkers;
//     }
//     if (snapshot && Array.isArray(snapshot.bunkers) && snapshot.bunkers.length === NUM) {
//       return snapshot.bunkers;
//     }
//     if (Array.isArray(blend.bunkers) && blend.bunkers.length === NUM) {
//       return blend.bunkers;
//     }
//     return Array.from({ length: NUM }).map(()=>({ layers: [] }));
//   }, [snapshot, blend]);

//   // flows: prefer blend.flows then snapshot.flows
//   const flows = useMemo(() => {
//     if (Array.isArray(blend.flows) && blend.flows.length === NUM) return blend.flows;
//     if (snapshot && Array.isArray(snapshot.flows) && snapshot.flows.length === NUM) return snapshot.flows;
//     return Array(NUM).fill('--');
//   }, [blend, snapshot]);

//   // initial timers: prefer snapshot.bunkerTimers[*].remainingSeconds, else top layer remainingSeconds
//   const initialTimers = useMemo(() => {
//     const arr = Array(NUM).fill(null);
//     if (snapshot && Array.isArray(snapshot.bunkerTimers)) {
//       for (let i=0;i<NUM;i++) {
//         const bt = snapshot.bunkerTimers[i];
//         if (bt && bt.remainingSeconds != null) arr[i] = Number(bt.remainingSeconds);
//         else arr[i] = null;
//       }
//       return arr;
//     }
//     // fallback: top layer remainingSeconds
//     for (let i=0;i<NUM;i++) {
//       const layers = clientBunkers[i] && Array.isArray(clientBunkers[i].layers) ? clientBunkers[i].layers : [];
//       if (layers.length) {
//         const top = layers[layers.length - 1];
//         if (top && top.remainingSeconds != null) arr[i] = Number(top.remainingSeconds);
//       }
//     }
//     return arr;
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [snapshot, clientBunkers]);

//   // timers state (ticks every second)
//   const [timers, setTimers] = useState(initialTimers);

//   // reset timers when incoming initialTimers change
//   useEffect(() => {
//     setTimers(initialTimers);
//   }, [initialTimers]);

//   useEffect(() => {
//     const id = setInterval(() => {
//       setTimers(prev => {
//         const next = prev.slice();
//         let changed = false;
//         for (let i=0;i<NUM;i++) {
//           const v = next[i];
//           if (v == null || !isFinite(v)) continue;
//           if (v > 0) { next[i] = Math.max(0, v - 1); changed = true; }
//         }
//         return changed ? next : prev;
//       });
//     }, 1000);
//     return () => clearInterval(id);
//   }, []);

//   // helpers
//   function safeFmt(v) {
//     if (v === null || typeof v === 'undefined') return '--';
//     if (typeof v === 'number') return Number.isFinite(v) ? v : '--';
//     return v;
//   }

//   function compositionSummary(idx) {
//     const b = clientBunkers[idx] || { layers: [] };
//     const names = [];
//     for (let i=0;i<(b.layers||[]).length && names.length < 3; i++) {
//       const L = b.layers[i];
//       const n = L && (L.coal || (L.coalDoc && L.coalDoc.coal));
//       if (n && !names.includes(n)) names.push(n);
//     }
//     return names.length ? names.join(', ') : '--';
//   }

//   function nextBatchSummary(idx) {
//     // show name + timer (only). Timer will tick from `timers` state when available.
//     const b = clientBunkers[idx] || { layers: [] };
//     if (!b.layers || !b.layers.length) return '--';
//     const next = b.layers[b.layers.length - 1]; // top-most
//     const name = next && (next.coal || (next.coalDoc && next.coalDoc.coal)) ? (next.coal || next.coalDoc.coal) : '--';
//     const secs = (timers && timers[idx] != null) ? timers[idx] : (next && (next.remainingSeconds != null ? next.remainingSeconds : (next.initialSeconds != null ? next.initialSeconds : null)));
//     const timeStr = secs == null ? '--' : secondsToHHMMSS(secs);
//     // return only timer (per your latest ask) — but include name in title or we keep name + timer; user requested timer only,
//     // so return timeStr. If you want name + time, swap the following line to: return `${name} ${timeStr}`.
//     return timeStr;
//   }

//   // tooltip handler
//   function onLayerHover(ev, L) {
//     if (!L) return;
//     const name = L.coal || (L.coalDoc && L.coalDoc.coal) || '--';
//     const pct = (L.percent != null) ? (Number(L.percent).toFixed(3) + '%') : '--';
//     const gcv = L.gcv != null ? L.gcv : (L.coalDoc && L.coalDoc.gcv ? L.coalDoc.gcv : '--');
//     const cost = L.cost != null ? L.cost : (L.coalDoc && L.coalDoc.cost ? L.coalDoc.cost : '--');
//     const aft = L.coalDoc ? Math.round(calcAFT(L.coalDoc)) : '--';
//     const html = `<div style="font-weight:700;margin-bottom:6px">${name}</div>
//                   <div style="font-size:12px">Percent: ${pct}</div>
//                   <div style="font-size:12px">GCV: ${gcv}</div>
//                   <div style="font-size:12px">Cost: ${cost}</div>
//                   <div style="font-size:12px">AFT: ${aft}</div>`;
//     showTooltipHtml(html, ev.pageX, ev.pageY);
//   }

//   // ensure small HMR/no-op
//   useEffect(() => {}, [blend, coalDB, clientBunkers, timers]);

//   return (
//     <>
//       <div className="bunkers-grid" id="bunkersGrid">
//         {Array.from({ length: NUM }).map((_, idx) => {
//           const layers = (clientBunkers && clientBunkers[idx] && Array.isArray(clientBunkers[idx].layers)) ? clientBunkers[idx].layers : [];

//           // compute normalized flex values: if sumPercent > 0 use percent, else fallback to 1 per layer.
//           const sumPct = layers.reduce((s,L) => s + (Number(L.percent)||0), 0);
//           const flexVals = layers.map(L => {
//             const raw = Number(L.percent) || 0;
//             if (sumPct > 0) return raw / sumPct; // fraction of stack
//             return 1 / Math.max(1, layers.length);
//           });

//           // timer for this bunker (displayed under Next Coal Batch row)
//           const timerDisplay = nextBatchSummary(idx);

//           return (
//             <div key={idx} className="bunker" data-bunker={idx} onClick={() => onOpenSingle(idx)} style={{ position:'relative' }}>
//               <svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid meet"></svg>

//               {/* non-invasive overlay stack positioned above the SVG; uses flex column-reverse so last layer is top */}
//               { (layers && layers.length) ? (
//                 <div
//                   className="bunker-layer-stack"
//                   aria-hidden="true"
//                   style={{
//                     position: 'absolute',
//                     left: 0,
//                     right: 0,
//                     bottom: 32,        // leave room for label
//                     height: '60%',
//                     display: 'flex',
//                     flexDirection: 'column-reverse',
//                     overflow: 'hidden'
//                   }}
//                 >
//                   {layers.map((L, li) => {
//                     const flex = (flexVals && flexVals[li]) ? flexVals[li] : (1 / Math.max(1, layers.length));
//                     const bg = L.color || (L.coalDoc && (L.coalDoc.color || L.coalDoc.colour)) || 'transparent';
//                     return (
//                       <div
//                         key={li}
//                         className="bunker-layer"
//                         data-coal-name={L.coal || (L.coalDoc && L.coalDoc.coal) || ''}
//                         data-coal-id={L.coalId || (L.coalDoc && L.coalDoc._id) || ''}
//                         title={(L.coal || (L.coalDoc && L.coalDoc.coal) || '')}
//                         style={{
//                           flex: flex,
//                           minHeight: 4,
//                           background: bg,
//                           opacity: 0.95,
//                           borderTop: '1px solid rgba(0,0,0,0.06)',
//                           boxSizing: 'border-box'
//                         }}
//                         onMouseEnter={(ev) => onLayerHover(ev, L)}
//                         onMouseMove={(ev) => moveTooltip(ev.pageX, ev.pageY)}
//                         onMouseLeave={() => hideTooltip()}
//                       />
//                     );
//                   })}
//                 </div>
//               ) : null }

//               <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
//             </div>
//           );
//         })}
//       </div>

//       {/* Row: Coal Flow */}
//       <div className="coal-flow-wrap">
//         <div className="coal-flow-title">Coal Flow</div>
//         <div className="coal-flow-grid" id="coalFlowGrid">
//           {flows.map((f, idx) => (
//             <div key={idx} className="coal-box" id={`coalFlowBox-${idx}`} data-bunker={idx}>
//               <div className="value">{safeFmt(f)}</div>
//               <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* Row: Next Coal Batch (shows only timer per your request) */}
//       <div className="coal-flow-wrap">
//         <div className="coal-flow-title">Next Coal Batch</div>
//         <div className="coal-flow-grid" id="nextBlendGrid">
//           {Array.from({ length: NUM }).map((_, idx) => (
//             <div key={idx} className="coal-box" id={`nextBlendBox-${idx}`} data-bunker={idx}>
//               <div className="value">{ nextBatchSummary(idx) }</div>
//               <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* Row: Estimated Generation (left blank for now) */}
//       <div className="coal-flow-wrap">
//         <div className="coal-flow-title">Estimated Generation (24h)</div>
//         <div className="coal-flow-grid" id="estimatedGenGrid">
//           {Array.from({ length: NUM }).map((_, idx) => (
//             <div key={idx} className="coal-box" id={`estimatedGenBox-${idx}`} data-bunker={idx}>
//               <div className="value">--</div>
//               <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* Row: Blend Composition (left blank / placeholder) */}
//       <div className="coal-flow-wrap">
//         <div className="coal-flow-title">Blend Composition</div>
//         <div className="coal-flow-grid" id="blendCompGrid">
//           {Array.from({ length: NUM }).map((_, idx) => (
//             <div key={idx} className="coal-box" id={`blendCompBox-${idx}`} data-bunker={idx}>
//               <div className="value small">--</div>
//               <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
//             </div>
//           ))}
//         </div>
//       </div>
//     </>
//   );
// }




// // src/components/BunkersGrid.jsx
// import React, { useEffect, useMemo, useState } from 'react';

// function secondsToHHMMSS(secondsRaw) {
//   if (!isFinite(secondsRaw) || secondsRaw === null) return '--';
//   const s = Math.max(0, Math.round(secondsRaw));
//   const h = Math.floor(s / 3600);
//   const m = Math.floor((s % 3600) / 60);
//   const sec = s % 60;
//   return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
// }

// /* simple AFT calc used in tooltip (same formula as server) */
// function calcAFT(ox) {
//   if (!ox) return null;
//   const total = ["SiO2","Al2O3","Fe2O3","CaO","MgO","Na2O","K2O","SO3","TiO2"]
//     .reduce((s,k)=> s + (Number(ox[k])||0), 0);
//   if (total === 0) return null;
//   const SiO2 = Number(ox.SiO2)||0, Al2O3 = Number(ox.Al2O3)||0, Fe2O3 = Number(ox.Fe2O3)||0;
//   const CaO = Number(ox.CaO)||0, MgO = Number(ox.MgO)||0, Na2O = Number(ox.Na2O)||0, K2O = Number(ox.K2O)||0;
//   const SO3 = Number(ox.SO3)||0, TiO2 = Number(ox.TiO2)||0;
//   const sum = SiO2 + Al2O3;
//   let aft = 0;
//   if (sum < 55) {
//     aft = 1245 + (1.1 * SiO2) + (0.95 * Al2O3) - (2.5 * Fe2O3) - (2.98 * CaO) - (4.5 * MgO)
//       - (7.89 * (Na2O + K2O)) - (1.7 * SO3) - (0.63 * TiO2);
//   } else if (sum < 75) {
//     aft = 1323 + (1.45 * SiO2) + (0.683 * Al2O3) - (2.39 * Fe2O3) - (3.1 * CaO) - (4.5 * MgO)
//       - (7.49 * (Na2O + K2O)) - (2.1 * SO3) - (0.63 * TiO2);
//   } else {
//     aft = 1395 + (1.2 * SiO2) + (0.9 * Al2O3) - (2.5 * Fe2O3) - (3.1 * CaO) - (4.5 * MgO)
//       - (7.2 * (Na2O + K2O)) - (1.7 * SO3) - (0.63 * TiO2);
//   }
//   return Number(aft);
// }

// /* tooltip DOM helpers (use existing #coalTooltip element) */
// function showTooltipHtml(html, pageX, pageY) {
//   const t = document.getElementById('coalTooltip');
//   if (!t) return;
//   t.innerHTML = html;
//   t.style.display = 'block';
//   t.style.left = (pageX + 10) + 'px';
//   t.style.top = (pageY + 10) + 'px';
// }
// function moveTooltip(pageX, pageY) {
//   const t = document.getElementById('coalTooltip');
//   if (!t) return;
//   t.style.left = (pageX + 10) + 'px';
//   t.style.top = (pageY + 10) + 'px';
// }
// function hideTooltip() {
//   const t = document.getElementById('coalTooltip');
//   if (!t) return;
//   t.style.display = 'none';
//   t.innerHTML = '';
// }

// function safeNum(v){
//   try{
//     if (v === null || typeof v === 'undefined') return 0;
//     if (typeof v === 'number' && Number.isFinite(v)) return Number(v);
//     if (typeof v === 'object'){
//       if (v.$numberInt) return Number(String(v.$numberInt).replace(/[^\d\.\-]/g,'')) || 0;
//       if (v.$numberDouble) return Number(String(v.$numberDouble).replace(/[^\d\.\-]/g,'')) || 0;
//       // fallback: try to extract numeric token
//       const s = JSON.stringify(v);
//       const m = (s && s.match(/-?\d+(\.\d+)?/));
//       if(m) return Number(m[0]) || 0;
//       return 0;
//     }
//     const n = Number(String(v).replace(/[^0-9\.\-]/g,'')); return Number.isFinite(n) ? n : 0;
//   }catch(e){ return 0; }
// }

// export default function BunkersGrid({ blend = {}, coalDB = [], onOpenSingle = () => {} }) {
//   const NUM = 8;

//   // primary sources: window.SNAPSHOT_NORMALIZED (preferred) else blend
//   const snapshot = (typeof window !== 'undefined' && window.SNAPSHOT_NORMALIZED) ? window.SNAPSHOT_NORMALIZED : null;

//   // clientBunkers fallback order:
//   // snapshot.clientBunkers -> snapshot.bunkers -> blend.bunkers -> empty
//   const clientBunkers = useMemo(() => {
//     if (snapshot && Array.isArray(snapshot.clientBunkers) && snapshot.clientBunkers.length === NUM) {
//       return snapshot.clientBunkers;
//     }
//     if (snapshot && Array.isArray(snapshot.bunkers) && snapshot.bunkers.length === NUM) {
//       return snapshot.bunkers;
//     }
//     if (Array.isArray(blend.bunkers) && blend.bunkers.length === NUM) {
//       return blend.bunkers;
//     }
//     return Array.from({ length: NUM }).map(()=>({ layers: [] }));
//   }, [snapshot, blend]);

//   // flows: prefer blend.flows then snapshot.flows
//   const flows = useMemo(() => {
//     if (Array.isArray(blend.flows) && blend.flows.length === NUM) return blend.flows;
//     if (snapshot && Array.isArray(snapshot.flows) && snapshot.flows.length === NUM) return snapshot.flows;
//     return Array(NUM).fill('--');
//   }, [blend, snapshot]);

//   // --- NextBlendBinder integration (preferred) ---
//   // If the legacy binder exists it dispatches `nextBlend:updated` events with { activeIdx, remaining }.
//   // It also maintains .sequences so we can compute initial durations. We subscribe to that event.
//   const [binderState, setBinderState] = useState(() => {
//     try {
//       if (typeof window !== 'undefined' && window.nextBlendBinder) {
//         return {
//           activeIdx: Array.isArray(window.nextBlendBinder.activeIdx) ? window.nextBlendBinder.activeIdx.slice() : [],
//           remaining: Array.isArray(window.nextBlendBinder.remaining) ? window.nextBlendBinder.remaining.slice() : [],
//           sequences: Array.isArray(window.nextBlendBinder.sequences) ? window.nextBlendBinder.sequences.map(s => Array.isArray(s) ? s.slice() : []) : []
//         };
//       }
//     } catch(e){}
//     return { activeIdx: [], remaining: [], sequences: [] };
//   });

//   useEffect(() => {
//     function onNextBlendUpdated(e){
//       const d = e && e.detail ? e.detail : {};
//       setBinderState({
//         activeIdx: Array.isArray(d.activeIdx) ? d.activeIdx.slice() : (window.nextBlendBinder && Array.isArray(window.nextBlendBinder.activeIdx) ? window.nextBlendBinder.activeIdx.slice() : []),
//         remaining: Array.isArray(d.remaining) ? d.remaining.slice() : (window.nextBlendBinder && Array.isArray(window.nextBlendBinder.remaining) ? window.nextBlendBinder.remaining.slice() : []),
//         sequences: (window.nextBlendBinder && Array.isArray(window.nextBlendBinder.sequences)) ? window.nextBlendBinder.sequences.map(s => Array.isArray(s) ? s.slice() : []) : []
//       });
//     }
//     window.addEventListener('nextBlend:updated', onNextBlendUpdated, false);

//     // also poll initial binder state once (in case event fired earlier)
//     try { if(window.nextBlendBinder) onNextBlendUpdated({ detail: { activeIdx: window.nextBlendBinder.activeIdx, remaining: window.nextBlendBinder.remaining } }); } catch(e){}

//     return () => window.removeEventListener('nextBlend:updated', onNextBlendUpdated, false);
//   }, []);

//   // --- Fallback timers (if binder not present) ---
//   // This is kept minimal: it will drain bottom-first using fields like initialSeconds/remainingSeconds.
//   const initialTimers = useMemo(() => {
//     const arr = Array(NUM).fill(null);
//     if (snapshot && Array.isArray(snapshot.bunkerTimers)) {
//       for (let i=0;i<NUM;i++) {
//         const bt = snapshot.bunkerTimers[i];
//         if (bt && bt.remainingSeconds != null) arr[i] = Number(bt.remainingSeconds);
//         else arr[i] = null;
//       }
//       return arr;
//     }
//     for (let i=0;i<NUM;i++) {
//       const layers = clientBunkers[i] && Array.isArray(clientBunkers[i].layers) ? clientBunkers[i].layers : [];
//       if (layers.length) {
//         const bottom = layers[layers.length - 1];
//         if (bottom && bottom.remainingSeconds != null) arr[i] = Number(bottom.remainingSeconds);
//       }
//     }
//     return arr;
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [snapshot, clientBunkers]);

//   const [fallbackTimers, setFallbackTimers] = useState(initialTimers);
//   useEffect(() => { setFallbackTimers(initialTimers); }, [initialTimers]);

//   useEffect(() => {
//     const id = setInterval(() => {
//       setFallbackTimers(prev => {
//         const next = prev.slice();
//         let changed = false;
//         for (let i=0;i<NUM;i++){
//           const v = next[i];
//           if (v == null || !isFinite(v)) continue;
//           if (v > 0) { next[i] = Math.max(0, v - 1); changed = true; }
//         }
//         return changed ? next : prev;
//       });
//     }, 1000);
//     return () => clearInterval(id);
//   }, []);

//   // helpers
//   function safeFmt(v) {
//     if (v === null || typeof v === 'undefined') return '--';
//     if (typeof v === 'number') return Number.isFinite(v) ? v : '--';
//     return v;
//   }

//   function compositionSummary(idx) {
//     const b = clientBunkers[idx] || { layers: [] };
//     const names = [];
//     for (let i=0;i<(b.layers||[]).length && names.length < 3; i++) {
//       const L = b.layers[i];
//       const n = L && (L.coal || (L.coalDoc && L.coalDoc.coal));
//       if (n && !names.includes(n)) names.push(n);
//     }
//     return names.length ? names.join(', ') : '--';
//   }

//   function nextBatchSummary(idx) {
//     // prefer binder remaining -> fallback timers -> top-layer remainingSeconds
//     const b = clientBunkers[idx] || { layers: [] };
//     // binder path
//     if (binderState && binderState.activeIdx && binderState.activeIdx.length) {
//       const aIdx = binderState.activeIdx[idx];
//       const rem = (Array.isArray(binderState.remaining) && typeof binderState.remaining[idx] !== 'undefined') ? binderState.remaining[idx] : null;
//       if (aIdx !== null && typeof aIdx !== 'undefined' && rem != null) {
//         return secondsToHHMMSS(rem);
//       }
//     }
//     // fallback timers
//     if (fallbackTimers && typeof fallbackTimers[idx] !== 'undefined' && fallbackTimers[idx] != null) {
//       return secondsToHHMMSS(fallbackTimers[idx]);
//     }
//     // data fallback - topmost layer remainingSeconds
//     if (b.layers && b.layers.length) {
//       const top = b.layers[b.layers.length - 1];
//       const secs = (top && (top.remainingSeconds != null ? top.remainingSeconds : (top.initialSeconds != null ? top.initialSeconds : null)));
//       return secs == null ? '--' : secondsToHHMMSS(secs);
//     }
//     return '--';
//   }

//   // tooltip handler
//   function onLayerHover(ev, L) {
//     if (!L) return;
//     const name = L.coal || (L.coalDoc && L.coalDoc.coal) || '--';
//     const pct = (L.percent != null) ? (Number(L.percent).toFixed(3) + '%') : '--';
//     const gcv = L.gcv != null ? L.gcv : (L.coalDoc && L.coalDoc.gcv ? L.coalDoc.gcv : '--');
//     const cost = L.cost != null ? L.cost : (L.coalDoc && L.coalDoc.cost ? L.coalDoc.cost : '--');
//     const aft = L.coalDoc ? Math.round(calcAFT(L.coalDoc)) : '--';
//     const html = `<div style="font-weight:700;margin-bottom:6px">${name}</div>
//                   <div style="font-size:12px">Percent: ${pct}</div>
//                   <div style="font-size:12px">GCV: ${gcv}</div>
//                   <div style="font-size:12px">Cost: ${cost}</div>
//                   <div style="font-size:12px">AFT: ${aft}</div>`;
//     showTooltipHtml(html, ev.pageX, ev.pageY);
//   }

//   // small HMR/no-op
//   useEffect(() => {}, [blend, coalDB, clientBunkers, binderState, fallbackTimers]);

//   // ---------- render ----------
//   return (
//     <>
//       <div className="bunkers-grid" id="bunkersGrid">
//         {Array.from({ length: NUM }).map((_, idx) => {
//           const bunker = (clientBunkers && clientBunkers[idx]) ? clientBunkers[idx] : { layers: [] };
//           const layers = Array.isArray(bunker.layers) ? bunker.layers.slice() : [];

//           // build filtered layers identical to dashboard.js: map -> safeNum percent -> filter percent > 0
//           // keep original object reference for tooltip; note original order: index 0 = top, last = bottom.
//           const mapped = layers.map((l, origIndex) => ({
//             orig: l,
//             origIndex,
//             coal: l && (l.coal || l.coalDoc && l.coalDoc.coal) || '',
//             percent: (l && (l.percent !== undefined && l.percent !== null)) ? safeNum(l.percent) : (Array.isArray(l && l.percentages) && l.percentages.length ? safeNum(l.percentages[0]) : 0),
//             rowIndex: (l && typeof l.rowIndex !== 'undefined' && l.rowIndex !== null) ? l.rowIndex : null,
//             color: (l && typeof l.color !== 'undefined' && l.color !== null) ? String(l.color) : null,
//             gcv: l && (l.gcv || (l.coalDoc && l.coalDoc.gcv)) || null,
//             cost: l && (l.cost || (l.coalDoc && l.coalDoc.cost)) || null
//           })).filter(x => (x.percent || 0) > 0);

//           // dashboard.js reversed filtered so that first in data renders last (top)
//           const filtered = mapped.slice().reverse();

//           // geometry (same numbers used in dashboard.js)
//           const topY = 10, midY = 100, bottomY = 140;
//           const usableH = bottomY - topY; // 130
//           const clipPathD = `M10 ${topY} L10 ${midY} L45 ${bottomY} L55 ${bottomY} L90 ${midY} L90 ${topY} L10 ${topY}`;

//           // binder info for this bunker (activeIdx/remaining/sequences)
//           const aIdx = (binderState && Array.isArray(binderState.activeIdx)) ? binderState.activeIdx[idx] : null;
//           const remArr = (binderState && Array.isArray(binderState.remaining)) ? binderState.remaining : [];
//           const seqsArr = (binderState && Array.isArray(binderState.sequences)) ? binderState.sequences : [];

//           // fallback timers per-bunker (seconds)
//           const fallbackTimerForBunker = (fallbackTimers && typeof fallbackTimers[idx] !== 'undefined') ? fallbackTimers[idx] : null;

//           // compute rects for filtered[] in the same loop order as dashboard (filtered indexes correspond to sequence indexes: 0 = bottom)
//           let cum = 0;
//           const rects = filtered.map((f, fi) => {
//             const pct = Math.max(0, Math.min(100, Number(f.percent) || 0));
//             const h = (pct / 100) * usableH;
//             const yBase = bottomY - (cum + h); // top y of this rect if full
//             // compute displayed height using binder if present
//             let displayedH = h;

//             // binder exists and has sequences -> sequence index fi corresponds to bottom->top indexing
//             if (seqsArr && seqsArr[idx] && Array.isArray(seqsArr[idx]) && seqsArr[idx].length) {
//               const seqForB = seqsArr[idx];
//               // sanity: ensure seqForB[fi] is the initial seconds for this layer (may be null)
//               const initial = (typeof seqForB[fi] === 'number') ? seqForB[fi] : null;
//               const remainingForB = (Array.isArray(remArr) && typeof remArr[idx] !== 'undefined') ? remArr[idx] : null;
//               // if binder activeIdx is null or undefined -> no draining; full height
//               if (aIdx === null || typeof aIdx === 'undefined') {
//                 displayedH = h;
//               } else {
//                 if (fi < aIdx) {
//                   // finished bottom layers -> show 0
//                   displayedH = 0;
//                 } else if (fi === aIdx) {
//                   // currently draining layer -> compute fraction remaining/initial if possible
//                   if (initial != null && remainingForB != null && initial > 0) {
//                     const frac = Math.max(0, Math.min(1, remainingForB / initial));
//                     displayedH = h * frac;
//                   } else {
//                     // binder says this index is active but no durations available -> show full
//                     displayedH = h;
//                   }
//                 } else {
//                   // fi > aIdx -> not yet started -> full
//                   displayedH = h;
//                 }
//               }
//             } else if (fallbackTimerForBunker != null) {
//               // binder not present -> use fallback per-bunker timers to approximate drain of bottom layer
//               // we only have one number per bunker; we assume it maps to bottom-most mapped layer (filtered[0])
//               if (fi === 0) {
//                 // bottom-most in display ordering
//                 const initial = (f.orig && (f.orig.initialSeconds || f.orig.totalSeconds)) ? Number(f.orig.initialSeconds || f.orig.totalSeconds) : null;
//                 const remaining = fallbackTimerForBunker;
//                 if (initial != null && initial > 0 && remaining != null) {
//                   const frac = Math.max(0, Math.min(1, remaining / initial));
//                   displayedH = h * frac;
//                 } else {
//                   displayedH = h;
//                 }
//               } else {
//                 displayedH = h;
//               }
//             } else {
//               displayedH = h;
//             }

//             const rect = {
//               x: 10,
//               y: yBase + (h - displayedH), // shift down so bottom stays fixed
//               width: 80,
//               height: Math.max(0, displayedH),
//               fill: f.color || (window.findCoalColor ? (window.findCoalColor(f.coal, window.COAL_DB || []) || (window.DEFAULT_COAL_COLORS ? (window.DEFAULT_COAL_COLORS[fi % (window.DEFAULT_COAL_COLORS.length || 8)] || 'transparent') : 'transparent')) : (f.color || 'transparent')),
//               data: f.orig
//             };

//             cum += h;
//             return rect;
//           });

//           return (
//             <div key={idx} className="bunker" data-bunker={idx} onClick={() => onOpenSingle(idx)} style={{ position:'relative' }}>
//               <svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid meet" style={{ width:'100%', height: '150px', display: 'block' }}>
//                 <defs>
//                   <clipPath id={`bunkerClip-${idx}`}>
//                     <path d={clipPathD} />
//                   </clipPath>
//                 </defs>

//                 {/* outline path (stroke). If you want strokeOpenTop behavior, you can toggle rendering here */}
//                 <path d={clipPathD} stroke="rgba(0,0,0,0.06)" fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />

//                 <g clipPath={`url(#bunkerClip-${idx})`} aria-hidden="true">
//                   {rects.map((r, ri) => (
//                     <rect
//                       key={ri}
//                       x={r.x}
//                       y={r.y}
//                       width={r.width}
//                       height={r.height}
//                       fill={r.fill}
//                       opacity={0.95}
//                       stroke="rgba(0,0,0,0.03)"
//                       style={{ transition: 'height 0.9s linear, y 0.9s linear' }}
//                       onMouseEnter={(ev) => onLayerHover(ev, r.data)}
//                       onMouseMove={(ev) => moveTooltip(ev.pageX, ev.pageY)}
//                       onMouseLeave={() => hideTooltip()}
//                       data-coal-name={r.data && (r.data.coal || (r.data.coalDoc && r.data.coalDoc.coal)) || ''}
//                       data-coal-id={r.data && (r.data.coalId || (r.data.coalDoc && r.data.coalDoc._id)) || ''}
//                     />
//                   ))}
//                 </g>
//               </svg>

//               <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
//             </div>
//           );
//         })}
//       </div>

//       {/* Row: Coal Flow */}
//       <div className="coal-flow-wrap">
//         <div className="coal-flow-title">Coal Flow</div>
//         <div className="coal-flow-grid" id="coalFlowGrid">
//           {flows.map((f, idx) => (
//             <div key={idx} className="coal-box" id={`coalFlowBox-${idx}`} data-bunker={idx}>
//               <div className="value">{safeFmt(f)}</div>
//               <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* Row: Next Coal Batch (shows only timer per your request) */}
//       <div className="coal-flow-wrap">
//         <div className="coal-flow-title">Next Coal Batch</div>
//         <div className="coal-flow-grid" id="nextBlendGrid">
//           {Array.from({ length: NUM }).map((_, idx) => (
//             <div key={idx} className="coal-box" id={`nextBlendBox-${idx}`} data-bunker={idx}>
//               <div className="value">{ nextBatchSummary(idx) }</div>
//               <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* Row: Estimated Generation (left blank for now) */}
//       <div className="coal-flow-wrap">
//         <div className="coal-flow-title">Estimated Generation (24h)</div>
//         <div className="coal-flow-grid" id="estimatedGenGrid">
//           {Array.from({ length: NUM }).map((_, idx) => (
//             <div key={idx} className="coal-box" id={`estimatedGenBox-${idx}`} data-bunker={idx}>
//               <div className="value">--</div>
//               <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* Row: Blend Composition (left blank / placeholder) */}
//       <div className="coal-flow-wrap">
//         <div className="coal-flow-title">Blend Composition</div>
//         <div className="coal-flow-grid" id="blendCompGrid">
//           {Array.from({ length: NUM }).map((_, idx) => (
//             <div key={idx} className="coal-box" id={`blendCompBox-${idx}`} data-bunker={idx}>
//               <div className="value small">--</div>
//               <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
//             </div>
//           ))}
//         </div>
//       </div>
//     </>
//   );
// }




// src/components/BunkersGrid.jsx
import React, { useEffect, useMemo, useState } from 'react';

function secondsToHHMMSS(secondsRaw) {
  if (!isFinite(secondsRaw) || secondsRaw === null) return '--';
  const s = Math.max(0, Math.round(secondsRaw));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

/* simple AFT calc used in tooltip (same formula as server) */
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

/* tooltip DOM helpers (use existing #coalTooltip element) */
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

// ---------- main component ----------
export default function BunkersGrid({ blend = {}, coalDB = [], onOpenSingle = () => {} }) {
  const NUM = 8;

  // primary sources: window.SNAPSHOT_NORMALIZED (preferred) else blend
  const snapshot = (typeof window !== 'undefined' && window.SNAPSHOT_NORMALIZED) ? window.SNAPSHOT_NORMALIZED : null;

  // clientBunkers fallback order:
  // snapshot.clientBunkers -> snapshot.bunkers -> blend.bunkers -> empty
  const clientBunkers = useMemo(() => {
    if (snapshot && Array.isArray(snapshot.clientBunkers) && snapshot.clientBunkers.length === NUM) {
      return snapshot.clientBunkers;
    }
    if (snapshot && Array.isArray(snapshot.bunkers) && snapshot.bunkers.length === NUM) {
      return snapshot.bunkers;
    }
    if (Array.isArray(blend.bunkers) && blend.bunkers.length === NUM) {
      return blend.bunkers;
    }
    return Array.from({ length: NUM }).map(()=>({ layers: [] }));
  }, [snapshot, blend]);

  // flows: prefer blend.flows then snapshot.flows
  const flows = useMemo(() => {
    if (Array.isArray(blend.flows) && blend.flows.length === NUM) return blend.flows;
    if (snapshot && Array.isArray(snapshot.flows) && snapshot.flows.length === NUM) return snapshot.flows;
    return Array(NUM).fill('--');
  }, [blend, snapshot]);

  // initial timers: prefer snapshot.bunkerTimers[*].remainingSeconds, else top layer remainingSeconds
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
    // fallback: top layer remainingSeconds
    for (let i=0;i<NUM;i++) {
      const layers = clientBunkers[i] && Array.isArray(clientBunkers[i].layers) ? clientBunkers[i].layers : [];
      if (layers.length) {
        const top = layers[layers.length - 1];
        if (top && top.remainingSeconds != null) arr[i] = Number(top.remainingSeconds);
      }
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, clientBunkers]);

  // timers state (ticks every second)
  const [timers, setTimers] = useState(initialTimers);

  // reset timers when incoming initialTimers change
  useEffect(() => {
    setTimers(initialTimers);
  }, [initialTimers]);

  useEffect(() => {
    const id = setInterval(() => {
      setTimers(prev => {
        const next = prev.slice();
        let changed = false;
        for (let i=0;i<NUM;i++) {
          const v = next[i];
          if (v == null || !isFinite(v)) continue;
          if (v > 0) { next[i] = Math.max(0, v - 1); changed = true; }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // helpers
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
    // show name + timer (only). Timer will tick from `timers` state when available.
    const b = clientBunkers[idx] || { layers: [] };
    if (!b.layers || !b.layers.length) return '--';
    const next = b.layers[b.layers.length - 1]; // top-most
    const name = next && (next.coal || (next.coalDoc && next.coalDoc.coal)) ? (next.coal || next.coalDoc.coal) : '--';
    const secs = (timers && timers[idx] != null) ? timers[idx] : (next && (next.remainingSeconds != null ? next.remainingSeconds : (next.initialSeconds != null ? next.initialSeconds : null)));
    const timeStr = secs == null ? '--' : secondsToHHMMSS(secs);
    return timeStr;
  }

  // tooltip handler
  function onLayerHover(ev, L) {
    if (!L) return;
    const name = L.coal || (L.coalDoc && L.coalDoc.coal) || '--';
    const pct = (L.percent != null) ? (Number(L.percent).toFixed(3) + '%') : '--';
    const gcv = L.gcv != null ? L.gcv : (L.coalDoc && L.coalDoc.gcv ? L.coalDoc.gcv : '--');
    const cost = L.cost != null ? L.cost : (L.coalDoc && L.coalDoc.cost ? L.coalDoc.cost : '--');
    const aft = L.coalDoc ? Math.round(calcAFT(L.coalDoc)) : '--';
    const html = `<div style="font-weight:700;margin-bottom:6px">${name}</div>
                  <div style="font-size:12px">Percent: ${pct}</div>
                  <div style="font-size:12px">GCV: ${gcv}</div>
                  <div style="font-size:12px">Cost: ${cost}</div>
                  <div style="font-size:12px">AFT: ${aft}</div>`;
    showTooltipHtml(html, ev.pageX, ev.pageY);
  }

  // ensure small HMR/no-op
  useEffect(() => {}, [blend, coalDB, clientBunkers, timers]);

  // ------------------ Debug helpers (exposed on window) ------------------
  useEffect(() => {
    // helper: show first 2 bunkers layer metadata
    function dbg_showLayers() {
      try {
        const out = (window.LATEST_BLEND?.bunkers || []).slice(0,2).map((b,bi)=>({
          bunker: bi,
          layers: (b?.layers || []).slice(0,8).map((L,li)=>({
            idx: li,
            coal: L && (L.coal || (L.coalDoc && L.coalDoc.coal)) || null,
            color_field: (L && L.color) || (L && L.coalDoc && (L.coalDoc.color || L.coalDoc.colour)) || null,
            percent: (L && (L.percent ?? (L.percentages && L.percentages[0]) )) ?? null,
            initialSeconds: L && (L.initialSeconds || L.totalSeconds) || null,
            remainingSeconds: L && (L.remainingSeconds || null) || null
          }))
        }));
        console.log('DBG showLayers:', out);
        return out;
      } catch (e) { console.warn('dbg_showLayers failed', e); return null; }
    }

    // inspect SVG rects if present
    function dbg_inspectRects() {
      try {
        const rects = document.querySelectorAll('.bunker svg rect');
        const out = Array.from(rects).slice(0,24).map((r,i)=>({
          i,
          fillAttr: r.getAttribute('fill'),
          fillComputed: getComputedStyle(r).fill,
          heightAttr: r.getAttribute('height'),
          yAttr: r.getAttribute('y'),
          opacity: getComputedStyle(r).opacity
        }));
        console.log('DBG inspectRects count:', rects.length, out);
        return { count: rects.length, sample: out };
      } catch (e) { console.warn('dbg_inspectRects failed', e); return null; }
    }

    // inspect .bunker-layer div overlays
    function dbg_inspectDivs() {
      try {
        const divs = document.querySelectorAll('.bunker-layer, .bunker-layer-stack .bunker-layer');
        const out = Array.from(divs).slice(0,24).map((d,i)=>({
          i,
          bgStyleInline: d.style.background || null,
          bgComputed: getComputedStyle(d).backgroundColor,
          minHeight: getComputedStyle(d).minHeight,
          flexInline: d.style.flex || null,
          className: d.className
        }));
        console.log('DBG inspectDivs count:', divs.length, out);
        return { count: divs.length, sample: out };
      } catch (e) { console.warn('dbg_inspectDivs failed', e); return null; }
    }

    // inject a small palette + findCoalColor if missing
    function dbg_injectPalette() {
      try {
        window.DEFAULT_COAL_COLORS = window.DEFAULT_COAL_COLORS || ['#f39c12','#3498db','#2ecc71','#ef4444','#8b5cf6','#14b8a6','#f97316','#06b6d4'];
        if (typeof window.findCoalColor !== 'function') {
          window.findCoalColor = function(name, db) {
            try {
              if(!name) return window.DEFAULT_COAL_COLORS[0];
              const key = String(name).trim().toLowerCase();
              if (Array.isArray(db)) {
                const found = db.find(c => ((c.coal||c.name||'') + '').toString().trim().toLowerCase() === key || String(c._id||c.id) === String(name));
                if (found && (found.color || found.colour)) return found.color || found.colour;
              }
              let sum=0;
              for(let i=0;i<key.length;i++) sum = (sum*31 + key.charCodeAt(i)) >>> 0;
              return window.DEFAULT_COAL_COLORS[sum % window.DEFAULT_COAL_COLORS.length];
            } catch(e) { return window.DEFAULT_COAL_COLORS[0]; }
          };
        }
        console.log('DBG injected DEFAULT_COAL_COLORS and findCoalColor');
        return true;
      } catch (e) { console.warn('dbg_injectPalette failed', e); return false; }
    }

    // assign temporary colors to any layer lacking them (data mutation local to window.LATEST_BLEND)
    function dbg_forceColors() {
      try {
        const palette = (window.DEFAULT_COAL_COLORS && window.DEFAULT_COAL_COLORS.length) ? window.DEFAULT_COAL_COLORS : ['#ff6b6b','#51cf66','#339af0'];
        const B = window.LATEST_BLEND && window.LATEST_BLEND.bunkers ? window.LATEST_BLEND.bunkers : [];
        B.forEach((b,bi) => {
          (b.layers || []).forEach((L, li) => {
            if (L && !(L.color || (L.coalDoc && (L.coalDoc.color || L.coalDoc.colour)))) {
              L.color = palette[(bi + li) % palette.length];
            }
          });
        });
        console.log('DBG forced colors onto window.LATEST_BLEND (in-memory).');
        return true;
      } catch (e) { console.warn('dbg_forceColors failed', e); return false; }
    }

    // watch for findCoalColor being overwritten
    function dbg_watchFindCoalColor() {
      try {
        if(!window) return false;
        const name = 'findCoalColor';
        let last = window[name];
        Object.defineProperty(window, name, {
          configurable: true,
          enumerable: true,
          get() { return last; },
          set(v) { console.warn(`${name} overwritten`, v); last = v; }
        });
        console.log('DBG watcher installed for findCoalColor');
        return true;
      } catch(e){ console.warn('dbg_watchFindCoalColor failed', e); return false; }
    }

    // check for suspicious CSS rules that may hide fills
    function dbg_checkCSS() {
      try {
        const sheets = Array.from(document.styleSheets || []);
        const bad = [];
        sheets.forEach((ss,si) => {
          try {
            Array.from(ss.cssRules || []).forEach((r,ri) => {
              const txt = r.cssText || '';
              if (txt && (/rect|\.bunker-layer|\.bunker-layer-stack|svg/i).test(txt) && (/fill\s*:\s*transparent|opacity\s*:\s*0|background\s*:\s*transparent|visibility\s*:\s*hidden/).test(txt)) {
                bad.push({sheet: ss.href||`inline[${si}]`, rule: txt});
              }
            });
          } catch(e){}
        });
        console.log('DBG suspicious css rules:', bad.slice(0,20));
        return bad;
      } catch(e){ console.warn('dbg_checkCSS failed', e); return null; }
    }

    // force a visible fill color on any SVG rects (non-destructive; temporary)
    function dbg_forceFillRects() {
      try {
        const rects = document.querySelectorAll('.bunker svg rect');
        Array.from(rects).forEach((r,i) => r.setAttribute('fill', ['#ff6b6b','#51cf66','#339af0'][i % 3]));
        console.log('DBG forced fill colors on', rects.length, 'rects');
        return rects.length;
      } catch (e) { console.warn('dbg_forceFillRects failed', e); return 0; }
    }

    // dispatch blend update event to nudge legacy listeners
    function dbg_triggerBlendUpdate() {
      try {
        window.dispatchEvent(new CustomEvent('blend:updated', { detail: { blend: window.LATEST_BLEND } }));
        window.dispatchEvent(new CustomEvent('flows:update', { detail: { flows: (window.LATEST_BLEND && window.LATEST_BLEND.flows) || [] } }));
        if (typeof window.refreshAndRender === 'function') window.refreshAndRender('overview', 0, Number(localStorage.getItem('currentUnit') || 1));
        console.log('DBG dispatched blend:updated & flows:update and tried refreshAndRender');
        return true;
      } catch(e){ console.warn('dbg_triggerBlendUpdate failed', e); return false; }
    }

    // expose helpers
    try {
      window.__dbg_showLayers = dbg_showLayers;
      window.__dbg_inspectRects = dbg_inspectRects;
      window.__dbg_inspectDivs = dbg_inspectDivs;
      window.__dbg_injectPalette = dbg_injectPalette;
      window.__dbg_forceColors = dbg_forceColors;
      window.__dbg_watchFindCoalColor = dbg_watchFindCoalColor;
      window.__dbg_checkCSS = dbg_checkCSS;
      window.__dbg_forceFillRects = dbg_forceFillRects;
      window.__dbg_triggerBlendUpdate = dbg_triggerBlendUpdate;
      // quick log
      // eslint-disable-next-line no-console
      console.log('BunkersGrid debug helpers installed: call __dbg_showLayers(), __dbg_inspectRects(), __dbg_injectPalette(), etc.');
    } catch(e) {
      // ignore
    }

    // cleanup: we don't remove the helpers to allow console usage during dev
    return () => {};
  }, []); // run once on mount

  // ---------- render ----------
  return (
    <>
      <div className="bunkers-grid" id="bunkersGrid">
        {Array.from({ length: NUM }).map((_, idx) => {
          const layers = (clientBunkers && clientBunkers[idx] && Array.isArray(clientBunkers[idx].layers)) ? clientBunkers[idx].layers : [];

          // compute normalized flex values: if sumPercent > 0 use percent, else fallback to 1 per layer.
          const sumPct = layers.reduce((s,L) => s + (Number(L.percent)||0), 0);
          const flexVals = layers.map(L => {
            const raw = Number(L.percent) || 0;
            if (sumPct > 0) return raw / sumPct; // fraction of stack
            return 1 / Math.max(1, layers.length);
          });

          // timer for this bunker (displayed under Next Coal Batch row)
          const timerDisplay = nextBatchSummary(idx);

          return (
            <div key={idx} className="bunker" data-bunker={idx} onClick={() => onOpenSingle(idx)} style={{ position:'relative' }}>
              <svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid meet"></svg>
{ (layers && layers.length) ? (
  <svg
    viewBox="0 0 100 150"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 32,       // same space reserved for label as before
      height: '60%',
      width: '100%',
      display: 'block',
      overflow: 'visible', // clip is handled by clipPath
      pointerEvents: 'none' // let events pass through except on rects where we attach handlers
    }}
  >
    <defs>
      {/* bunker silhouette path — matches dashboard.js style */}
      <clipPath id={`bunkerClip-${idx}`}>
        <path d={`M10 10 L10 100 L45 140 L55 140 L90 100 L90 10 L10 10`} />
      </clipPath>
    </defs>

    {/* outline kept by existing SVGs or optional, but we leave it out so we don't duplicate strokes here.
        The rects are clipped so they will never overflow the silhouette. */}
    <g clipPath={`url(#bunkerClip-${idx})`} style={{ pointerEvents: 'auto' }}>
      {(() => {
        // geometry: match viewBox coordinates used in dashboard.js / earlier attempts
        const topY = 10;
        const bottomY = 140;
        const usableH = bottomY - topY; // 130 units tall
        // layers array order: index 0 = bottom, last = top (consistent with your flex column-reverse)
        let cum = 0; // cumulative height of previously-drawn bottom layers
        return layers.map((L, li) => {
          // fraction of total stack this layer gets (same as your flexVals)
          const frac = (flexVals && typeof flexVals[li] !== 'undefined') ? Number(flexVals[li]) : (1 / Math.max(1, layers.length));
          const fullH = usableH * frac;
          const yFullTop = bottomY - (cum + fullH); // y coordinate when full
          // compute displayed height: top layer may shrink with timers
          let displayedH = fullH;
          const topIndex = Math.max(0, layers.length - 1);
          if (li === topIndex) {
            // prefer timer in component state, else use layer.remainingSeconds
            const layerInitial = (L && (L.initialSeconds || L.totalSeconds)) ? Number(L.initialSeconds || L.totalSeconds) : null;
            const layerRemaining = (timers && typeof timers[idx] === 'number' && isFinite(timers[idx])) ? timers[idx] : (L && (L.remainingSeconds != null ? L.remainingSeconds : null));
            if (layerInitial != null && layerInitial > 0 && layerRemaining != null) {
              const fracRem = Math.max(0, Math.min(1, layerRemaining / layerInitial));
              displayedH = fullH * fracRem;
            }
          }
          // color priority unchanged
          const bg = (L && (L.color || (L.coalDoc && (L.coalDoc.color || L.coalDoc.colour)))) || 'transparent';
          // keep bottom edge fixed: shift y down by the amount the rect lost
          const y = yFullTop + (fullH - displayedH);

          // increase cumulative height for next (higher) layer
          cum += fullH;

          // Attach mouse handlers to rectangles; set pointerEvents so they catch hover
          return (
            <rect
              key={li}
              x={10}
              y={y}
              width={80}
              height={Math.max(0, displayedH)}
              fill={bg}
              opacity={0.95}
              stroke="rgba(0,0,0,0.03)"
              style={{ transition: 'height 0.9s linear, y 0.9s linear', pointerEvents: 'auto' }}
              onMouseEnter={(ev) => onLayerHover(ev, L)}
              onMouseMove={(ev) => moveTooltip(ev.pageX, ev.pageY)}
              onMouseLeave={() => hideTooltip()}
              data-coal-name={L && (L.coal || (L.coalDoc && L.coalDoc.coal)) || ''}
              data-coal-id={L && (L.coalId || (L.coalDoc && L.coalDoc._id)) || ''}
            />
          );
        });
      })()}
    </g>
  </svg>
) : null }


              {/* label moved slightly down for better spacing */}
              <div className="label" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: '6px', pointerEvents: 'none' }}>
                Coal Mill {String.fromCharCode(65 + idx)}
              </div>
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

      {/* Row: Next Coal Batch (shows only timer per your request) */}
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

      {/* Row: Estimated Generation (left blank for now) */}
      <div className="coal-flow-wrap">
        <div className="coal-flow-title">Estimated Generation (24h)</div>
        <div className="coal-flow-grid" id="estimatedGenGrid">
          {Array.from({ length: NUM }).map((_, idx) => (
            <div key={idx} className="coal-box" id={`estimatedGenBox-${idx}`} data-bunker={idx}>
              <div className="value">--</div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Row: Blend Composition (left blank / placeholder) */}
      <div className="coal-flow-wrap">
        <div className="coal-flow-title">Blend Composition</div>
        <div className="coal-flow-grid" id="blendCompGrid">
          {Array.from({ length: NUM }).map((_, idx) => (
            <div key={idx} className="coal-box" id={`blendCompBox-${idx}`} data-bunker={idx}>
              <div className="value small">--</div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}



//new

// src/components/BunkersGrid.jsx
import React, { useEffect, useMemo, useState } from 'react';

function secondsToHHMMSS(secondsRaw) {
  if (!isFinite(secondsRaw) || secondsRaw === null) return '--';
  const s = Math.max(0, Math.round(secondsRaw));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

/* simple AFT calc used in tooltip (same formula as server) */
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

/* tooltip DOM helpers (use existing #coalTooltip element) */
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

// ---------- main component ----------
export default function BunkersGrid({ blend = {}, coalDB = [], onOpenSingle = () => {} }) {
  const NUM = 8;
  const snapshot = (typeof window !== 'undefined' && window.SNAPSHOT_NORMALIZED) ? window.SNAPSHOT_NORMALIZED : null;

  // clientBunkers fallback order
  const clientBunkers = useMemo(() => {
    if (snapshot && Array.isArray(snapshot.clientBunkers) && snapshot.clientBunkers.length === NUM) {
      return snapshot.clientBunkers;
    }
    if (snapshot && Array.isArray(snapshot.bunkers) && snapshot.bunkers.length === NUM) {
      return snapshot.bunkers;
    }
    if (Array.isArray(blend.bunkers) && blend.bunkers.length === NUM) {
      return blend.bunkers;
    }
    return Array.from({ length: NUM }).map(()=>({ layers: [] }));
  }, [snapshot, blend]);

  // flows
  const flows = useMemo(() => {
    if (Array.isArray(blend.flows) && blend.flows.length === NUM) return blend.flows;
    if (snapshot && Array.isArray(snapshot.flows) && snapshot.flows.length === NUM) return snapshot.flows;
    return Array(NUM).fill('--');
  }, [blend, snapshot]);

  // initial timers
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

  // timers state
  const [timers, setTimers] = useState(initialTimers);
  useEffect(() => { setTimers(initialTimers); }, [initialTimers]);
  useEffect(() => {
    const id = setInterval(() => {
      setTimers(prev => {
        const next = prev.slice();
        let changed = false;
        for (let i=0;i<NUM;i++) {
          const v = next[i];
          if (v == null || !isFinite(v)) continue;
          if (v > 0) { next[i] = Math.max(0, v - 1); changed = true; }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ---------- helpers controlling percent + color ----------
  function parsePercent(L) {
    if (!L) return null;
    let raw = null;
    if (L.percent != null) raw = L.percent;
    else if (Array.isArray(L.percentages) && L.percentages.length) raw = L.percentages[0];
    if (raw == null) return null;
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (s.endsWith('%')) {
        const n = parseFloat(s.slice(0,-1));
        return Number.isFinite(n) ? n : null;
      }
      const n = parseFloat(s);
      if (!isFinite(n)) return null;
      return n <= 1 ? n * 100 : n;
    }
    if (typeof raw === 'number') {
      return raw <= 1 ? raw * 100 : raw;
    }
    return null;
  }

  function getLayerColor(L) {
    try {
      const explicit = (L && (L.color || (L.coalDoc && (L.coalDoc.color || L.coalDoc.colour))));
      if (explicit) return explicit;

      const name = L && (L.coal || (L.coalDoc && (L.coalDoc.coal)));
      const id = L && (L.coalId || (L.coalDoc && (L.coalDoc._id || L.coalDoc.id)));

      if (Array.isArray(coalDB) && coalDB.length) {
        if (id != null) {
          const foundById = coalDB.find(c => String(c._id || c.id) === String(id));
          if (foundById && (foundById.color || foundById.colour)) return foundById.color || foundById.colour;
        }
        if (name) {
          const key = String(name).trim().toLowerCase();
          const foundByName = coalDB.find(c => ((c.coal || c.name || '') + '').toString().trim().toLowerCase() === key);
          if (foundByName && (foundByName.color || foundByName.colour)) return foundByName.color || foundByName.colour;
        }
      }

      if (typeof window !== 'undefined' && typeof window.findCoalColor === 'function') {
        try {
          const col = window.findCoalColor(name || id, coalDB);
          if (col) return col;
        } catch (e) {}
      }

      const DEFAULT = (typeof window !== 'undefined' && window.DEFAULT_COAL_COLORS) ? window.DEFAULT_COAL_COLORS : ['#f39c12','#3498db','#2ecc71','#ef4444','#8b5cf6','#14b8a6','#f97316','#06b6d4'];
      const keyStr = String(name || id || 'default');
      let sum = 0;
      for (let i=0;i<keyStr.length;i++) sum = (sum * 31 + keyStr.charCodeAt(i)) >>> 0;
      return DEFAULT[sum % DEFAULT.length];
    } catch (e) {
      return 'transparent';
    }
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
    const name = next && (next.coal || (next.coalDoc && next.coalDoc.coal)) ? (next.coal || next.coalDoc.coal) : '--';
    const secs = (timers && timers[idx] != null) ? timers[idx] : (next && (next.remainingSeconds != null ? next.remainingSeconds : (next.initialSeconds != null ? next.initialSeconds : null)));
    const timeStr = secs == null ? '--' : secondsToHHMMSS(secs);
    return timeStr;
  }

  function onLayerHover(ev, L) {
    if (!L) return;
    const name = L.coal || (L.coalDoc && L.coalDoc.coal) || '--';
    const pct = (L.percent != null) ? (Number(L.percent).toFixed(3) + '%') : (Array.isArray(L.percentages) && L.percentages.length ? (Number(L.percentages[0]).toFixed(3) + '%') : '--');
    const gcv = L.gcv != null ? L.gcv : (L.coalDoc && L.coalDoc.gcv ? L.coalDoc.gcv : '--');
    const cost = L.cost != null ? L.cost : (L.coalDoc && L.coalDoc.cost ? L.coalDoc.cost : '--');
    const aft = L.coalDoc ? Math.round(calcAFT(L.coalDoc)) : '--';
    const html = `<div style="font-weight:700;margin-bottom:6px">${name}</div>
                  <div style="font-size:12px">Percent: ${pct}</div>
                  <div style="font-size:12px">GCV: ${gcv}</div>
                  <div style="font-size:12px">Cost: ${cost}</div>
                  <div style="font-size:12px">AFT: ${aft}</div>`;
    showTooltipHtml(html, ev.pageX, ev.pageY);
  }

  // ------------------ Debug helpers (exposed on window) ------------------
  useEffect(() => {
    function inspectAllBunkers() {
      const out = [];
      const grid = document.getElementById('bunkersGrid');
      for (let idx = 0; idx < NUM; idx++) {
        const bunkerEl = grid ? grid.querySelector(`.bunker[data-bunker="${idx}"]`) : null;
        const svg = bunkerEl ? bunkerEl.querySelector('svg[aria-hidden="true"]') : null;
        const defsClip = svg ? svg.querySelector(`#bunkerClip-${idx}`) : null;
        const clipPath = defsClip || (svg ? svg.querySelector('clipPath') : null);
        const clipPathUnits = clipPath ? (clipPath.getAttribute('clipPathUnits') || 'userSpaceOnUse (default)') : null;
        const path = clipPath ? clipPath.querySelector('path') : null;
        const rects = bunkerEl ? bunkerEl.querySelectorAll('rect') : [];
        const rectsArr = Array.from(rects).map((r, i) => {
          const attrs = {
            x: r.getAttribute('x'),
            y: r.getAttribute('y'),
            width: r.getAttribute('width'),
            height: r.getAttribute('height'),
            fillAttr: r.getAttribute('fill'),
            opacityAttr: r.getAttribute('opacity'),
            styleAttr: r.getAttribute('style')
          };
          const computed = r ? getComputedStyle(r) : null;
          const client = r ? r.getBoundingClientRect() : null;
          return { attrs, computedFill: computed ? computed.fill : null, clientRect: client ? { x: client.x, y: client.y, width: client.width, height: client.height } : null };
        });
        const layers = (clientBunkers && clientBunkers[idx] && Array.isArray(clientBunkers[idx].layers)) ? clientBunkers[idx].layers : [];
        const parsedPercents = layers.map(L => parsePercent(L));
        const sumPct = parsedPercents.reduce((s,p) => s + (p || 0), 0);
        const fracVals = layers.map((L, li) => {
          const pct = parsedPercents[li];
          if (sumPct > 0) return ((pct || 0) / sumPct);
          return 1 / Math.max(1, layers.length);
        });
        let viewBox = null, svgClient = null, vb = null, pxPerUnit = null;
        if (svg) {
          viewBox = svg.getAttribute('viewBox');
          svgClient = svg.getBoundingClientRect();
          if (viewBox) {
            const parts = viewBox.split(/\s+/).map(Number);
            if (parts.length === 4 && svgClient && svgClient.width > 0) {
              vb = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
              pxPerUnit = { x: svgClient.width / vb.w, y: svgClient.height / vb.h };
            }
          }
        }
        let pathD = null, pathBBox = null;
        if (path && typeof path.getBBox === 'function') {
          try {
            pathD = path.getAttribute('d');
            pathBBox = path.getBBox();
          } catch (e) {
            pathD = path.getAttribute('d');
            pathBBox = null;
          }
        }
        out.push({
          idx,
          svgExists: !!svg,
          viewBox,
          svgClientRect: svgClient,
          vb,
          pxPerUnit,
          clipPathUnits,
          clipPathPathD: pathD,
          clipPathBBox: pathBBox,
          rects: rectsArr,
          parsedPercents,
          sumPct,
          fracVals,
          layersPreview: layers.map((L, li) => ({ li, coal: L && (L.coal || (L.coalDoc && L.coalDoc.coal)), percentRaw: L && (L.percent ?? (L.percentages && L.percentages[0]) ), colorField: L && (L.color || (L.coalDoc && (L.coalDoc.color || L.coalDoc.colour))) }))
        });
      }
      return out;
    }

    function checkSuspiciousCSS() {
      const sheets = Array.from(document.styleSheets || []);
      const bad = [];
      sheets.forEach((ss,si) => {
        try {
          Array.from(ss.cssRules || []).forEach((r,ri) => {
            const txt = r.cssText || '';
            if (!txt) return;
            if (/rect|\.bunker|svg/i.test(txt) && /(fill\s*:\s*transparent|opacity\s*:\s*0|background\s*:\s*transparent|visibility\s*:\s*hidden|pointer-events\s*:\s*none)/.test(txt)) {
              bad.push({sheet: ss.href||`inline[${si}]`, rule: txt});
            }
          });
        } catch (e) {}
      });
      return bad;
    }

    function overlayClipPath(bunkerIdx = 0, color = 'magenta') {
      try {
        const grid = document.getElementById('bunkersGrid');
        const bunkerEl = grid ? grid.querySelector(`.bunker[data-bunker="${bunkerIdx}"]`) : null;
        const svg = bunkerEl ? bunkerEl.querySelector('svg[aria-hidden="true"]') : null;
        if (!svg) return { error: 'svg not found' };
        const clipPath = svg.querySelector(`#bunkerClip-${bunkerIdx}`) || svg.querySelector('clipPath');
        const path = clipPath ? clipPath.querySelector('path') : null;
        if (!path) return { error: 'path not found in clipPath' };
        const d = path.getAttribute('d');
        const vb = svg.getAttribute('viewBox');
        const svgRect = svg.getBoundingClientRect();
        let overlaySvg = document.getElementById('dbg-overlay-svg');
        if (!overlaySvg) {
          overlaySvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
          overlaySvg.setAttribute('id','dbg-overlay-svg');
          overlaySvg.style.position = 'absolute';
          overlaySvg.style.left = '0';
          overlaySvg.style.top = '0';
          overlaySvg.style.pointerEvents = 'none';
          overlaySvg.style.zIndex = '9999';
          overlaySvg.setAttribute('width', document.documentElement.scrollWidth);
          overlaySvg.setAttribute('height', document.documentElement.scrollHeight);
          document.body.appendChild(overlaySvg);
        }
        const p = document.createElementNS('http://www.w3.org/2000/svg','path');
        p.setAttribute('d', d);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', color);
        p.setAttribute('stroke-width', '2');
        const viewBoxParts = vb ? vb.split(/\s+/).map(Number) : [0,0,100,150];
        const vbX = viewBoxParts[0], vbY = viewBoxParts[1], vbW = viewBoxParts[2], vbH = viewBoxParts[3];
        const scaleX = svgRect.width / vbW;
        const scaleY = svgRect.height / vbH;
        const tx = svgRect.left;
        const ty = svgRect.top;
        const transform = `translate(${tx},${ty}) scale(${scaleX},${scaleY}) translate(${-vbX},${-vbY})`;
        p.setAttribute('transform', transform);
        const old = overlaySvg.querySelector(`#dbg-overlay-path-${bunkerIdx}`);
        if (old) overlaySvg.removeChild(old);
        p.setAttribute('id', `dbg-overlay-path-${bunkerIdx}`);
        overlaySvg.appendChild(p);
        return { ok: true, svgRect, viewBoxParts, transform };
      } catch (e) {
        return { error: e && (e.message || String(e)) };
      }
    }

    function dbgReportAll() {
      const all = inspectAllBunkers();
      console.group('BunkersGrid debug report');
      all.forEach(b => {
        console.group(`Bunker ${b.idx}`);
        console.log('svgExists:', b.svgExists, 'viewBox:', b.viewBox, 'svgClientRect:', b.svgClientRect);
        console.log('clipPathUnits:', b.clipPathUnits, 'clipPathPathD:', b.clipPathPathD, 'clipPathBBox:', b.clipPathBBox);
        console.log('parsedPercents:', b.parsedPercents, 'sumPct:', b.sumPct, 'fracVals:', b.fracVals);
        console.log('layersPreview:', b.layersPreview);
        b.rects.forEach((r,i) => {
          console.log(` rect[${i}] attrs:`, r.attrs, 'computedFill:', r.computedFill, 'clientRect:', r.clientRect);
        });
        console.groupEnd();
      });
      const suspicious = checkSuspiciousCSS();
      if (suspicious && suspicious.length) {
        console.warn('Suspicious CSS rules that may affect fills/clipping:', suspicious);
      } else {
        console.log('No suspicious CSS rules found (or CORS stylesheets prevented inspection).');
      }
      console.groupEnd();
      return all;
    }

    window.__dbg_inspectAllBunkers = inspectAllBunkers;
    window.__dbg_checkSuspiciousCSS = checkSuspiciousCSS;
    window.__dbg_overlayClipPath = overlayClipPath;
    window.__dbg_dbgReportAll = dbgReportAll;
    window.__dbg_parsePercent = parsePercent;
    window.__dbg_getLayerColor = getLayerColor;
    window.__dbg_printPercents = function() {
      const arr = [];
      for (let i=0;i<NUM;i++) {
        const layers = (clientBunkers && clientBunkers[i] && Array.isArray(clientBunkers[i].layers)) ? clientBunkers[i].layers : [];
        arr.push({ bunker: i, parsedPercents: layers.map(L => parsePercent(L)), sumPct: layers.map(L => parsePercent(L)).reduce((s,p) => s + (p||0),0) });
      }
      console.log('parsed percent summary:', arr);
      return arr;
    };
    window.__dbg_forceRectOverdraw = function(bunkerIdx = null) {
      const grid = document.getElementById('bunkersGrid');
      const rects = grid ? grid.querySelectorAll('.bunker rect') : [];
      Array.from(rects).forEach((r) => {
        const parent = r.closest('.bunker');
        const idxStr = parent && parent.getAttribute('data-bunker');
        const idx = idxStr != null ? Number(idxStr) : null;
        if (bunkerIdx == null || bunkerIdx === idx) {
          r.setAttribute('x', '-12');
          r.setAttribute('width', '128');
        }
      });
      return { ok: true, changed: rects.length };
    };

    console.log('BunkersGrid debug helpers installed:');
    console.log('  __dbg_dbgReportAll()');
    console.log('  __dbg_inspectAllBunkers()');
    console.log('  __dbg_printPercents()');
    console.log('  __dbg_getLayerColor(L)');
    console.log('  __dbg_checkSuspiciousCSS()');
    console.log('  __dbg_overlayClipPath(bunkerIdx, color)');
    console.log('  __dbg_forceRectOverdraw(bunkerIdx)');
  }, [clientBunkers, coalDB, timers]);

  // ---------- render ----------
  return (
    <>
      <div className="bunkers-grid" id="bunkersGrid">
        {Array.from({ length: NUM }).map((_, idx) => {
          const layers = (clientBunkers && clientBunkers[idx] && Array.isArray(clientBunkers[idx].layers)) ? clientBunkers[idx].layers : [];

          // parse percents (0..100) for each layer; treat missing as 0
          const parsedPercents = layers.map(L => parsePercent(L) || 0);
          const sumPct = parsedPercents.reduce((s,p) => s + (p || 0), 0);

          // geometry parameters
          const topY = 10;
          const bottomY = 140;
          const usableH = bottomY - topY; // 130 units tall

          // compute full heights in viewBox units for each layer:
          // - if sumPct === 0: equal split
          // - else if sumPct <= 100: treat each layer as absolute pct of bunker (usableH * pct/100)
          // - else (sumPct > 100): normalize proportionally to fit usableH (pct / sumPct * usableH)
          let fullHeights;
          if (layers.length === 0) {
            fullHeights = [];
          } else if (sumPct === 0) {
            fullHeights = layers.map(() => usableH / layers.length);
          } else if (sumPct <= 100) {
            fullHeights = parsedPercents.map(p => usableH * (p / 100));
          } else { // sumPct > 100
            fullHeights = parsedPercents.map(p => usableH * (p / sumPct));
          }

          return (
            <div key={idx} className="bunker" data-bunker={idx} onClick={() => onOpenSingle(idx)} style={{ position:'relative' }}>
              {/* legacy placeholder svg for compatibility */}
              <svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid meet"></svg>

{ (layers && layers.length) ? (
  <svg
    viewBox="0 0 100 150"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 32,
      height: '60%',
      width: '100%',
      display: 'block',
      overflow: 'visible',
      pointerEvents: 'none'
    }}
  >
    <defs>
      <clipPath id={`bunkerClip-${idx}`}>
        <path d={`M10 10 L10 100 L45 140 L55 140 L90 100 L90 10 L10 10`} />
      </clipPath>
    </defs>

    {/* fills — clipped to silhouette */}
    <g clipPath={`url(#bunkerClip-${idx})`} style={{ pointerEvents: 'auto' }}>
      {(() => {
        let cum = 0;
        return layers.map((L, li) => {
          const fullH = typeof fullHeights[li] === 'number' ? fullHeights[li] : 0;
          const yFullTop = bottomY - (cum + fullH);

          // top layer shrink by timer fraction (if applicable)
          let displayedH = fullH;
          const topIndex = Math.max(0, layers.length - 1);
          if (li === topIndex) {
            const layerInitial = (L && (L.initialSeconds || L.totalSeconds)) ? Number(L.initialSeconds || L.totalSeconds) : null;
            const layerRemaining = (timers && typeof timers[idx] === 'number' && isFinite(timers[idx])) ? timers[idx] : (L && (L.remainingSeconds != null ? L.remainingSeconds : null));
            if (layerInitial != null && layerInitial > 0 && layerRemaining != null) {
              const fracRem = Math.max(0, Math.min(1, layerRemaining / layerInitial));
              displayedH = fullH * fracRem;
            }
          }

          const bg = getLayerColor(L) || 'transparent';

          // slightly larger overdraw so fill reaches under stroke
          const x = -12;
          const width = 128;

          const y = yFullTop + (fullH - displayedH);
          cum += fullH;

          return (
            <rect
              key={li}
              x={x}
              y={y}
              width={width}
              height={Math.max(0, displayedH)}
              fill={bg}
              opacity={0.95}
              stroke="rgba(0,0,0,0.03)"
              style={{ transition: 'height 0.9s linear, y 0.9s linear', pointerEvents: 'auto' }}
              onMouseEnter={(ev) => onLayerHover(ev, L)}
              onMouseMove={(ev) => moveTooltip(ev.pageX, ev.pageY)}
              onMouseLeave={() => hideTooltip()}
              data-coal-name={L && (L.coal || (L.coalDoc && L.coalDoc.coal)) || ''}
              data-coal-id={L && (L.coalId || (L.coalDoc && L.coalDoc._id)) || ''}
            />
          );
        });
      })()}
    </g>

    {/* Outline drawn after fills so stroke sits on top (prevents visible white seam).
        vectorEffect non-scaling keeps stroke thickness visually consistent when SVG scales. */}
    <path
      d={`M10 10 L10 100 L45 140 L55 140 L90 100 L90 10 L10 10`}
      fill="none"
      stroke="rgba(0,0,0,0.9)"
      strokeWidth="3"
      strokeLinejoin="round"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      style={{ pointerEvents: 'none' }}
    />
  </svg>
) : null }

              <div className="label" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: '6px', pointerEvents: 'none' }}>
                Coal Mill {String.fromCharCode(65 + idx)}
              </div>
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

      {/* Row: Next Coal Batch */}
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
              <div className="value">--</div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Row: Blend Composition */}
      <div className="coal-flow-wrap">
        <div className="coal-flow-title">Blend Composition</div>
        <div className="coal-flow-grid" id="blendCompGrid">
          {Array.from({ length: NUM }).map((_, idx) => (
            <div key={idx} className="coal-box" id={`blendCompBox-${idx}`} data-bunker={idx}>
              <div className="value small">--</div>
              <div className="label">Coal Mill {String.fromCharCode(65 + idx)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// small helper
function safeFmt(v) {
  if (v === null || typeof v === 'undefined') return '--';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '--';
  return v;
}
