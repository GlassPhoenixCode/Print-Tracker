/**
 * db.js — IndexedDB layer for Bambu Print Lab Tracker
 * Default settings tuned for Bambu Lab X2D + Bambu Studio
 */

const DB_NAME = 'BambuPrintLabDB';
const DB_VERSION = 1;
let _db = null;

export const X2D_DEFAULTS = {
  printerModel: 'Bambu Lab X2D',
  nozzleSize: '0.4 mm',
  buildPlate: 'Textured PEI Plate',
  bedAdhesive: 'none',
  amsUsed: true,
  bambuStudioProfile: '0.20mm Standard @X2D',
};

export const SCORE_KEYS = [
  { key: 'overallQuality',      label: 'Overall Quality',       emoji: '⭐' },
  { key: 'surfaceFinish',       label: 'Surface Finish',        emoji: '✨' },
  { key: 'dimensionalAccuracy', label: 'Dimensional Accuracy',  emoji: '📐' },
  { key: 'strength',            label: 'Strength',              emoji: '💪' },
  { key: 'detailResolution',    label: 'Detail Resolution',     emoji: '🔬' },
  { key: 'supportRemoval',      label: 'Support Removal',       emoji: '🧹' },
  { key: 'bedAdhesion',         label: 'Bed Adhesion',          emoji: '🔒' },
  { key: 'stringingControl',    label: 'Stringing Control',     emoji: '🕸️' },
  { key: 'overhangPerformance', label: 'Overhang Performance',  emoji: '🌉' },
  { key: 'bridgingPerformance', label: 'Bridging Performance',  emoji: '🌁' },
  { key: 'easeOfCleanup',       label: 'Ease of Cleanup',       emoji: '🧽' },
  { key: 'useAgain',            label: 'Would Use Again',       emoji: '🔁' },
];

export const SETTINGS_CATEGORIES = {
  Quality: ['Layer height','Initial layer height','Line width','Wall generator','Wall loops','Top shell layers','Bottom shell layers','Seam position','Ironing','Fuzzy skin','Arc fitting'],
  Strength: ['Sparse infill density','Sparse infill pattern','Internal solid infill pattern','Wall order','Infill/wall overlap','Top/bottom thickness'],
  Speed: ['Outer wall speed','Inner wall speed','Sparse infill speed','Top surface speed','Travel speed','Initial layer speed','Acceleration','Jerk','Silent mode / speed mode'],
  Support: ['Supports enabled','Support type','Tree supports','Support threshold angle','Support top Z distance','Support bottom Z distance','Support interface','Support interface pattern','Support/object XY distance','Support critical regions only','Support removal notes'],
  Filament: ['Nozzle temperature','Bed temperature','Volumetric speed','Flow ratio','Pressure advance / flow dynamics','Retraction length','Retraction speed','Cooling fan speed','Auxiliary fan','Chamber fan','Filament drying notes'],
  Cooling: ['Part cooling fan','Minimum layer time','Slow down for overhangs','Fan speed for overhangs','Bridge fan speed'],
  Adhesion: ['Brim','Brim width','Skirt','Raft','Initial layer temperature','Initial layer speed','Plate cleaning method'],
  'Special / Experimental': ['Adaptive layers','Variable layer height','Multi-material settings','Prime tower','Flush volume','Timelapse setting','Arachne/classic wall behavior','Custom G-code','Other setting'],
};

export const ACHIEVEMENTS = [
  { id: 'first_print',    title: 'First Contact',      desc: 'Log your first experiment',           emoji: '🚀', xp: 50,  check: (s) => s.total >= 1 },
  { id: 'five_prints',    title: 'Getting Warmed Up',  desc: 'Log 5 experiments',                   emoji: '🔥', xp: 100, check: (s) => s.total >= 5 },
  { id: 'ten_prints',     title: 'Data Driven',        desc: 'Log 10 experiments',                  emoji: '📊', xp: 200, check: (s) => s.total >= 10 },
  { id: 'twenty_five',    title: 'Lab Veteran',        desc: 'Log 25 experiments',                  emoji: '🏆', xp: 500, check: (s) => s.total >= 25 },
  { id: 'fifty_prints',   title: 'Print Master',       desc: 'Log 50 experiments',                  emoji: '👑', xp: 1000, check: (s) => s.total >= 50 },
  { id: 'perfect_ten',    title: 'Perfect Print',      desc: 'Score 10/10 on any single metric',    emoji: '💎', xp: 150, check: (s) => s.maxScore >= 10 },
  { id: 'high_avg',       title: 'Consistency King',   desc: 'Average overall quality above 8',     emoji: '📈', xp: 250, check: (s) => s.avgQuality >= 8 },
  { id: 'five_materials', title: 'Material Explorer',  desc: 'Print with 5 different materials',    emoji: '🧪', xp: 300, check: (s) => s.uniqueMaterials >= 5 },
  { id: 'baseline_set',   title: 'North Star',         desc: 'Set your first baseline profile',     emoji: '⭐', xp: 100, check: (s) => s.baselines >= 1 },
  { id: 'compare_done',   title: 'Head to Head',       desc: 'Compare two experiments',             emoji: '⚖️', xp: 75,  check: (s) => s.comparisons >= 1 },
  { id: 'photo_added',    title: 'Show & Tell',        desc: 'Add a photo to an experiment',        emoji: '📸', xp: 50,  check: (s) => s.withPhotos >= 1 },
  { id: 'ten_photos',     title: 'Documentarian',      desc: 'Add photos to 10 experiments',        emoji: '🎥', xp: 200, check: (s) => s.withPhotos >= 10 },
  { id: 'note_taker',     title: 'Quick Thinker',      desc: 'Add 5 quick notes',                   emoji: '📝', xp: 100, check: (s) => s.notes >= 5 },
  { id: 'maintained',     title: 'Well Oiled Machine', desc: 'Log 3 maintenance entries',           emoji: '🔧', xp: 150, check: (s) => s.maintenance >= 3 },
  { id: 'exported',       title: 'Backed Up',          desc: 'Export your data',                    emoji: '💾', xp: 50,  check: (s) => s.exports >= 1 },
  { id: 'week_streak',    title: 'On a Roll',          desc: 'Log experiments 3 days in a row',     emoji: '📅', xp: 200, check: (s) => s.streak >= 3 },
  { id: 'mini_expert',    title: 'Mini Maestro',       desc: 'Print 3 miniatures',                  emoji: '🗿', xp: 200, check: (s) => s.miniatures >= 3 },
  { id: 'bounced_back',   title: 'Failure is Data',    desc: 'Log a success after a failure',       emoji: '💫', xp: 150, check: (s) => s.bouncedBack },
  { id: 'settings_deep',  title: 'Tuning Wizard',      desc: 'Change 5+ settings in one experiment',emoji: '🔮', xp: 200, check: (s) => s.maxSettingsChanged >= 5 },
  { id: 'all_materials',  title: 'Polyglot Printer',   desc: 'Print PLA, PETG, ABS/ASA, TPU & Nylon', emoji: '🌈', xp: 500, check: (s) => s.coreMatCount >= 5 },
];

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('experiments')) {
        const s = db.createObjectStore('experiments', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('experimentId', 'experimentId', { unique: false });
      }
      ['notes','maintenance','appSettings'].forEach(name => {
        if (!db.objectStoreNames.contains(name))
          db.createObjectStore(name, { keyPath: name === 'appSettings' ? 'key' : 'id' });
      });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

function tx(store, mode = 'readonly') { return _db.transaction([store], mode).objectStore(store); }
function p(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

export function uuid() {
  return crypto?.randomUUID?.() ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

export const DB = {
  init: openDB,

  experiments: {
    getAll:  ()    => p(tx('experiments').getAll()),
    getById: (id)  => p(tx('experiments').get(id)),
    save:    (rec) => {
      rec.updatedAt = new Date().toISOString();
      if (!rec.createdAt) rec.createdAt = rec.updatedAt;
      if (!rec.id) rec.id = uuid();
      return p(tx('experiments','readwrite').put(rec));
    },
    delete:  (id)  => p(tx('experiments','readwrite').delete(id)),
  },

  photos: {
    getAll:          ()      => p(tx('photos').getAll()),
    getById:         (id)    => p(tx('photos').get(id)),
    getByExperiment: (expId) => p(tx('photos').index('experimentId').getAll(expId)),
    save:            (rec)   => p(tx('photos','readwrite').put(rec)),
    delete:          (id)    => p(tx('photos','readwrite').delete(id)),
  },

  notes: {
    getAll:  ()    => p(tx('notes').getAll()),
    save:    (rec) => { if (!rec.id) rec.id = uuid(); if (!rec.createdAt) rec.createdAt = new Date().toISOString(); return p(tx('notes','readwrite').put(rec)); },
    delete:  (id)  => p(tx('notes','readwrite').delete(id)),
  },

  maintenance: {
    getAll:  ()    => p(tx('maintenance').getAll()),
    save:    (rec) => { if (!rec.id) rec.id = uuid(); if (!rec.date) rec.date = new Date().toISOString(); return p(tx('maintenance','readwrite').put(rec)); },
    delete:  (id)  => p(tx('maintenance','readwrite').delete(id)),
  },

  settings: {
    get:    (key)        => p(tx('appSettings').get(key)).then(r => r?.value),
    set:    (key, value) => p(tx('appSettings','readwrite').put({ key, value })),
    getAll: ()           => p(tx('appSettings').getAll()),
  },

  async exportAll() {
    const [exps, phs, nts, maint, sets] = await Promise.all([
      this.experiments.getAll(), this.photos.getAll(),
      this.notes.getAll(), this.maintenance.getAll(), this.settings.getAll()
    ]);
    return { exportedAt: new Date().toISOString(), version: DB_VERSION, experiments: exps, photos: phs, notes: nts, maintenance: maint, settings: sets };
  },

  async importAll(data, mode = 'merge') {
    if (mode === 'replace') {
      for (const store of ['experiments','photos','notes','maintenance'])
        await p(tx(store,'readwrite').clear());
    }
    const writes = [
      ...(data.experiments || []).map(r => p(tx('experiments','readwrite').put(r))),
      ...(data.photos || []).map(r => p(tx('photos','readwrite').put(r))),
      ...(data.notes || []).map(r => p(tx('notes','readwrite').put(r))),
      ...(data.maintenance || []).map(r => p(tx('maintenance','readwrite').put(r))),
    ];
    await Promise.all(writes);
    await this.settings.set('lastImport', new Date().toISOString());
  },
};

export function compressImage(file, maxWidth = 1200, quality = 0.80) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ dataUrl, width: w, height: h, sizeKB: Math.round(dataUrl.length * 0.75 / 1024) });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── Seed Data (X2D defaults) ─────────────────────────────────────────────────
export async function loadSeedData() {
  const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const seeds = [
    {
      id:'seed-001', isSeed:true, createdAt:ago(28), updatedAt:ago(28),
      title:'PLA Support Test — Tree vs Normal', printerModel:'Bambu Lab X2D',
      bambuStudioProfile:'0.20mm Standard @X2D', modelName:'Overhang Torture Test', modelType:'support test',
      filament:{brand:'Bambu Lab',material:'PLA',color:'White',condition:'dry'},
      hardware:{nozzleSize:'0.4 mm',buildPlate:'Textured PEI Plate',bedAdhesive:'none',amsUsed:true,dualMaterial:false,supportUsed:true},
      settingsChanged:[
        {category:'Support',setting:'Support type',oldValue:'Normal',newValue:'Tree',notes:'Tree much easier to remove'},
        {category:'Support',setting:'Support top Z distance',oldValue:'0.20',newValue:'0.25',notes:'Better separation'},
      ],
      scores:{overallQuality:8,surfaceFinish:7,dimensionalAccuracy:9,strength:8,detailResolution:7,supportRemoval:9,bedAdhesion:9,stringingControl:8,overhangPerformance:8,bridgingPerformance:7,easeOfCleanup:9,useAgain:8},
      result:{status:'success',failureType:'none'},
      notes:{whatImproved:'Tree supports remove in one piece',whatWorsened:'Slight surface marking at contact',surprises:'40% less support material',testNext:'Try 0.30mm top Z distance',general:'Tree supports win for PLA on the X2D.'},
      photoIds:[], tags:['support','pla','tree'], isBaseline:0, estimatedPrintTime:'2h 15m', actualPrintTime:'2h 22m', printWeight:'42g'
    },
    {
      id:'seed-002', isSeed:true, createdAt:ago(20), updatedAt:ago(20),
      title:'PETG Support Interface Test', printerModel:'Bambu Lab X2D',
      bambuStudioProfile:'0.20mm Standard @X2D', modelName:'Functional Bracket', modelType:'support test',
      filament:{brand:'Overture',material:'PETG',color:'Translucent Blue',condition:'dry'},
      hardware:{nozzleSize:'0.4 mm',buildPlate:'Engineering Plate',bedAdhesive:'glue stick',amsUsed:false,dualMaterial:false,supportUsed:true},
      settingsChanged:[
        {category:'Support',setting:'Support interface',oldValue:'None',newValue:'Top only',notes:'PETG fuses without interface'},
        {category:'Filament',setting:'Nozzle temperature',oldValue:'240',newValue:'235',notes:'Reduce stringing'},
      ],
      scores:{overallQuality:7,surfaceFinish:6,dimensionalAccuracy:8,strength:9,detailResolution:6,supportRemoval:6,bedAdhesion:8,stringingControl:5,overhangPerformance:6,bridgingPerformance:7,easeOfCleanup:5,useAgain:7},
      result:{status:'partial success',failureType:'stringing'},
      notes:{whatImproved:'Interface layer helped separation',whatWorsened:'Stringing still visible',surprises:'PETG wants interface layer',testNext:'PVA support material',general:'Acceptable. PETG supports always tricky.'},
      photoIds:[], tags:['petg','support','interface'], isBaseline:0, estimatedPrintTime:'3h 40m', actualPrintTime:'3h 55m', printWeight:'68g'
    },
    {
      id:'seed-003', isSeed:true, createdAt:ago(14), updatedAt:ago(14),
      title:'Miniature Detail — 0.2mm Nozzle', printerModel:'Bambu Lab X2D',
      bambuStudioProfile:'0.10mm Detail @X2D', modelName:'Fantasy Knight 32mm Scale', modelType:'miniature',
      filament:{brand:'Bambu Lab',material:'PLA',color:'Grey',condition:'dry'},
      hardware:{nozzleSize:'0.2 mm',buildPlate:'Textured PEI Plate',bedAdhesive:'none',amsUsed:false,dualMaterial:false,supportUsed:true},
      settingsChanged:[
        {category:'Quality',setting:'Layer height',oldValue:'0.20',newValue:'0.10',notes:'Max detail'},
        {category:'Quality',setting:'Wall loops',oldValue:'2',newValue:'4',notes:'Better strength'},
        {category:'Speed',setting:'Outer wall speed',oldValue:'200',newValue:'80',notes:'0.2mm nozzle needs slow outer wall'},
      ],
      scores:{overallQuality:9,surfaceFinish:10,dimensionalAccuracy:9,strength:7,detailResolution:10,supportRemoval:7,bedAdhesion:9,stringingControl:8,overhangPerformance:7,bridgingPerformance:8,easeOfCleanup:7,useAgain:10},
      result:{status:'success',failureType:'none'},
      notes:{whatImproved:'Detail resolution is exceptional',whatWorsened:'Long print time',surprises:'Face detail nearly perfect',testNext:'0.08mm layer limit',general:'Best miniature yet. 0.2mm nozzle worth it.'},
      photoIds:[], tags:['miniature','detail','0.2mm'], isBaseline:1, estimatedPrintTime:'6h 10m', actualPrintTime:'6h 28m', printWeight:'4g'
    },
    {
      id:'seed-004', isSeed:true, createdAt:ago(7), updatedAt:ago(7),
      title:'Surface Finish Test — Ironing On', printerModel:'Bambu Lab X2D',
      bambuStudioProfile:'0.20mm Standard @X2D', modelName:'Flat Tile 100x100mm', modelType:'surface-finish test',
      filament:{brand:'Bambu Lab',material:'PLA',color:'Matte Black',condition:'new'},
      hardware:{nozzleSize:'0.4 mm',buildPlate:'Smooth PEI Plate',bedAdhesive:'none',amsUsed:false,dualMaterial:false,supportUsed:false},
      settingsChanged:[
        {category:'Quality',setting:'Ironing',oldValue:'Off',newValue:'On — All top surfaces',notes:'Testing glass smooth top'},
        {category:'Speed',setting:'Top surface speed',oldValue:'200',newValue:'120',notes:'Slower = better top layer'},
      ],
      scores:{overallQuality:9,surfaceFinish:10,dimensionalAccuracy:9,strength:8,detailResolution:8,supportRemoval:10,bedAdhesion:10,stringingControl:9,overhangPerformance:8,bridgingPerformance:8,easeOfCleanup:10,useAgain:9},
      result:{status:'success',failureType:'none'},
      notes:{whatImproved:'Top surface is glass-smooth',whatWorsened:'+15% print time',surprises:'Huge difference on matte black',testNext:'Monotonic top infill pattern',general:'Ironing mandatory for display pieces.'},
      photoIds:[], tags:['ironing','surface','display'], isBaseline:1, estimatedPrintTime:'1h 05m', actualPrintTime:'1h 12m', printWeight:'18g'
    },
    {
      id:'seed-005', isSeed:true, createdAt:ago(3), updatedAt:ago(3),
      title:'ASA Outdoor Bracket — Bed Adhesion Failure', printerModel:'Bambu Lab X2D',
      bambuStudioProfile:'0.20mm Standard @X2D', modelName:'Exterior Cable Bracket', modelType:'functional part',
      filament:{brand:'Polymaker',material:'ASA',color:'Red',condition:'dry'},
      hardware:{nozzleSize:'0.4 mm',buildPlate:'Engineering Plate',bedAdhesive:'none',amsUsed:false,dualMaterial:false,supportUsed:false},
      settingsChanged:[
        {category:'Filament',setting:'Bed temperature',oldValue:'90',newValue:'100',notes:'Higher bed for ASA'},
        {category:'Adhesion',setting:'Brim',oldValue:'Off',newValue:'On',notes:'Added brim for ASA'},
      ],
      scores:{overallQuality:2,surfaceFinish:3,dimensionalAccuracy:1,strength:4,detailResolution:2,supportRemoval:8,bedAdhesion:1,stringingControl:4,overhangPerformance:2,bridgingPerformance:3,easeOfCleanup:2,useAgain:1},
      result:{status:'failed',failureType:'bed adhesion'},
      notes:{whatImproved:'Nothing — detached at layer 40',whatWorsened:'Full warp-off despite brim',surprises:'Even 100°C bed failed without glue',testNext:'Magigoo + draft shield + enclosure preheat',general:'ASA absolutely needs adhesive on X2D. Never skip it.'},
      photoIds:[], tags:['asa','failure','adhesion','warping'], isBaseline:0, estimatedPrintTime:'3h 20m', actualPrintTime:'0h 45m', printWeight:'8g'
    },
  ];
  for (const s of seeds) await DB.experiments.save(s);
  await DB.settings.set('seedLoaded', true);
}

export async function clearSeedData() {
  const all = await DB.experiments.getAll();
  for (const e of all) if (e.isSeed) await DB.experiments.delete(e.id);
  await DB.settings.set('seedLoaded', false);
}
