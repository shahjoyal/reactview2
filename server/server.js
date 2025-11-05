// server.js (ESM) - Blend dashboard backend (includes submit + unit retrieval with timers)
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import xlsx from 'xlsx';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// static files (put dashboard.js / index.html / input.html etc. in ./public)
app.use(express.static(path.join(__dirname, 'public')));

// // root (serve login or input)
// app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// require MONGO_URI
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in .env');
  process.exit(1);
}

// connect to MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=>console.log('✅ MongoDB connected'))
  .catch(err => { console.error('MongoDB connection error:', err); process.exit(1); });

/* -------------------- Schemas / Models -------------------- */
const CoalSchema = new mongoose.Schema({
  coal: String, SiO2: Number, Al2O3: Number, Fe2O3: Number, CaO: Number, MgO: Number,
  Na2O: Number, K2O: Number, TiO2: Number, SO3: Number, P2O5: Number, Mn3O4: Number,
  SulphurS: Number, gcv: Number, cost: Number, color: String
}, { collection: 'coals' });
const Coal = mongoose.model('Coal', CoalSchema);

const RowSchema = new mongoose.Schema({
  coal: { type: mongoose.Schema.Types.Mixed },
  percentages: [Number],
  gcv: Number,
  cost: Number
}, { _id: false });

const BlendSchema = new mongoose.Schema({
  rows: [RowSchema],
  flows: [Number],
  generation: Number,
  bunkers: [{
    layers: [{
      rowIndex: Number,
      coal: String,
      percent: Number,
      gcv: Number,
      cost: Number,
      color: String,
      timer: { type: String, default: '00:00:00' }
    }]
  }],
  bunkerCapacity: { type: Number, default: 0 },
  bunkerCapacities: { type: [Number], default: [] },
  totalFlow: { type: Number, default: 0 },
  avgGCV: { type: Number, default: 0 },
  avgAFT: { type: Number, default: null },
  heatRate: { type: Number, default: null },
  costRate: { type: Number, default: 0 },
  aftPerMill: { type: [Number], default: [] },
  blendedGCVPerMill: { type: [Number], default: [] },
  createdAt: { type: Date, default: Date.now }
});
const Blend = mongoose.model('Blend', BlendSchema);

/* -------------------- dynamic per-unit model helper -------------------- */
const unitModelCache = {};
function getUnitModel(unit) {
  const u = Number(unit);
  if (![1,2,3].includes(u)) throw new Error('invalid unit');
  const collName = `unit${u}`;
  const modelName = `Unit_${collName}`;
  if (mongoose.models[modelName]) return mongoose.models[modelName];
  const UnitSchema = new mongoose.Schema({
    blendId: mongoose.Schema.Types.ObjectId,
    snapshot: mongoose.Schema.Types.Mixed,
    savedAt: Date
  }, { collection: collName });
  const M = mongoose.model(modelName, UnitSchema);
  unitModelCache[collName] = M;
  return M;
}

/* -------------------- Utilities (AFT + computeBlendMetrics) -------------------- */
function calcAFT(ox) {
  const total = Object.keys(ox || {}).reduce((s,k) => s + (Number(ox[k])||0), 0);
  if (total === 0) return 0;
  const SiO2 = Number(ox.SiO2)||0, Al2O3 = Number(ox.Al2O3)||0, Fe2O3 = Number(ox.Fe2O3)||0;
  const CaO = Number(ox.CaO)||0, MgO = Number(ox.MgO)||0, Na2O = Number(ox.Na2O)||0;
  const K2O = Number(ox.K2O)||0, SO3 = Number(ox.SO3)||0, TiO2 = Number(ox.TiO2)||0;
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

/**
 * computeBlendMetrics(rows, flows, generation, coalColorMap = {})
 * - rows: normalized rows (percentages array)
 * - flows: flows array (length 8)
 * - generation: numeric
 * - coalColorMap: optional mapping id/name -> color (applied to bunkers)
 */
async function computeBlendMetrics(rows, flows, generation, coalColorMap = {}) {
  const oxKeys = ["SiO2","Al2O3","Fe2O3","CaO","MgO","Na2O","K2O","SO3","TiO2"];
  const allCoals = await Coal.find().lean();
  const byId = {}, byNameLower = {};
  allCoals.forEach(c => { if (c._id) byId[String(c._id)] = c; if (c.coal) byNameLower[String(c.coal).toLowerCase()] = c; });

  function findCoalRef(ref) {
    if (!ref) return null;
    if (byId[String(ref)]) return byId[String(ref)];
    const lower = String(ref).toLowerCase();
    if (byNameLower[lower]) return byNameLower[lower];
    return null;
  }

  function coalRefForRowAndMill(row, mill) {
    if (!row) return null;
    if (row.coal && typeof row.coal === 'object') return row.coal[String(mill)] || '';
    return row.coal || '';
  }

  const blendedGCVPerMill = [];
  const aftPerMill = [];

  for (let m = 0; m < 8; m++) {
    let blendedGCV = 0;
    const ox = {}; oxKeys.forEach(k => ox[k] = 0);

    for (let i = 0; i < (rows ? rows.length : 0); i++) {
      const row = rows[i] || {};
      const perc = (Array.isArray(row.percentages) && row.percentages[m]) ? Number(row.percentages[m]) : 0;
      const weight = perc / 100;
      const coalRef = coalRefForRowAndMill(row, m);
      const coalDoc = findCoalRef(coalRef);
      const gcvVal = (row.gcv !== undefined && row.gcv !== null && row.gcv !== '') ? Number(row.gcv) : (coalDoc ? (Number(coalDoc.gcv) || 0) : 0);
      blendedGCV += gcvVal * weight;
      if (coalDoc) oxKeys.forEach(k => { ox[k] += (Number(coalDoc[k]) || 0) * weight; });
      else oxKeys.forEach(k => {
        if (row[k] !== undefined && row[k] !== null && row[k] !== '') ox[k] += (Number(row[k]) || 0) * weight;
      });
    }

    blendedGCVPerMill.push(Number(blendedGCV));
    const oxTotal = Object.values(ox).reduce((s, v) => s + (Number(v) || 0), 0);
    const aftVal = (oxTotal === 0) ? null : Number(calcAFT(ox));
    aftPerMill.push(aftVal);
  }

  // totals & weighted averages using flows
  let totalFlow = 0, weightedGCV = 0, weightedAFT = 0, contributedAFTFlow = 0;
  for (let m = 0; m < 8; m++) {
    const flow = (Array.isArray(flows) && flows[m]) ? Number(flows[m]) : 0;
    totalFlow += flow;
    weightedGCV += flow * (blendedGCVPerMill[m] || 0);
    const aftVal = aftPerMill[m];
    if (aftVal !== null && !isNaN(aftVal)) { weightedAFT += flow * aftVal; contributedAFTFlow += flow; }
  }
  const avgGCV = totalFlow > 0 ? (weightedGCV / totalFlow) : 0;
  const avgAFT = contributedAFTFlow > 0 ? (weightedAFT / contributedAFTFlow) : null;
  const heatRate = (generation && generation > 0 && totalFlow > 0) ? ((totalFlow * avgGCV) / generation) : null;

  // qty & cost per row
  function rowQtySum(row) { if (!row || !Array.isArray(row.percentages)) return 0; return row.percentages.reduce((s, v) => s + (Number(v) || 0), 0); }
  const qtyPerRow = (rows || []).map(rowQtySum);
  const costPerRow = (rows || []).map(r => {
    if (r && r.cost !== undefined && r.cost !== null && r.cost !== '') return Number(r.cost) || 0;
    const cdoc = findCoalRef((r || {}).coal);
    return cdoc ? (Number(cdoc.cost) || 0) : 0;
  });
  let totalCost = 0, totalQty = 0;
  for (let i = 0; i < qtyPerRow.length; i++) { totalCost += (qtyPerRow[i] || 0) * (costPerRow[i] || 0); totalQty += (qtyPerRow[i] || 0); }
  const costRate = totalQty > 0 ? (totalCost / totalQty) : 0;

  // build bunkers array (layers + color)
  const bunkers = [];
  for (let m = 0; m < 8; m++) {
    const layers = [];
    for (let rIdx = 0; rIdx < (rows || []).length; rIdx++) {
      const row = rows[rIdx];
      const pct = (Array.isArray(row.percentages) && row.percentages[m]) ? Number(row.percentages[m]) : 0;
      if (!pct || pct <= 0) continue;
      const coalRef = coalRefForRowAndMill(row, m);
      const coalDoc = findCoalRef(coalRef);
      // color preference: coalColorMap (by id or name) -> coalDoc.color -> row.color
      let color = null;
      if (coalColorMap) {
        const key1 = String(coalRef || '');
        if (coalColorMap[key1]) color = coalColorMap[key1];
        const key2 = (coalDoc && coalDoc._id) ? String(coalDoc._id) : null;
        if (!color && key2 && coalColorMap[key2]) color = coalColorMap[key2];
      }
      if (!color && coalDoc) color = coalDoc.color || coalDoc.colour || null;
      if (!color && row && row.color) color = row.color;

      layers.push({
        rowIndex: rIdx + 1,
        coal: coalDoc ? coalDoc.coal : (coalRef || ''),
        percent: Number(pct),
        gcv: coalDoc ? (Number(coalDoc.gcv) || Number(row.gcv || 0)) : Number(row.gcv || 0),
        cost: coalDoc ? (Number(coalDoc.cost) || Number(row.cost || 0)) : Number(row.cost || 0),
        color: color || null
      });
    }
    bunkers.push({ layers });
  }

  return {
    totalFlow: Number(totalFlow),
    avgGCV: Number(avgGCV),
    avgAFT: (avgAFT === null ? null : Number(avgAFT)),
    heatRate: (heatRate === null ? null : Number(heatRate)),
    costRate: Number(costRate),
    aftPerMill: aftPerMill.map(v => (v === null ? null : Number(v))),
    blendedGCVPerMill: blendedGCVPerMill.map(v => Number(v)),
    bunkers
  };
}

/* -------------------- Upload Excel -> coals -------------------- */
const storage = multer.memoryStorage();
const upload = multer({ storage });
app.post('/api/upload-coal', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
    const coalData = jsonData.map(item => ({
      coal: item['Coal'] || item['coal'] || item['Name'] || '',
      SiO2: item['SiO2'] || item['SiO₂'] || 0,
      Al2O3: item['Al2O3'] || item['Al₂O₃'] || 0,
      Fe2O3: item['Fe2O3'] || item['Fe₂O₃'] || 0,
      CaO: item['CaO'] || 0, MgO: item['MgO'] || 0, Na2O: item['Na2O'] || 0,
      K2O: item['K2O'] || 0, TiO2: item['TiO2'] || 0, SO3: item['SO3'] || 0,
      P2O5: item['P2O5'] || 0, Mn3O4: item['Mn3O4'] || 0,
      SulphurS: item['Sulphur'] || item['SulphurS'] || 0,
      gcv: item['GCV'] || item['gcv'] || 0,
      cost: item['Cost'] || item['cost'] || 0,
      color: item['Color'] || item['color'] || item['hex'] || ''
    }));
    await Coal.deleteMany();
    if (coalData.length) await Coal.insertMany(coalData);
    return res.json({ message: 'Coal data uploaded' });
  } catch (err) {
    console.error('Error uploading coal data:', err);
    return res.status(500).json({ error: 'Failed to process Excel file' });
  }
});

/* -------------------- Coal endpoints -------------------- */
app.get('/api/coal', async (req, res) => {
  try { const items = await Coal.find().lean(); return res.json(items); }
  catch (err) { console.error('GET /api/coal error:', err); return res.status(500).json({ error: err.message || 'Server error' }); }
});
app.get('/api/coal/count', async (req, res) => {
  try { const c = await Coal.countDocuments(); return res.json({ count: c }); } catch (err) { return res.status(500).json({ error: err.message || 'Server error' }); }
});

/* -------------------- Blend endpoints (create / update / latest / by id) -------------------- */
app.post('/api/blend', async (req, res) => {
  try {
    const { rows, flows, generation, bunkerCapacity, bunkerCapacities, clientBunkers } = req.body;
    if (!Array.isArray(rows) || !Array.isArray(flows)) return res.status(400).json({ error: 'rows[] and flows[] required' });

    // normalize rows -> names where possible
    const allCoals = await Coal.find().lean();
    const byId = {}, byNameLower = {};
    allCoals.forEach(c => { if (c._id) byId[String(c._id)] = c; if (c.coal) byNameLower[String(c.coal).toLowerCase()] = c; });

    function resolveRowCoalField(row) {
      if (!row) return row;
      const copy = Object.assign({}, row);
      if (copy.coal && typeof copy.coal === 'object') {
        const newMap = {};
        Object.keys(copy.coal).forEach(k => {
          const ref = copy.coal[k];
          if (ref && byId[ref]) newMap[k] = byId[ref].coal;
          else if (ref && byNameLower[String(ref).toLowerCase()]) newMap[k] = byNameLower[String(ref).toLowerCase()].coal;
          else newMap[k] = ref || '';
        });
        copy.coal = newMap;
      } else {
        const ref = copy.coal ? String(copy.coal) : '';
        if (ref) {
          if (byId[ref]) copy.coal = byId[ref].coal;
          else if (byNameLower[ref.toLowerCase()]) copy.coal = byNameLower[ref.toLowerCase()].coal;
        }
      }
      copy.percentages = Array.isArray(copy.percentages) ? copy.percentages.map(v => Number(v) || 0) : Array(8).fill(0);
      copy.gcv = (copy.gcv !== undefined && copy.gcv !== null) ? Number(copy.gcv) : 0;
      copy.cost = (copy.cost !== undefined && copy.cost !== null) ? Number(copy.cost) : 0;
      return copy;
    }

    const rowsToSave = (rows || []).map(row => resolveRowCoalField(row));
    const metrics = await computeBlendMetrics(rowsToSave, flows, generation);

    // merge client timers into metrics.bunkers if client posted clientBunkers
    if (req.body && Array.isArray(req.body.clientBunkers)) {
      const clientB = req.body.clientBunkers;
      for (let bi = 0; bi < Math.min(metrics.bunkers.length, clientB.length); bi++) {
        const mB = metrics.bunkers[bi];
        const cB = clientB[bi];
        if (!mB || !Array.isArray(mB.layers) || !cB || !Array.isArray(cB.layers)) continue;
        const clientMap = {};
        cB.layers.forEach(l => { if (l && l.rowIndex !== undefined) clientMap[Number(l.rowIndex)] = l; });
        mB.layers.forEach(layer => {
          if (!layer || layer.rowIndex === undefined) return;
          const key = Number(layer.rowIndex);
          if (clientMap[key] && clientMap[key].timer) layer.timer = clientMap[key].timer;
          else if (clientMap[key] && clientMap[key].rawSeconds != null && isFinite(clientMap[key].rawSeconds)) {
            const s = Math.max(0, Math.round(clientMap[key].rawSeconds));
            const hh = String(Math.floor(s / 3600)).padStart(2, '0');
            const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
            const ss = String(s % 60).padStart(2, '0');
            layer.timer = `${hh}:${mm}:${ss}`;
          }
        });
      }
    }

    const doc = new Blend(Object.assign({}, {
      rows: rowsToSave,
      flows,
      generation,
      bunkerCapacity: Number(bunkerCapacity) || 0,
      bunkerCapacities: Array.isArray(bunkerCapacities) ? bunkerCapacities.map(v => Number(v || 0)) : [],
      bunkers: metrics.bunkers || []
    }, metrics));

    await doc.save();
    return res.status(201).json({ message: 'Saved', id: doc._id });
  } catch (err) {
    console.error('POST /api/blend error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/blend/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows, flows, generation, bunkerCapacity, bunkerCapacities, clientBunkers } = req.body;
    if (!Array.isArray(rows) || !Array.isArray(flows)) return res.status(400).json({ error: 'rows[] and flows[] required' });

    const allCoals = await Coal.find().lean();
    const byId = {}, byNameLower = {};
    allCoals.forEach(c => { if (c._id) byId[String(c._id)] = c; if (c.coal) byNameLower[String(c.coal).toLowerCase()] = c; });

    function resolveRowCoalField(row) {
      if (!row) return row;
      const copy = Object.assign({}, row);
      if (copy.coal && typeof copy.coal === 'object') {
        const newMap = {};
        Object.keys(copy.coal).forEach(k => {
          const ref = copy.coal[k];
          if (ref && byId[ref]) newMap[k] = byId[ref].coal;
          else if (ref && byNameLower[String(ref).toLowerCase()]) newMap[k] = byNameLower[String(ref).toLowerCase()].coal;
          else newMap[k] = ref || '';
        });
        copy.coal = newMap;
      } else {
        const ref = copy.coal ? String(copy.coal) : '';
        if (ref) {
          if (byId[ref]) copy.coal = byId[ref].coal;
          else if (byNameLower[ref.toLowerCase()]) copy.coal = byNameLower[ref.toLowerCase()].coal;
        }
      }
      copy.percentages = Array.isArray(copy.percentages) ? copy.percentages.map(v => Number(v) || 0) : Array(8).fill(0);
      copy.gcv = (copy.gcv !== undefined && copy.gcv !== null) ? Number(copy.gcv) : 0;
      copy.cost = (copy.cost !== undefined && copy.cost !== null) ? Number(copy.cost) : 0;
      return copy;
    }

    const rowsToSave = (rows || []).map(row => resolveRowCoalField(row));
    const metrics = await computeBlendMetrics(rowsToSave, flows, generation);

    // merge client timers if provided (same logic as POST)
    if (Array.isArray(clientBunkers)) {
      for (let bi = 0; bi < Math.min(metrics.bunkers.length, clientBunkers.length); bi++) {
        const mB = metrics.bunkers[bi], cB = clientBunkers[bi];
        if (!mB || !Array.isArray(mB.layers) || !cB || !Array.isArray(cB.layers)) continue;
        const clientMap = {}; cB.layers.forEach(l => { if (l && l.rowIndex !== undefined) clientMap[Number(l.rowIndex)] = l; });
        mB.layers.forEach(layer => {
          if (!layer || layer.rowIndex === undefined) return;
          const key = Number(layer.rowIndex);
          if (clientMap[key] && clientMap[key].timer) layer.timer = clientMap[key].timer;
          else if (clientMap[key] && clientMap[key].rawSeconds != null && isFinite(clientMap[key].rawSeconds)) {
            const s = Math.max(0, Math.round(clientMap[key].rawSeconds));
            const hh = String(Math.floor(s / 3600)).padStart(2, '0');
            const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
            const ss = String(s % 60).padStart(2, '0');
            layer.timer = `${hh}:${mm}:${ss}`;
          }
        });
      }
    }

    const updated = await Blend.findByIdAndUpdate(id, Object.assign({}, {
      rows: rowsToSave,
      flows,
      generation,
      bunkerCapacity: Number(bunkerCapacity) || 0,
      bunkerCapacities: Array.isArray(bunkerCapacities) ? bunkerCapacities.map(v => Number(v || 0)) : [],
      bunkers: metrics.bunkers || []
    }, metrics), { new: true });

    if (!updated) return res.status(404).json({ error: 'Blend not found' });
    return res.json({ message: 'Updated', id: updated._id });
  } catch (err) {
    console.error('PUT /api/blend/:id error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});


/* -------------------- GET blend by id / latest -------------------- */
app.get('/api/blend/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (id === 'latest') {
      const latest = await Blend.findOne().sort({ createdAt: -1 }).lean();
      if (!latest) return res.status(404).json({ error: 'No blends found' });
      return res.json(latest);
    }
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid blend id' });
    const doc = await Blend.findById(id).lean();
    if (!doc) return res.status(404).json({ error: 'Blend not found' });
    return res.json(doc);
  } catch (err) {
    console.error('GET /api/blend/:id error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.get('/api/blend/latest', async (req, res) => {
  try {
    const latest = await Blend.findOne().sort({ createdAt: -1 }).lean();
    if (!latest) return res.status(404).json({ error: 'No blends found' });
    return res.json(latest);
  } catch (err) {
    console.error('GET /api/blend/latest error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* -------------------- Submit unit: saves Blend + snapshot (with timers) -------------------- */
app.post('/api/submit/:unit', async (req, res) => {
  try {
    const unit = Number(req.params.unit || 0);
    if (![1,2,3].includes(unit)) return res.status(400).json({ error: 'unit must be 1, 2 or 3' });

    const { rows, flows, generation, bunkerCapacity, bunkerCapacities, clientBunkers, coalColorMap, clientSavedAt } = req.body;
    if (!Array.isArray(rows) || !Array.isArray(flows)) return res.status(400).json({ error: 'Invalid payload: rows[] and flows[] required' });

    const rowsSan = (rows || []).map(r => {
      const copy = Object.assign({}, r);
      copy.percentages = Array.isArray(r.percentages) ? r.percentages.map(v => Number(v)||0) : [];
      copy.gcv = (copy.gcv !== undefined && copy.gcv !== null) ? Number(copy.gcv) : 0;
      copy.cost = (copy.cost !== undefined && copy.cost !== null) ? Number(copy.cost) : 0;
      return copy;
    });

    const metrics = await computeBlendMetrics(rowsSan, flows, generation, coalColorMap || {});
    const blendDoc = new Blend(Object.assign({}, {
      rows: rowsSan,
      flows,
      generation,
      bunkerCapacity: Number(bunkerCapacity) || 0,
      bunkerCapacities: Array.isArray(bunkerCapacities) ? bunkerCapacities.map(v => Number(v||0)) : [],
      bunkers: metrics.bunkers || []
    }, metrics));
    await blendDoc.save();

    // Build snapshot and compute initialSeconds per bunker and per layer
    const snapshot = {
      rows: rowsSan,
      flows,
      generation,
      bunkerCapacity: Number(bunkerCapacity) || 0,
      bunkerCapacities: Array.isArray(bunkerCapacities) ? bunkerCapacities.map(v => Number(v||0)) : [],
      clientBunkers: clientBunkers || [],
      metrics,
      coalColorMap: coalColorMap || {}
    };

    // compute timers: initialSeconds per layer & per bunker
    const bc = Number(snapshot.bunkerCapacity || 0);
    snapshot.bunkerTimers = [];
    for (let m = 0; m < 8; m++) {
      const flow = (Array.isArray(snapshot.flows) && snapshot.flows[m]) ? Number(snapshot.flows[m]) : 0;
      const bunker = { initialSeconds: null, layers: [] };
      const layerList = (snapshot.clientBunkers && snapshot.clientBunkers[m] && Array.isArray(snapshot.clientBunkers[m].layers))
        ? snapshot.clientBunkers[m].layers : [];

      // total percent of bunker
      const totalPct = layerList.reduce((s, L) => s + (Number(L.percent) || 0), 0);
      if (flow > 0 && bc > 0) {
        bunker.initialSeconds = totalPct > 0 ? ((totalPct / 100) * bc / flow * 3600) : 0;
      } else {
        bunker.initialSeconds = null;
      }

      for (let li = 0; li < layerList.length; li++) {
        const layer = layerList[li];
        const pct = Number(layer.percent || 0);
        let initialSeconds = null;
        if (flow > 0 && bc > 0 && pct > 0) {
          initialSeconds = (pct / 100) * bc / flow * 3600;
        }
        bunker.layers.push(Object.assign({}, layer, { initialSeconds }));
      }
      snapshot.bunkerTimers.push(bunker);
    }

    // savedAt
    let savedAt;
    if (clientSavedAt) {
      const parsed = new Date(clientSavedAt);
      savedAt = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else savedAt = new Date();

    const UnitModel = getUnitModel(unit);
    const docToSave = { blendId: blendDoc._id, snapshot, savedAt };
    // replaceOne to keep single doc per collection
    await UnitModel.replaceOne({}, docToSave, { upsert: true });

    return res.status(201).json({ message: 'Unit submitted', unit, blendId: String(blendDoc._id) });
  } catch (err) {
    console.error('POST /api/submit/:unit error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* -------------------- GET unit: returns snapshot with remaining time adjusted by elapsed (sequential drain) ------------ */
app.get('/api/unit/:unit', async (req, res) => {
  try {
    const unit = Number(req.params.unit || 0);
    if (![1,2,3].includes(unit)) return res.status(400).json({ error: 'unit must be 1, 2 or 3' });
    const UnitModel = getUnitModel(unit);
    const unitDoc = await UnitModel.findOne({}).lean();
    if (!unitDoc) return res.status(404).json({ error: 'No submission stored for this unit' });

    // deep-copy to avoid mutating DB object
    const copy = JSON.parse(JSON.stringify(unitDoc));

    // authoritative timestamp: prefer savedAt, then updatedAt, then createdAt, then now
    const savedAt = copy.savedAt ? new Date(copy.savedAt)
                  : (copy.updatedAt ? new Date(copy.updatedAt)
                  : (copy.createdAt ? new Date(copy.createdAt) : new Date()));
    const now = new Date();
    const elapsedSinceSaved = Math.max(0, (now.getTime() - savedAt.getTime()) / 1000);

    if (copy.snapshot && Array.isArray(copy.snapshot.bunkerTimers)) {
      const bc = Number(copy.snapshot.bunkerCapacity || 0);
      const flows = Array.isArray(copy.snapshot.flows) ? copy.snapshot.flows : Array(8).fill(0);
      copy.snapshot.clientBunkers = Array.isArray(copy.snapshot.clientBunkers)
        ? copy.snapshot.clientBunkers
        : Array(8).fill(null).map(()=>({ layers: [] }));

      const maxLoop = Math.max(8, (copy.snapshot.bunkerTimers || []).length);
      for (let m = 0; m < maxLoop; m++) {
        const btimer = (copy.snapshot.bunkerTimers && copy.snapshot.bunkerTimers[m]) ? copy.snapshot.bunkerTimers[m] : null;
        const flow = Number((flows && flows[m]) ? flows[m] : 0);
        const layerList = (copy.snapshot.clientBunkers && copy.snapshot.clientBunkers[m] && Array.isArray(copy.snapshot.clientBunkers[m].layers))
          ? copy.snapshot.clientBunkers[m].layers
          : [];

        // Pre-create bunkerTimers entry/structure if missing so we can write back
        if (!copy.snapshot.bunkerTimers) copy.snapshot.bunkerTimers = [];
        if (!copy.snapshot.bunkerTimers[m]) copy.snapshot.bunkerTimers[m] = {};
        if (!Array.isArray(copy.snapshot.bunkerTimers[m].layers)) copy.snapshot.bunkerTimers[m].layers = [];

        // SEQUENTIAL draining: consume elapsedSinceSaved from bottom layer upwards.
        // Assumes layerList[0] is visual bottom, layerList[1] above it, etc.
        // For each layer we prefer to use initialSeconds from btimer.layers[*].initialSeconds if present,
        // otherwise compute initialSeconds from percent -> seconds formula (percent of bunkerCapacity / flow * 3600).
        let remainingElapsed = elapsedSinceSaved;

        for (let li = 0; li < layerList.length; li++) {
          const layer = layerList[li] || {};
          const btLayer = (btimer && Array.isArray(btimer.layers) && btimer.layers[li]) ? btimer.layers[li] : null;

          // initialPercent from clientBunkers.layers (treated as percent at savedAt if no btLayer values)
          const initialPercent = Number(layer.percent || layer.initialPercent || 0);

          // compute base computedInit if we need to derive from percent
          const computedInit = (flow > 0 && bc > 0 && initialPercent > 0)
            ? (initialPercent / 100) * bc / flow * 3600
            : 0;

          // Prefer explicit initialSeconds stored in btimer.layers; else use computedInit
          const initSecFromBtimer = (btLayer && btLayer.initialSeconds != null) ? Number(btLayer.initialSeconds) : null;
          const initSec = (initSecFromBtimer != null) ? Number(initSecFromBtimer) : (computedInit > 0 ? Number(computedInit) : 0);

          // defaults
          let remainingSeconds = 0;
          let remainingPercent = 0;

          if (!isFinite(initSec) || initSec <= 0) {
            // empty or cannot compute -> nothing in this layer
            remainingSeconds = 0;
            remainingPercent = 0;
            // remainingElapsed unchanged
          } else {
            if (remainingElapsed <= 0) {
              // no elapsed left to consume — layer unchanged (full initSec remains)
              remainingSeconds = initSec;
              remainingPercent = initialPercent;
            } else if (remainingElapsed >= initSec) {
              // this whole layer consumed by elapsed time
              remainingSeconds = 0;
              remainingPercent = 0;
              remainingElapsed = remainingElapsed - initSec;
            } else {
              // partially consumed: subtract remainingElapsed from this layer only
              remainingSeconds = Math.max(0, initSec - remainingElapsed);
              remainingPercent = (remainingSeconds / initSec) * initialPercent;
              remainingElapsed = 0; // all elapsed consumed
            }
          }

          // clamp/round
          remainingPercent = Math.max(0, Number(Number(remainingPercent || 0).toFixed(6)));
          layer.remainingSeconds = (remainingSeconds == null ? null : Number(remainingSeconds));
          layer.percent = remainingPercent;

          // write initialSeconds back into returned snapshot for client convenience (do not overwrite if already present)
          const writeInit = (initSecFromBtimer != null) ? initSecFromBtimer : (computedInit > 0 ? computedInit : null);
          if (writeInit != null) {
            copy.snapshot.bunkerTimers[m].layers[li] = copy.snapshot.bunkerTimers[m].layers[li] || {};
            copy.snapshot.bunkerTimers[m].layers[li].initialSeconds = Number(writeInit);
          }
          // write canonical remainingSeconds for client
          copy.snapshot.bunkerTimers[m].layers[li] = copy.snapshot.bunkerTimers[m].layers[li] || {};
          copy.snapshot.bunkerTimers[m].layers[li].remainingSeconds = Number(remainingSeconds);
        } // per-layer loop

        // recompute bunker remaining seconds as sum of remainingSeconds (if available)
        const sumRemaining = layerList.reduce((s, L) => s + (Number(L.remainingSeconds) || 0), 0);
        if (sumRemaining > 0) {
          copy.snapshot.bunkerTimers[m].remainingSeconds = Number(sumRemaining);
        } else {
          // fallback to btimer.initialSeconds minus elapsedSinceSaved if layers empty or all zero
          if (btimer && btimer.initialSeconds != null) {
            copy.snapshot.bunkerTimers[m].remainingSeconds = Math.max(0, Number(btimer.initialSeconds) - elapsedSinceSaved);
          } else {
            copy.snapshot.bunkerTimers[m].remainingSeconds = 0;
          }
        }
      } // bunker loop
    }

    // include resolved blend for convenience (if blendId present)
    let blend = null;
    if (unitDoc.blendId) {
      try { blend = await Blend.findById(unitDoc.blendId).lean(); } catch(e) { blend = null; }
    }

    return res.json({ unit, doc: copy, blend });
  } catch (err) {
    console.error('GET /api/unit/:unit error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});




/* -------------------- Optional dev helpers -------------------- */
app.delete('/api/units/reset', async (req, res) => {
  try {
    await Blend.deleteMany({});
    const baseDocs = [];
    for (let u = 1; u <= 3; u++) {
      const doc = new Blend({ rows: [], flows: [], generation: 0, bunkers: [], totalFlow: 0, avgGCV: 0 });
      await doc.save();
      baseDocs.push(doc._id);
    }
    const mapping = { "1": String(baseDocs[0]), "2": String(baseDocs[1]), "3": String(baseDocs[2]) };
    return res.json({ message: 'Reset OK', mapping });
  } catch (err) {
    console.error('DELETE /api/units/reset error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.get('/api/units/summary', async (req, res) => {
  try {
    const results = {};
    for (let u = 1; u <= 3; u++) {
      const m = getUnitModel(u);
      const doc = await m.findOne({}).lean();
      results[`unit${u}`] = doc || null;
    }
    return res.json(results);
  } catch (err) {
    console.error('GET /api/units/summary error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* Try several likely dist locations */
const candidates = [
  path.join(__dirname, '..', 'dist'),         // if frontend built at repo-root/dist
  path.join(__dirname, '..', 'client', 'dist'), // if frontend in client/
  path.join(__dirname, 'dist'),               // if server.js at repo root and dist there
  path.join(__dirname, '..', 'build')         // alternate
];

let clientDist = null;
for (const c of candidates) {
  try {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
      clientDist = c;
      break;
    }
  } catch (e) {
    // ignore
  }
}

if (clientDist) {
  console.log('✅ Serving frontend from:', clientDist);
  app.use(express.static(clientDist, { maxAge: '1d' }));

  // SPA fallback while preserving /api routes
// SPA fallback while preserving /api routes
// SPA fallback using app.use (avoids path-to-regexp parsing issues)
app.use((req, res, next) => {
  // let API routes go through
  if (req.path.startsWith('/api/')) return next();

  // Only handle GET/HEAD requests for the SPA
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const indexHtml = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }

  console.warn('index.html missing at', indexHtml);
  return res.status(500).send('Frontend built but index.html missing');
});


} else {
  console.warn('⚠️ Frontend build not found in:', candidates);
  app.get('/', (req, res) => res.send('API running (frontend not built)'));
}

/* Basic API 404 for unknown /api routes */
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));

/* Start server on host-provided port */
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT}`);
});
