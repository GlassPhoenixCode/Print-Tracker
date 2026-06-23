/**
 * app.js — Bambu Print Lab Tracker
 * Full single-page application with gamification, all screens, and IndexedDB persistence.
 */
import { DB, uuid, compressImage, loadSeedData, clearSeedData, SCORE_KEYS, SETTINGS_CATEGORIES, ACHIEVEMENTS, X2D_DEFAULTS } from './db.js';
import { renderStatusDonut, renderQualityByFilament, renderExperimentsByCategory, renderQualityOverTime, renderRadar, renderComparisonBars, refreshAll } from './charts.js';

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  experiments: [],
  notes: [],
  maintenance: [],
  theme: 'dark',
  xp: 0,
  level: 1,
  unlockedAchievements: [],
  stats: {},
  compareIds: [],
  currentScreen: 'dashboard',
  editingId: null,
  filterMat: '', filterNozzle: '', filterStatus: '', filterCat: '',
  filterSearch: '', sortBy: 'newest',
  pendingPhotos: [],   // { id, dataUrl, caption, sizeKB }
  comparisons: 0,
  exports: 0,
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  await DB.init();
  state.theme         = (await DB.settings.get('theme')) || 'dark';
  state.xp            = (await DB.settings.get('xp')) || 0;
  state.unlockedAchievements = (await DB.settings.get('achievements')) || [];
  state.comparisons   = (await DB.settings.get('comparisons')) || 0;
  state.exports       = (await DB.settings.get('exports')) || 0;
  applyTheme(state.theme);

  const seedLoaded = await DB.settings.get('seedLoaded');
  if (!seedLoaded) { await loadSeedData(); }

  await refreshState();
  buildNav();
  navigate('dashboard');
  setupGlobalEvents();
  updateXPBar();
}

async function refreshState() {
  state.experiments  = await DB.experiments.getAll();
  state.notes        = await DB.notes.getAll();
  state.maintenance  = await DB.maintenance.getAll();
  state.stats        = computeStats();
  state.level        = xpToLevel(state.xp);
}

// ─── XP / Level helpers ───────────────────────────────────────────────────────
function xpToLevel(xp) { return Math.floor(1 + Math.sqrt(xp / 80)); }
function levelToXP(lvl) { return Math.pow(lvl - 1, 2) * 80; }
function xpProgress() {
  const cur = levelToXP(state.level), next = levelToXP(state.level + 1);
  return Math.round(((state.xp - cur) / (next - cur)) * 100);
}

async function awardXP(amount, reason) {
  state.xp += amount;
  state.level = xpToLevel(state.xp);
  await DB.settings.set('xp', state.xp);
  updateXPBar();
  showXPPop(amount, reason);
}

function showXPPop(amount, reason) {
  const el = document.createElement('div');
  el.className = 'xp-pop';
  el.innerHTML = `<span class="xp-pop-amount">+${amount} XP</span><span class="xp-pop-reason">${reason}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 2200);
}

function updateXPBar() {
  const pct = xpProgress();
  const bar = document.getElementById('xp-bar-fill');
  const lvl = document.getElementById('xp-level');
  const txt = document.getElementById('xp-text');
  if (bar) bar.style.width = pct + '%';
  if (lvl) lvl.textContent = `Lv ${state.level}`;
  if (txt) txt.textContent = `${state.xp} XP`;
}

// ─── Stats computation ────────────────────────────────────────────────────────
function computeStats() {
  const exps = state.experiments;
  const counts = { success:0, partial:0, failed:0, cancelled:0 };
  const matMap = {}, nozzleMap = {}, catMap = {};
  let totalQ = 0, maxScore = 0, withPhotos = 0;
  const materials = new Set(), maxSettingsChanged_arr = [];

  exps.forEach(e => {
    const s = e.result?.status || 'unknown';
    if (s === 'success') counts.success++;
    else if (s === 'partial success') counts.partial++;
    else if (s === 'failed') counts.failed++;
    else if (s === 'cancelled') counts.cancelled++;

    const mat = e.filament?.material || 'Unknown';
    matMap[mat] = (matMap[mat]||0)+1;
    materials.add(mat);

    const nz = e.hardware?.nozzleSize || 'Unknown';
    nozzleMap[nz] = (nozzleMap[nz]||0)+1;

    (e.settingsChanged||[]).forEach(sc => {
      catMap[sc.category] = (catMap[sc.category]||0)+1;
    });
    maxSettingsChanged_arr.push((e.settingsChanged||[]).length);

    const q = e.scores?.overallQuality || 0;
    totalQ += q;
    if (q > maxScore) maxScore = q;
    if ((e.photoIds||[]).length > 0) withPhotos++;
  });

  const n = exps.length;
  const avgQuality = n ? +(totalQ / n).toFixed(1) : 0;
  const mostMat = Object.entries(matMap).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
  const mostCat = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';

  const byFilament = Object.entries(matMap).map(([label, cnt]) => {
    const relevant = exps.filter(e => e.filament?.material === label);
    const avg = relevant.length ? +(relevant.reduce((a,e) => a + (e.scores?.overallQuality||0), 0) / relevant.length).toFixed(1) : 0;
    return { label, cnt, avg };
  });

  const byCat = Object.entries(catMap).map(([label, count]) => ({ label, count })).sort((a,b)=>b.count-a.count);

  const sorted = [...exps].sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt));
  const overTime = sorted.map(e => ({ label: fmtDateShort(e.createdAt), score: e.scores?.overallQuality||0 }));

  const bestExp = exps.reduce((best, e) => {
    const s = e.scores?.overallQuality||0;
    return (!best || s > (best.scores?.overallQuality||0)) ? e : best;
  }, null);

  const coreMats = ['PLA','PETG','ABS','ASA','TPU','Nylon'];
  const coreMatCount = coreMats.filter(m => materials.has(m)).length;

  const baselines = exps.filter(e => e.isBaseline).length;
  const miniatures = exps.filter(e => e.modelType === 'miniature').length;

  let bouncedBack = false;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i-1].result?.status === 'failed' && sorted[i].result?.status === 'success') { bouncedBack = true; break; }
  }

  // Streak: consecutive unique days
  const days = [...new Set(sorted.map(e => e.createdAt?.slice(0,10)))].sort();
  let streak = 1, maxStreak = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i]) - new Date(days[i-1])) / 86400000;
    if (diff === 1) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 1;
  }

  return { total:n, counts, matMap, nozzleMap, catMap, avgQuality, mostMat, mostCat,
    byFilament, byCat, overTime, bestExp, maxScore, withPhotos,
    uniqueMaterials: materials.size, maxSettingsChanged: Math.max(0,...maxSettingsChanged_arr),
    baselines, miniatures, bouncedBack, coreMatCount, streak: maxStreak,
    notes: state.notes.length, maintenance: state.maintenance.length,
    comparisons: state.comparisons, exports: state.exports };
}

// ─── Achievement check ────────────────────────────────────────────────────────
async function checkAchievements() {
  const s = state.stats;
  const newOnes = [];
  for (const ach of ACHIEVEMENTS) {
    if (!state.unlockedAchievements.includes(ach.id) && ach.check(s)) {
      state.unlockedAchievements.push(ach.id);
      newOnes.push(ach);
    }
  }
  if (newOnes.length) {
    await DB.settings.set('achievements', state.unlockedAchievements);
    for (const ach of newOnes) {
      await awardXP(ach.xp, ach.title);
      await sleep(300);
      showAchievementUnlock(ach);
    }
  }
}

function showAchievementUnlock(ach) {
  const el = document.createElement('div');
  el.className = 'achievement-pop';
  el.innerHTML = `
    <div class="ach-pop-inner">
      <div class="ach-pop-icon">${ach.emoji}</div>
      <div class="ach-pop-body">
        <div class="ach-pop-label">Achievement Unlocked!</div>
        <div class="ach-pop-title">${ach.title}</div>
        <div class="ach-pop-desc">${ach.desc}</div>
      </div>
      <div class="ach-pop-xp">+${ach.xp} XP</div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 500); }, 4000);
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function buildNav() {
  const tabs = [
    { id:'dashboard', icon:'🏠', label:'Home' },
    { id:'experiments', icon:'🧪', label:'Lab' },
    { id:'new-experiment', icon:'➕', label:'New' },
    { id:'notes', icon:'📝', label:'Notes' },
    { id:'data', icon:'💾', label:'Data' },
  ];
  const bottom = document.getElementById('bottomnav');
  const desktop = document.getElementById('desktop-nav');
  if (bottom) bottom.innerHTML = tabs.map(t => `
    <button class="tab-btn" data-screen="${t.id}" aria-label="${t.label}">
      <span class="tab-icon">${t.icon}</span>${t.label}
    </button>`).join('');
  if (desktop) desktop.innerHTML = tabs.map(t => `
    <button class="nav-tab" data-screen="${t.id}">${t.icon} ${t.label}</button>`).join('');

  document.querySelectorAll('[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen));
  });
}

function navigate(screen, opts={}) {
  state.currentScreen = screen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + screen);
  if (el) el.classList.add('active');
  document.querySelectorAll('[data-screen]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === screen);
  });
  window.scrollTo(0, 0);

  if (screen === 'dashboard')       renderDashboard();
  if (screen === 'experiments')     renderExperimentList();
  if (screen === 'new-experiment')  renderNewExperimentForm(opts.editId || null);
  if (screen === 'notes')           renderNotesScreen();
  if (screen === 'maintenance')     renderMaintenanceScreen();
  if (screen === 'data')            renderDataScreen();
  if (screen === 'compare')         renderCompareScreen(opts.ids || state.compareIds);
  if (screen === 'achievements')    renderAchievementsScreen();
  if (screen === 'detail' && opts.id) renderDetailScreen(opts.id);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const s = state.stats;
  const recent = [...state.experiments].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);

  document.getElementById('screen-dashboard').innerHTML = `
    <div class="dash-header">
      <div class="dash-hero-row">
        <div class="dash-hero-text">
          <div class="dash-greeting">Welcome back, Lab Tech 🧪</div>
          <div class="dash-tagline">Every print is a data point. Keep experimenting.</div>
        </div>
        <div class="xp-widget">
          <div class="xp-level-badge" id="xp-level">Lv ${state.level}</div>
          <div class="xp-bar-wrap">
            <div class="xp-bar-track"><div class="xp-bar-fill" id="xp-bar-fill" style="width:${xpProgress()}%"></div></div>
            <div class="xp-text" id="xp-text">${state.xp} XP</div>
          </div>
        </div>
      </div>
      <div class="quick-actions">
        <button class="quick-btn quick-btn-primary" onclick="navigate('new-experiment')">
          <span>➕</span> New Experiment
        </button>
        <button class="quick-btn" onclick="navigate('compare')">
          <span>⚖️</span> Compare
        </button>
        <button class="quick-btn" onclick="exportData()">
          <span>💾</span> Export
        </button>
        <button class="quick-btn" onclick="navigate('achievements')">
          <span>🏆</span> Achievements
        </button>
      </div>
    </div>

    <div class="stat-row grid-4">
      <div class="stat-card"><div class="stat-num" style="color:var(--accent)">${s.total}</div><div class="stat-lbl">Experiments</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--success)">${s.counts.success||0}</div><div class="stat-lbl">Successes</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--accent2)">${s.avgQuality||'—'}</div><div class="stat-lbl">Avg Quality</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--purple)">${s.uniqueMaterials||0}</div><div class="stat-lbl">Materials</div></div>
    </div>

    <div class="grid-2 chart-row">
      <div class="card chart-card">
        <div class="card-title">📊 Print Outcomes</div>
        <div class="legend-row">
          <span class="leg success">✓ Success</span>
          <span class="leg partial">~ Partial</span>
          <span class="leg failed">✗ Failed</span>
        </div>
        <canvas id="chart-donut" height="160"></canvas>
      </div>
      <div class="card chart-card">
        <div class="card-title">📈 Quality Over Time</div>
        <canvas id="chart-time" height="160"></canvas>
      </div>
    </div>

    <div class="grid-2 chart-row">
      <div class="card chart-card">
        <div class="card-title">🧵 Avg Quality by Material</div>
        <canvas id="chart-filament" height="160"></canvas>
      </div>
      <div class="card chart-card">
        <div class="card-title">🔧 Most-Tuned Settings</div>
        <canvas id="chart-cats" height="160"></canvas>
      </div>
    </div>

    ${s.bestExp ? `
    <div class="card best-card">
      <div class="best-label">🏅 Best Print So Far</div>
      <div class="best-title">${esc(s.bestExp.title)}</div>
      <div class="best-meta">
        <span class="badge badge-success">${s.bestExp.result?.status||''}</span>
        <span>${s.bestExp.filament?.material||''}</span>
        <span>${s.bestExp.hardware?.nozzleSize||''}</span>
        <span>Overall: <strong>${s.bestExp.scores?.overallQuality||'?'}/10</strong></span>
      </div>
      <div class="radar-wrap"><canvas id="chart-best-radar" height="220"></canvas></div>
    </div>` : ''}

    <div class="section-header" style="margin-top:24px">
      <div>
        <div class="section-title">🕐 Recent Experiments</div>
        <div class="section-sub">${s.total} total — <a class="link" onclick="navigate('experiments')">View all →</a></div>
      </div>
    </div>
    ${recent.length === 0 ? emptyState('🚀','No experiments yet','Log your first print to start building your data!') : ''}
    <div class="exp-list">${recent.map(expCard).join('')}</div>

    <div class="streak-bar">
      <span>🔥 ${s.streak > 1 ? `${s.streak}-day streak!` : 'Start a streak — log today!'}</span>
      <span class="streak-meta">${s.mostMat !== '—' ? `Most used: <strong>${s.mostMat}</strong>` : ''}</span>
    </div>
  `;

  // Charts
  setTimeout(() => {
    renderStatusDonut('chart-donut', s.counts);
    renderQualityOverTime('chart-time', s.overTime);
    if (s.byFilament.length) renderQualityByFilament('chart-filament', s.byFilament);
    if (s.byCat.length) renderExperimentsByCategory('chart-cats', s.byCat.slice(0,6));
    if (s.bestExp) renderRadar('chart-best-radar', [s.bestExp]);
  }, 50);
}

// ─── Experiment List ──────────────────────────────────────────────────────────
function renderExperimentList() {
  const screen = document.getElementById('screen-experiments');
  screen.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">🧪 Experiment Lab</div>
      <div class="section-sub">${state.experiments.length} experiments logged</div></div>
      <button class="btn btn-primary btn-sm" onclick="navigate('new-experiment')">➕ New</button>
    </div>
    <div class="filter-bar">
      <input class="form-input" id="fl-search" placeholder="🔍 Search title, material, notes…" value="${esc(state.filterSearch)}" oninput="filterChanged()">
      <select class="form-select" id="fl-mat" onchange="filterChanged()">
        <option value="">All Materials</option>
        ${['PLA','PLA+','PETG','TPU','ABS','ASA','Nylon','PC','Carbon Fiber','Support Material','Other'].map(m=>`<option ${state.filterMat===m?'selected':''} value="${m}">${m}</option>`).join('')}
      </select>
      <select class="form-select" id="fl-status" onchange="filterChanged()">
        <option value="">All Status</option>
        ${['success','partial success','failed','cancelled'].map(s=>`<option ${state.filterStatus===s?'selected':''} value="${s}">${s}</option>`).join('')}
      </select>
      <select class="form-select" id="fl-sort" onchange="filterChanged()">
        <option value="newest" ${state.sortBy==='newest'?'selected':''}>Newest First</option>
        <option value="oldest" ${state.sortBy==='oldest'?'selected':''}>Oldest First</option>
        <option value="best"   ${state.sortBy==='best'?'selected':''}>Best Score</option>
        <option value="worst"  ${state.sortBy==='worst'?'selected':''}>Worst Score</option>
      </select>
    </div>
    <div id="exp-list-results"></div>
  `;
  renderFilteredList();
}

window.filterChanged = function() {
  state.filterSearch = document.getElementById('fl-search')?.value || '';
  state.filterMat    = document.getElementById('fl-mat')?.value || '';
  state.filterStatus = document.getElementById('fl-status')?.value || '';
  state.sortBy       = document.getElementById('fl-sort')?.value || 'newest';
  renderFilteredList();
};

function renderFilteredList() {
  let list = [...state.experiments];
  if (state.filterSearch) {
    const q = state.filterSearch.toLowerCase();
    list = list.filter(e => [e.title,e.modelName,e.filament?.material,e.filament?.brand,e.notes?.general].join(' ').toLowerCase().includes(q));
  }
  if (state.filterMat)    list = list.filter(e => e.filament?.material === state.filterMat);
  if (state.filterStatus) list = list.filter(e => e.result?.status === state.filterStatus);

  const sortFns = {
    newest: (a,b) => new Date(b.createdAt)-new Date(a.createdAt),
    oldest: (a,b) => new Date(a.createdAt)-new Date(b.createdAt),
    best:   (a,b) => (b.scores?.overallQuality||0)-(a.scores?.overallQuality||0),
    worst:  (a,b) => (a.scores?.overallQuality||0)-(b.scores?.overallQuality||0),
  };
  list.sort(sortFns[state.sortBy] || sortFns.newest);

  const el = document.getElementById('exp-list-results');
  if (!el) return;
  if (list.length === 0) { el.innerHTML = emptyState('🔍','No matches','Try adjusting your filters'); return; }
  el.innerHTML = `<div class="exp-list">${list.map(expCard).join('')}</div>`;
}

function expCard(e) {
  const statusClass = { success:'badge-success','partial success':'badge-partial', failed:'badge-failed', cancelled:'badge-cancelled' }[e.result?.status] || 'badge-cancelled';
  const score = e.scores?.overallQuality || '?';
  const scoreColor = score >= 8 ? 'var(--success)' : score >= 5 ? 'var(--partial)' : 'var(--failed)';
  const topSettings = (e.settingsChanged||[]).slice(0,3).map(s=>`<span class="setting-tag"><span class="setting-tag-cat">${s.category}</span> ${s.setting}</span>`).join('');
  const inCompare = state.compareIds.includes(e.id);

  return `
  <div class="exp-card" onclick="navigate('detail',{id:'${e.id}'})">
    <div class="exp-card-top">
      <div class="exp-card-info">
        <div class="exp-card-header">
          <div class="exp-card-title">${esc(e.title)}</div>
          <div style="display:flex;gap:6px;align-items:center">
            ${e.isBaseline ? '<span class="badge badge-baseline">⭐ Baseline</span>' : ''}
            <span class="badge ${statusClass}">${e.result?.status||'unknown'}</span>
          </div>
        </div>
        <div class="exp-card-meta">
          <span>${fmtDateShort(e.createdAt)}</span>
          <span>${e.filament?.material||'?'} · ${e.filament?.brand||''}</span>
          <span>${e.hardware?.nozzleSize||'?'}</span>
          ${e.actualPrintTime ? `<span>⏱ ${e.actualPrintTime}</span>` : ''}
        </div>
      </div>
      <div class="score-circle" style="--score-color:${scoreColor}">
        <div class="score-circle-num">${score}</div>
        <div class="score-circle-label">/10</div>
      </div>
    </div>
    ${topSettings ? `<div class="exp-card-tags">${topSettings}</div>` : ''}
    <div class="exp-card-actions" onclick="event.stopPropagation()">
      <button class="btn btn-sm btn-secondary" onclick="navigate('detail',{id:'${e.id}'})">👁 View</button>
      <button class="btn btn-sm btn-secondary" onclick="navigate('new-experiment',{editId:'${e.id}'})">✏️ Edit</button>
      <button class="btn btn-sm ${inCompare?'btn-primary':'btn-secondary'}" onclick="toggleCompare('${e.id}')">
        ${inCompare ? '✓ In Compare' : '⚖️ Compare'}
      </button>
      <button class="btn btn-sm btn-secondary" onclick="duplicateExp('${e.id}')">📋 Duplicate</button>
      <button class="btn btn-sm btn-danger" onclick="deleteExp('${e.id}')">🗑 Delete</button>
    </div>
  </div>`;
}

// ─── Compare ──────────────────────────────────────────────────────────────────
window.toggleCompare = function(id) {
  if (state.compareIds.includes(id)) {
    state.compareIds = state.compareIds.filter(x => x !== id);
  } else {
    if (state.compareIds.length >= 2) { toast('Select max 2 experiments to compare', 'error'); return; }
    state.compareIds.push(id);
    if (state.compareIds.length === 2) {
      toast('✓ 2 selected — tap Compare!', 'success');
    } else {
      toast('Select one more to compare', 'info');
    }
  }
  if (state.currentScreen === 'experiments') renderFilteredList();
};

async function renderCompareScreen(ids) {
  const screen = document.getElementById('screen-compare');
  if (!ids || ids.length < 2) {
    screen.innerHTML = `
      <div class="section-header">
        <div class="section-title">⚖️ Compare Experiments</div>
      </div>
      ${emptyState('⚖️','Select 2 experiments to compare','Go to the Lab tab, tap ⚖️ Compare on two experiments, then come back here.')}
      <div style="margin-top:16px">
        <div class="section-sub" style="margin-bottom:12px">Or pick from your experiments:</div>
        <div class="exp-list">${state.experiments.slice(0,6).map(e=>`
          <div class="exp-card" style="cursor:default">
            <div class="exp-card-header">
              <div class="exp-card-title">${esc(e.title)}</div>
              <button class="btn btn-sm ${state.compareIds.includes(e.id)?'btn-primary':'btn-secondary'}" onclick="toggleCompareAndRefresh('${e.id}')">
                ${state.compareIds.includes(e.id) ? '✓ Selected' : '+ Select'}
              </button>
            </div>
          </div>`).join('')}
        </div>
        ${state.compareIds.length===2 ? `<button class="btn btn-primary" style="margin-top:12px;width:100%" onclick="navigate('compare',{ids:state.compareIds})">Compare These Two →</button>` : ''}
      </div>`;
    return;
  }

  const [a, b] = await Promise.all(ids.map(id => DB.experiments.getById(id)));
  if (!a || !b) { screen.innerHTML = emptyState('❌','Experiments not found',''); return; }

  state.comparisons++;
  await DB.settings.set('comparisons', state.comparisons);
  await refreshState();
  await checkAchievements();

  const CKEYS = [
    ['overallQuality','Overall Quality','⭐'],
    ['surfaceFinish','Surface Finish','✨'],
    ['dimensionalAccuracy','Accuracy','📐'],
    ['strength','Strength','💪'],
    ['supportRemoval','Support Removal','🧹'],
    ['stringingControl','Stringing','🕸️'],
    ['overhangPerformance','Overhang','🌉'],
    ['bedAdhesion','Bed Adhesion','🔒'],
  ];

  const diffRows = CKEYS.map(([k, lbl, emoji]) => {
    const va = a.scores?.[k]||0, vb = b.scores?.[k]||0, diff = vb - va;
    const cls = diff > 0 ? 'diff-better' : diff < 0 ? 'diff-worse' : 'diff-same';
    const sign = diff > 0 ? '▲' : diff < 0 ? '▼' : '=';
    return `<tr>
      <td>${emoji} ${lbl}</td>
      <td class="cmp-score">${va}</td>
      <td class="cmp-score">${vb}</td>
      <td class="${cls}">${sign} ${Math.abs(diff)||'—'}</td>
    </tr>`;
  }).join('');

  // Plain-English summary
  const improvements = CKEYS.filter(([k])=>(b.scores?.[k]||0)>(a.scores?.[k]||0));
  const regressions  = CKEYS.filter(([k])=>(b.scores?.[k]||0)<(a.scores?.[k]||0));
  const changedSettings = (b.settingsChanged||[]).map(s=>s.setting).slice(0,3).join(', ');
  let summary = `<strong>${esc(b.title)}</strong> vs <strong>${esc(a.title)}</strong>: `;
  if (improvements.length) summary += `Improved ${improvements.map(([,l])=>l).join(', ')}. `;
  if (regressions.length)  summary += `Worse on ${regressions.map(([,l])=>l).join(', ')}. `;
  if (changedSettings)     summary += `Key changed settings: ${changedSettings}.`;
  if (!improvements.length && !regressions.length) summary += 'Scores are identical across key metrics.';

  screen.innerHTML = `
    <div class="section-header">
      <div class="section-title">⚖️ Head to Head</div>
      <button class="btn btn-sm btn-secondary" onclick="state.compareIds=[];navigate('experiments')">✕ Reset</button>
    </div>

    <div class="compare-header-grid">
      <div class="cmp-badge cmp-a"><div class="cmp-badge-letter">A</div><div class="cmp-badge-title">${esc(a.title)}</div><span class="badge ${statusBadge(a.result?.status)}">${a.result?.status||'?'}</span></div>
      <div class="cmp-vs">VS</div>
      <div class="cmp-badge cmp-b"><div class="cmp-badge-letter">B</div><div class="cmp-badge-title">${esc(b.title)}</div><span class="badge ${statusBadge(b.result?.status)}">${b.result?.status||'?'}</span></div>
    </div>

    <div class="card ai-summary"><div class="ai-label">🤖 Auto-Summary</div><p>${summary}</p></div>

    <div class="card" style="margin-bottom:12px">
      <div class="card-title">Score Comparison</div>
      <table class="cmp-table">
        <thead><tr><th>Metric</th><th>A</th><th>B</th><th>Diff</th></tr></thead>
        <tbody>${diffRows}</tbody>
      </table>
    </div>

    <div class="card chart-card chart-full" style="margin-bottom:12px">
      <div class="card-title">Radar Comparison</div>
      <canvas id="chart-compare-radar" height="260"></canvas>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="card-title">Bar Comparison</div>
      <div style="height:220px"><canvas id="chart-compare-bars"></canvas></div>
    </div>

    <div class="card">
      <div class="card-title">Settings Changed in B</div>
      ${(b.settingsChanged||[]).length === 0 ? '<p class="text-muted">No settings logged</p>' : (b.settingsChanged||[]).map(s=>`
        <div class="settings-diff-row">
          <span class="setting-tag-cat">${s.category}</span>
          <strong>${esc(s.setting)}</strong>
          ${s.oldValue?`<span class="diff-old">${esc(s.oldValue)} →</span>`:''}
          ${s.newValue?`<span class="diff-new">${esc(s.newValue)}</span>`:''}
        </div>`).join('')}
    </div>
  `;

  setTimeout(() => {
    renderRadar('chart-compare-radar', [a, b]);
    renderComparisonBars('chart-compare-bars', a, b);
  }, 50);
}

window.toggleCompareAndRefresh = function(id) {
  toggleCompare(id);
  navigate('compare', { ids: state.compareIds });
};

// ─── New / Edit Experiment Form ───────────────────────────────────────────────
async function renderNewExperimentForm(editId = null) {
  let existing = null;
  if (editId) {
    existing = await DB.experiments.getById(editId);
    state.editingId = editId;
  } else {
    state.editingId = null;
    state.pendingPhotos = [];
  }

  const e = existing || {};
  const fil = e.filament || {};
  const hw  = e.hardware  || {};
  const res = e.result    || {};
  const sc  = e.scores    || {};
  const nt  = e.notes     || {};

  const screen = document.getElementById('screen-new-experiment');

  // Settings categories
  const settingsHTML = Object.entries(SETTINGS_CATEGORIES).map(([cat, settings]) => `
    <div class="settings-category">
      <button class="collapsible-toggle" onclick="toggleCollapse(this)">
        <span>${cat}</span><span class="collapsible-arrow">▾</span>
      </button>
      <div class="collapsible-body">
        ${settings.map(setting => {
          const existing_sc = (e.settingsChanged||[]).find(s => s.category===cat && s.setting===setting);
          return `<div class="settings-row" id="sr-${slugify(cat+'-'+setting)}">
            <div class="settings-row-header">
              <input type="checkbox" class="setting-check" ${existing_sc?'checked':''} id="chk-${slugify(cat+'-'+setting)}"
                data-cat="${esc(cat)}" data-setting="${esc(setting)}"
                onchange="toggleSettingRow('${slugify(cat+'-'+setting)}')">
              <label for="chk-${slugify(cat+'-'+setting)}" style="cursor:pointer;font-size:13px">${setting}</label>
            </div>
            <div class="settings-inline ${existing_sc?'':'hidden'}" id="srd-${slugify(cat+'-'+setting)}">
              <input class="form-input" placeholder="Old value" value="${esc(existing_sc?.oldValue||'')}" data-field="old-${slugify(cat+'-'+setting)}">
              <input class="form-input" placeholder="New value" value="${esc(existing_sc?.newValue||'')}" data-field="new-${slugify(cat+'-'+setting)}">
              <input class="form-input" placeholder="Notes…" value="${esc(existing_sc?.notes||'')}" data-field="note-${slugify(cat+'-'+setting)}">
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');

  const scoresHTML = SCORE_KEYS.map(({ key, label, emoji }) => `
    <div class="score-row">
      <div class="score-row-label">${emoji} ${label}</div>
      <div class="score-slider-wrap">
        <input type="range" class="score-slider" min="1" max="10" value="${sc[key]||5}"
          id="score-${key}" oninput="document.getElementById('sv-${key}').textContent=this.value; updateSliderColor(this)">
        <span class="score-value" id="sv-${key}">${sc[key]||5}</span>
      </div>
    </div>`).join('');

  screen.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">${editId ? '✏️ Edit Experiment' : '🚀 New Experiment'}</div></div>
      <button class="btn btn-sm btn-ghost" onclick="navigate('experiments')">✕ Cancel</button>
    </div>

    <div class="form-card">
      <!-- ── Meta ── -->
      <button class="collapsible-toggle open" onclick="toggleCollapse(this)">
        <span>📋 Basic Info</span><span class="collapsible-arrow">▾</span>
      </button>
      <div class="collapsible-body open">
        <div class="form-group"><label class="form-label">Experiment Title *</label>
          <input class="form-input" id="f-title" placeholder="e.g. Tree Support Test v2 — PETG" value="${esc(e.title||'')}"></div>
        <div class="grid-2">
          <div class="form-group"><label class="form-label">Date/Time</label>
            <input class="form-input" type="datetime-local" id="f-datetime" value="${(e.createdAt||new Date().toISOString()).slice(0,16)}"></div>
          <div class="form-group"><label class="form-label">Printer Model</label>
            <input class="form-input" id="f-printer" value="${esc(e.printerModel||X2D_DEFAULTS.printerModel)}"></div>
        </div>
        <div class="grid-2">
          <div class="form-group"><label class="form-label">Bambu Studio Profile</label>
            <input class="form-input" id="f-profile" placeholder="e.g. 0.20mm Standard @X2D" value="${esc(e.bambuStudioProfile||X2D_DEFAULTS.bambuStudioProfile)}"></div>
          <div class="form-group"><label class="form-label">Model Name</label>
            <input class="form-input" id="f-modelname" placeholder="e.g. Phone Stand v3" value="${esc(e.modelName||'')}"></div>
        </div>
        <div class="form-group"><label class="form-label">Model Type</label>
          <select class="form-select" id="f-modeltype">
            ${['functional part','miniature','display object','support test','tolerance test','surface-finish test','overhang test','bridging test','speed test','material test','other'].map(t=>`<option ${(e.modelType||'functional part')===t?'selected':''}>${t}</option>`).join('')}
          </select></div>
      </div>

      <!-- ── Filament ── -->
      <button class="collapsible-toggle" onclick="toggleCollapse(this)">
        <span>🧵 Filament</span><span class="collapsible-arrow">▾</span>
      </button>
      <div class="collapsible-body">
        <div class="grid-2">
          <div class="form-group"><label class="form-label">Brand</label>
            <input class="form-input" id="f-brand" placeholder="Bambu Lab" value="${esc(fil.brand||'Bambu Lab')}"></div>
          <div class="form-group"><label class="form-label">Material</label>
            <select class="form-select" id="f-material">
              ${['PLA','PLA+','PETG','TPU','ABS','ASA','Nylon','PC','Carbon Fiber Blend','Support Material','Other'].map(m=>`<option ${(fil.material||'PLA')===m?'selected':''}>${m}</option>`).join('')}
            </select></div>
        </div>
        <div class="grid-2">
          <div class="form-group"><label class="form-label">Color</label>
            <input class="form-input" id="f-color" placeholder="Bambu Matte Black" value="${esc(fil.color||'')}"></div>
          <div class="form-group"><label class="form-label">Condition</label>
            <select class="form-select" id="f-condition">
              ${['new','dry','questionable','wet/stringy','unknown'].map(c=>`<option ${(fil.condition||'new')===c?'selected':''}>${c}</option>`).join('')}
            </select></div>
        </div>
      </div>

      <!-- ── Hardware ── -->
      <button class="collapsible-toggle" onclick="toggleCollapse(this)">
        <span>⚙️ Hardware Setup</span><span class="collapsible-arrow">▾</span>
      </button>
      <div class="collapsible-body">
        <div class="grid-2">
          <div class="form-group"><label class="form-label">Nozzle Size</label>
            <select class="form-select" id="f-nozzle">
              ${['0.2 mm','0.4 mm','0.6 mm','0.8 mm','other'].map(n=>`<option ${(hw.nozzleSize||X2D_DEFAULTS.nozzleSize)===n?'selected':''}>${n}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Build Plate</label>
            <select class="form-select" id="f-plate">
              ${['Textured PEI Plate','Smooth PEI Plate','Engineering Plate','High-Temp Plate','Cool Plate'].map(p=>`<option ${(hw.buildPlate||X2D_DEFAULTS.buildPlate)===p?'selected':''}>${p}</option>`).join('')}
            </select></div>
        </div>
        <div class="grid-2">
          <div class="form-group"><label class="form-label">Bed Adhesive</label>
            <select class="form-select" id="f-adhesive">
              ${['none','glue stick','liquid glue','hairspray','tape','Magigoo','other'].map(a=>`<option ${(hw.bedAdhesive||'none')===a?'selected':''}>${a}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label" style="margin-bottom:10px">Options</label>
            <label class="checkbox-wrap"><input type="checkbox" id="f-ams" ${hw.amsUsed??true?'checked':''}> AMS Used</label>
            <label class="checkbox-wrap"><input type="checkbox" id="f-dual" ${hw.dualMaterial?'checked':''}> Dual Material</label>
            <label class="checkbox-wrap"><input type="checkbox" id="f-supports" ${hw.supportUsed?'checked':''}> Supports Used</label>
          </div>
        </div>
        <div class="grid-3">
          <div class="form-group"><label class="form-label">Est. Print Time</label>
            <input class="form-input" id="f-esttime" placeholder="2h 30m" value="${esc(e.estimatedPrintTime||'')}"></div>
          <div class="form-group"><label class="form-label">Actual Print Time</label>
            <input class="form-input" id="f-acttime" placeholder="2h 42m" value="${esc(e.actualPrintTime||'')}"></div>
          <div class="form-group"><label class="form-label">Filament Used</label>
            <input class="form-input" id="f-weight" placeholder="45g" value="${esc(e.printWeight||'')}"></div>
        </div>
      </div>

      <!-- ── Result ── -->
      <button class="collapsible-toggle" onclick="toggleCollapse(this)">
        <span>🎯 Result</span><span class="collapsible-arrow">▾</span>
      </button>
      <div class="collapsible-body">
        <div class="grid-2">
          <div class="form-group"><label class="form-label">Result Status</label>
            <select class="form-select" id="f-status">
              ${['success','partial success','failed','cancelled'].map(s=>`<option ${(res.status||'success')===s?'selected':''}>${s}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Failure Type</label>
            <select class="form-select" id="f-failtype">
              ${['none','bed adhesion','spaghetti','clog','under-extrusion','over-extrusion','warping','layer shift','poor supports','stringing','rough surface','dimensional inaccuracy','other'].map(f=>`<option ${(res.failureType||'none')===f?'selected':''}>${f}</option>`).join('')}
            </select></div>
        </div>
        <label class="checkbox-wrap" style="margin-top:4px">
          <input type="checkbox" id="f-baseline" ${e.isBaseline?'checked':''}> Mark as Baseline Profile
        </label>
        <div class="form-group" id="baseline-name-wrap" style="${e.isBaseline?'':'display:none'}">
          <label class="form-label">Baseline Name</label>
          <input class="form-input" id="f-baselinename" placeholder="e.g. PLA 0.4mm Default" value="${esc(e.baselineName||'')}">
        </div>
      </div>

      <!-- ── Settings Changed ── -->
      <button class="collapsible-toggle" onclick="toggleCollapse(this)">
        <span>🔧 What Settings Did I Change?</span><span class="collapsible-arrow">▾</span>
      </button>
      <div class="collapsible-body">${settingsHTML}</div>

      <!-- ── Scores ── -->
      <button class="collapsible-toggle" onclick="toggleCollapse(this)">
        <span>⭐ Score the Result</span><span class="collapsible-arrow">▾</span>
      </button>
      <div class="collapsible-body">
        <div class="score-grid">${scoresHTML}</div>
      </div>

      <!-- ── Notes ── -->
      <button class="collapsible-toggle" onclick="toggleCollapse(this)">
        <span>📝 Notes & Reflections</span><span class="collapsible-arrow">▾</span>
      </button>
      <div class="collapsible-body">
        <div class="form-group"><label class="form-label">✅ What improved?</label>
          <textarea class="form-textarea" id="f-improved" placeholder="What got better with these settings?">${esc(nt.whatImproved||'')}</textarea></div>
        <div class="form-group"><label class="form-label">📉 What got worse?</label>
          <textarea class="form-textarea" id="f-worsened" placeholder="Any regressions or tradeoffs?">${esc(nt.whatWorsened||'')}</textarea></div>
        <div class="form-group"><label class="form-label">💡 What surprised me?</label>
          <textarea class="form-textarea" id="f-surprise" placeholder="Unexpected results?">${esc(nt.surprises||'')}</textarea></div>
        <div class="form-group"><label class="form-label">🔬 What should I test next?</label>
          <textarea class="form-textarea" id="f-next" placeholder="Next experiment idea…">${esc(nt.testNext||'')}</textarea></div>
        <div class="form-group"><label class="form-label">📋 General Notes</label>
          <textarea class="form-textarea" id="f-general" style="min-height:100px" placeholder="Anything else worth noting…">${esc(nt.general||'')}</textarea></div>
        <div class="form-group"><label class="form-label">🏷️ Tags (comma-separated)</label>
          <input class="form-input" id="f-tags" placeholder="pla, support, miniature, detail" value="${(e.tags||[]).join(', ')}"></div>
      </div>

      <!-- ── Photos ── -->
      <button class="collapsible-toggle" onclick="toggleCollapse(this)">
        <span>📸 Photos</span><span class="collapsible-arrow">▾</span>
      </button>
      <div class="collapsible-body">
        <div class="photo-upload-area" id="photo-drop-zone" onclick="document.getElementById('photo-input').click()">
          <div class="photo-upload-icon">📷</div>
          <div class="photo-upload-text">Tap to add photos</div>
          <div class="photo-upload-sub">Camera · Gallery · Files (auto-compressed)</div>
        </div>
        <input type="file" id="photo-input" accept="image/*" multiple capture="environment" style="display:none" onchange="handlePhotoUpload(event)">
        <div class="photo-grid" id="photo-preview-grid"></div>
      </div>

      <div class="form-save-bar">
        <button class="btn btn-primary btn-lg" onclick="saveExperiment()">
          ${editId ? '💾 Save Changes' : '🚀 Log Experiment'}
        </button>
        <button class="btn btn-ghost" onclick="navigate('experiments')">Cancel</button>
      </div>
    </div>
  `;

  // Baseline name toggle
  document.getElementById('f-baseline')?.addEventListener('change', function() {
    document.getElementById('baseline-name-wrap').style.display = this.checked ? 'block' : 'none';
  });

  // Slider colors on load
  document.querySelectorAll('.score-slider').forEach(sl => updateSliderColor(sl));

  // Load existing photos if editing
  if (editId && existing) {
    state.pendingPhotos = [];
    const existingPhotos = await DB.photos.getByExperiment(editId);
    existingPhotos.forEach(p => { state.pendingPhotos.push({ id: p.id, dataUrl: p.dataUrl, caption: p.caption, sizeKB: p.sizeKB, existing: true }); });
    renderPhotoPreviews();
  }
}

window.toggleCollapse = function(btn) {
  const body = btn.nextElementSibling;
  if (!body) return;
  btn.classList.toggle('open');
  body.classList.toggle('open');
};

window.toggleSettingRow = function(slug) {
  const det = document.getElementById('srd-' + slug);
  const chk = document.getElementById('chk-' + slug);
  if (det) det.classList.toggle('hidden', !chk.checked);
};

window.updateSliderColor = function(el) {
  const val = parseInt(el.value);
  const pct = ((val - 1) / 9) * 100;
  const color = val >= 8 ? '#22c55e' : val >= 5 ? '#00b4c8' : '#ef4444';
  el.style.background = `linear-gradient(to right, ${color} ${pct}%, var(--border) ${pct}%)`;
};

window.handlePhotoUpload = async function(evt) {
  const files = [...evt.target.files];
  for (const file of files) {
    try {
      const compressed = await compressImage(file);
      state.pendingPhotos.push({ id: uuid(), dataUrl: compressed.dataUrl, caption: 'other', sizeKB: compressed.sizeKB });
    } catch { toast('Could not process image', 'error'); }
  }
  renderPhotoPreviews();
  evt.target.value = '';
};

function renderPhotoPreviews() {
  const grid = document.getElementById('photo-preview-grid');
  if (!grid) return;
  const captions = ['top surface','underside','supports','failed area','side view','close detail','other'];
  grid.innerHTML = state.pendingPhotos.map((p, i) => `
    <div class="photo-thumb-wrap">
      <img class="photo-thumb" src="${p.dataUrl}" onclick="openLightbox('${p.dataUrl}')" alt="">
      <button class="photo-thumb-del" onclick="removePhoto(${i})">✕</button>
      <select class="photo-caption-sel" onchange="state.pendingPhotos[${i}].caption=this.value" style="width:100%;font-size:10px;margin-top:2px;background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border);border-radius:4px;padding:2px">
        ${captions.map(c=>`<option ${p.caption===c?'selected':''}>${c}</option>`).join('')}
      </select>
      <div class="photo-caption">${p.sizeKB}KB</div>
    </div>`).join('');
}

window.removePhoto = function(i) {
  state.pendingPhotos.splice(i, 1);
  renderPhotoPreviews();
};

async function saveExperiment() {
  const title = document.getElementById('f-title')?.value?.trim();
  if (!title) { toast('Please enter an experiment title', 'error'); document.getElementById('f-title')?.focus(); return; }

  // Collect settings changed
  const settingsChanged = [];
  document.querySelectorAll('.setting-check:checked').forEach(chk => {
    const slug = chk.id.replace('chk-', '');
    settingsChanged.push({
      category: chk.dataset.cat,
      setting:  chk.dataset.setting,
      oldValue: document.querySelector(`[data-field="old-${slug}"]`)?.value || '',
      newValue: document.querySelector(`[data-field="new-${slug}"]`)?.value || '',
      notes:    document.querySelector(`[data-field="note-${slug}"]`)?.value || '',
    });
  });

  // Collect scores
  const scores = {};
  SCORE_KEYS.forEach(({ key }) => {
    scores[key] = parseInt(document.getElementById(`score-${key}`)?.value || 5);
  });

  const isBaseline = document.getElementById('f-baseline')?.checked ? 1 : 0;
  const isNew = !state.editingId;

  const record = {
    id: state.editingId || uuid(),
    title,
    createdAt: new Date(document.getElementById('f-datetime')?.value || Date.now()).toISOString(),
    printerModel: document.getElementById('f-printer')?.value || X2D_DEFAULTS.printerModel,
    bambuStudioProfile: document.getElementById('f-profile')?.value || X2D_DEFAULTS.bambuStudioProfile,
    modelName:    document.getElementById('f-modelname')?.value || '',
    modelType:    document.getElementById('f-modeltype')?.value || 'functional part',
    filament: {
      brand:     document.getElementById('f-brand')?.value || 'Bambu Lab',
      material:  document.getElementById('f-material')?.value || 'PLA',
      color:     document.getElementById('f-color')?.value || '',
      condition: document.getElementById('f-condition')?.value || 'new',
    },
    hardware: {
      nozzleSize:   document.getElementById('f-nozzle')?.value || X2D_DEFAULTS.nozzleSize,
      buildPlate:   document.getElementById('f-plate')?.value || X2D_DEFAULTS.buildPlate,
      bedAdhesive:  document.getElementById('f-adhesive')?.value || 'none',
      amsUsed:      document.getElementById('f-ams')?.checked ?? true,
      dualMaterial: document.getElementById('f-dual')?.checked || false,
      supportUsed:  document.getElementById('f-supports')?.checked || false,
    },
    settingsChanged,
    scores,
    result: {
      status:      document.getElementById('f-status')?.value || 'success',
      failureType: document.getElementById('f-failtype')?.value || 'none',
    },
    notes: {
      whatImproved: document.getElementById('f-improved')?.value || '',
      whatWorsened: document.getElementById('f-worsened')?.value || '',
      surprises:    document.getElementById('f-surprise')?.value || '',
      testNext:     document.getElementById('f-next')?.value || '',
      general:      document.getElementById('f-general')?.value || '',
    },
    estimatedPrintTime: document.getElementById('f-esttime')?.value || '',
    actualPrintTime:    document.getElementById('f-acttime')?.value || '',
    printWeight:        document.getElementById('f-weight')?.value || '',
    tags: document.getElementById('f-tags')?.value.split(',').map(t=>t.trim()).filter(Boolean) || [],
    isBaseline,
    baselineName: isBaseline ? (document.getElementById('f-baselinename')?.value || '') : '',
    photoIds: state.pendingPhotos.map(p => p.id),
  };

  // Save photos
  for (const ph of state.pendingPhotos) {
    await DB.photos.save({ id: ph.id, experimentId: record.id, dataUrl: ph.dataUrl, caption: ph.caption, sizeKB: ph.sizeKB });
  }

  await DB.experiments.save(record);
  await refreshState();

  // XP awards
  if (isNew) {
    await awardXP(30, 'Experiment Logged');
    if (record.result.status === 'success')   await awardXP(20, 'Successful Print!');
    if (record.settingsChanged.length >= 3)   await awardXP(15, 'Settings Tuning');
    if (state.pendingPhotos.length > 0)        await awardXP(10, 'Photo Documented');
    if (scores.overallQuality >= 9)            await awardXP(25, 'Near-Perfect Score');
  } else {
    await awardXP(5, 'Experiment Updated');
  }

  await checkAchievements();
  toast(`${isNew ? '🚀 Experiment logged!' : '✅ Changes saved!'} +XP awarded`, 'success');
  state.editingId = null;
  state.pendingPhotos = [];
  navigate('experiments');
}

// ─── Detail Screen ────────────────────────────────────────────────────────────
async function renderDetailScreen(id) {
  const exp = await DB.experiments.getById(id);
  if (!exp) { toast('Experiment not found', 'error'); navigate('experiments'); return; }

  const expPhotos = await DB.photos.getByExperiment(id);
  const statusClass = statusBadge(exp.result?.status);
  const screen = document.getElementById('screen-detail');

  const scoresDisplay = SCORE_KEYS.map(({ key, label, emoji }) => {
    const val = exp.scores?.[key] || 0;
    const color = val >= 8 ? 'var(--success)' : val >= 5 ? 'var(--accent)' : 'var(--failed)';
    const width = (val / 10 * 100) + '%';
    return `<div class="detail-score-row">
      <div class="detail-score-label">${emoji} ${label}</div>
      <div class="detail-score-bar"><div class="detail-score-fill" style="width:${width};background:${color}"></div></div>
      <div class="detail-score-num" style="color:${color}">${val}</div>
    </div>`;
  }).join('');

  screen.innerHTML = `
    <div class="section-header">
      <button class="btn btn-ghost btn-sm" onclick="navigate('experiments')">← Back</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-secondary" onclick="navigate('new-experiment',{editId:'${id}'})">✏️ Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteExp('${id}',true)">🗑 Delete</button>
      </div>
    </div>

    <div class="detail-hero">
      <div class="detail-hero-main">
        <div class="detail-title">${esc(exp.title)}</div>
        <div class="detail-badges">
          <span class="badge ${statusClass}">${exp.result?.status||'?'}</span>
          ${exp.isBaseline ? `<span class="badge badge-baseline">⭐ ${exp.baselineName||'Baseline'}</span>` : ''}
          <span class="badge badge-accent">${exp.filament?.material||'?'}</span>
          <span class="badge badge-accent">${exp.hardware?.nozzleSize||'?'}</span>
        </div>
        <div class="detail-date">${fmtDateFull(exp.createdAt)}</div>
      </div>
      <div class="overall-score-ring" style="--score:${exp.scores?.overallQuality||0}">
        <div class="overall-score-num">${exp.scores?.overallQuality||'?'}</div>
        <div class="overall-score-sub">/ 10</div>
      </div>
    </div>

    <div class="detail-meta-grid grid-2" style="margin-bottom:16px">
      ${metaItem('Printer',exp.printerModel)}
      ${metaItem('Studio Profile',exp.bambuStudioProfile)}
      ${metaItem('Model',exp.modelName)}
      ${metaItem('Type',exp.modelType)}
      ${metaItem('Filament',`${exp.filament?.brand} ${exp.filament?.material} · ${exp.filament?.color}`)}
      ${metaItem('Condition',exp.filament?.condition)}
      ${metaItem('Build Plate',exp.hardware?.buildPlate)}
      ${metaItem('Adhesive',exp.hardware?.bedAdhesive)}
      ${metaItem('Est. Time',exp.estimatedPrintTime||'—')}
      ${metaItem('Actual Time',exp.actualPrintTime||'—')}
      ${metaItem('Print Weight',exp.printWeight||'—')}
      ${metaItem('AMS',exp.hardware?.amsUsed?'Yes':'No')}
    </div>

    ${expPhotos.length ? `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">📸 Photos</div>
      <div class="photo-grid">${expPhotos.map(p=>`
        <div class="photo-thumb-wrap">
          <img class="photo-thumb" src="${p.dataUrl}" onclick="openLightbox('${p.dataUrl}')" alt="${p.caption||''}">
          <div class="photo-caption">${p.caption||''}</div>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">⭐ Scores</div>
      ${scoresDisplay}
    </div>

    <div class="card chart-card" style="height:260px;margin-bottom:16px">
      <div class="card-title">Radar Overview</div>
      <canvas id="detail-radar" height="220"></canvas>
    </div>

    ${(exp.settingsChanged||[]).length ? `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">🔧 Settings Changed (${exp.settingsChanged.length})</div>
      ${(exp.settingsChanged||[]).map(s=>`
        <div class="settings-diff-row">
          <span class="setting-tag-cat">${s.category}</span>
          <strong>${esc(s.setting)}</strong>
          ${s.oldValue?`<span class="diff-old">${esc(s.oldValue)} →</span>`:''}
          ${s.newValue?`<span class="diff-new">${esc(s.newValue)}</span>`:''}
          ${s.notes?`<span class="diff-note">· ${esc(s.notes)}</span>`:''}
        </div>`).join('')}
    </div>` : ''}

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">📝 Notes</div>
      ${noteRow('✅ What improved', exp.notes?.whatImproved)}
      ${noteRow('📉 What got worse', exp.notes?.whatWorsened)}
      ${noteRow('💡 Surprises', exp.notes?.surprises)}
      ${noteRow('🔬 Test next', exp.notes?.testNext)}
      ${noteRow('📋 General', exp.notes?.general)}
    </div>

    <div class="detail-actions">
      <button class="btn btn-secondary" onclick="duplicateExp('${id}')">📋 Duplicate as New Test</button>
      <button class="btn btn-secondary" onclick="toggleCompare('${id}');navigate('compare')">⚖️ Add to Compare</button>
      <button class="btn ${exp.isBaseline?'btn-primary':'btn-secondary'}" onclick="toggleBaseline('${id}')">
        ${exp.isBaseline ? '⭐ Remove Baseline' : '⭐ Set as Baseline'}
      </button>
    </div>
  `;

  setTimeout(() => renderRadar('detail-radar', [exp]), 50);
}

function metaItem(k, v) {
  return `<div class="meta-row"><div class="meta-key">${k}</div><div class="meta-val">${esc(String(v||'—'))}</div></div>`;
}
function noteRow(label, val) {
  if (!val) return '';
  return `<div class="note-row"><div class="note-row-label">${label}</div><div class="note-row-val">${esc(val)}</div></div>`;
}

// ─── Quick Notes ──────────────────────────────────────────────────────────────
function renderNotesScreen() {
  const screen = document.getElementById('screen-notes');
  const sorted = [...state.notes].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const TAGS = ['idea','problem','setting to test','filament issue','maintenance','support issue','surface finish','dimensional accuracy'];

  screen.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">📝 Quick Notes</div><div class="section-sub">${sorted.length} notes</div></div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-title">✏️ New Note</div>
      <div class="form-group"><textarea class="form-textarea" id="note-text" placeholder="Quick thought, observation, or idea…" style="min-height:80px"></textarea></div>
      <div class="form-group"><label class="form-label">Tags</label>
        <div class="tag-picker">${TAGS.map(t=>`<button class="tag-pick-btn" data-tag="${t}" onclick="toggleTagBtn(this)">${t}</button>`).join('')}</div>
      </div>
      <button class="btn btn-primary" onclick="saveNote()">💾 Save Note</button>
    </div>

    ${sorted.length === 0 ? emptyState('💡','No notes yet','Jot down ideas, observations, or things to test next.') : ''}
    <div id="notes-list">
    ${sorted.map(n => `
      <div class="note-card">
        <div class="note-card-header">
          <div class="note-card-text">${esc(n.text||'')}</div>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteNote('${n.id}')">🗑</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div class="note-card-date">${fmtDateFull(n.createdAt)}</div>
          <div class="note-card-tags">${(n.tags||[]).map(t=>`<span class="note-tag">${t}</span>`).join('')}</div>
        </div>
      </div>`).join('')}
    </div>
  `;
}

window.toggleTagBtn = function(btn) { btn.classList.toggle('active'); };

window.saveNote = async function() {
  const text = document.getElementById('note-text')?.value?.trim();
  if (!text) { toast('Write something first!', 'error'); return; }
  const tags = [...document.querySelectorAll('.tag-pick-btn.active')].map(b => b.dataset.tag);
  await DB.notes.save({ id: uuid(), text, tags, createdAt: new Date().toISOString() });
  await awardXP(5, 'Note Saved');
  await refreshState();
  await checkAchievements();
  toast('Note saved! 📝', 'success');
  renderNotesScreen();
};

window.deleteNote = async function(id) {
  if (!confirm('Delete this note?')) return;
  await DB.notes.delete(id);
  await refreshState();
  renderNotesScreen();
};

// ─── Maintenance ──────────────────────────────────────────────────────────────
function renderMaintenanceScreen() {
  const screen = document.getElementById('screen-maintenance');
  const sorted = [...state.maintenance].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const ICONS = { 'nozzle change':'🔩','plate cleaning':'🧹','filament dried':'🌡️','AMS issue':'⚠️','calibration':'📐','lubrication':'🛢️','belt check':'⚙️','firmware note':'💻','extruder cleaning':'🔧','other':'🔨' };
  const TYPES = Object.keys(ICONS);

  screen.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">🔧 Maintenance Log</div><div class="section-sub">${sorted.length} entries</div></div>
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="card-title">New Maintenance Entry</div>
      <div class="grid-2">
        <div class="form-group"><label class="form-label">Type</label>
          <select class="form-select" id="m-type">${TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Date</label>
          <input class="form-input" type="date" id="m-date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label>
        <textarea class="form-textarea" id="m-notes" placeholder="What was done, why, any observations…"></textarea></div>
      <button class="btn btn-primary" onclick="saveMaintenance()">🔧 Log Maintenance</button>
    </div>
    ${sorted.length === 0 ? emptyState('🔧','No maintenance logged','Track nozzle changes, calibrations, plate cleaning, and more.') : ''}
    <div>
    ${sorted.map(m => `
      <div class="card maint-item" style="margin-bottom:10px">
        <div class="maint-card">
          <div class="maint-icon">${ICONS[m.type]||'🔧'}</div>
          <div class="maint-body">
            <div class="maint-title">${esc(m.type)}</div>
            <div class="maint-date">${fmtDateFull(m.date)}</div>
            ${m.notes ? `<div style="font-size:13px;margin-top:4px;color:var(--text-secondary)">${esc(m.notes)}</div>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteMaintenance('${m.id}')">🗑</button>
        </div>
      </div>`).join('')}
    </div>
  `;
}

window.saveMaintenance = async function() {
  const type = document.getElementById('m-type')?.value;
  await DB.maintenance.save({ id:uuid(), type, date: document.getElementById('m-date')?.value || new Date().toISOString(), notes: document.getElementById('m-notes')?.value || '' });
  await awardXP(10, 'Maintenance Logged');
  await refreshState();
  await checkAchievements();
  toast('Maintenance logged 🔧', 'success');
  renderMaintenanceScreen();
};

window.deleteMaintenance = async function(id) {
  if (!confirm('Delete entry?')) return;
  await DB.maintenance.delete(id);
  await refreshState();
  renderMaintenanceScreen();
};

// ─── Data / Settings Screen ───────────────────────────────────────────────────
async function renderDataScreen() {
  const lastExport = await DB.settings.get('lastExport');
  const lastImport = await DB.settings.get('lastImport');
  const seedLoaded = await DB.settings.get('seedLoaded');
  const screen = document.getElementById('screen-data');

  screen.innerHTML = `
    <div class="section-header">
      <div class="section-title">💾 Data & Settings</div>
    </div>

    <div class="data-card">
      <h3>📤 Export Data</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">Export all experiments, photos, notes, and maintenance as a single JSON file. Use this to back up your data or transfer to another device.</p>
      ${lastExport ? `<div class="last-backup">Last backup: ${fmtDateFull(lastExport)}</div>` : '<div class="last-backup" style="color:var(--failed)">⚠️ Never backed up</div>'}
      <button class="btn btn-primary" style="margin-top:12px" onclick="exportData()">💾 Export Now</button>
    </div>

    <div class="data-card">
      <h3>📥 Import Data</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">Import a previously exported JSON file. Choose whether to merge with existing data or replace it.</p>
      <div class="form-group">
        <label class="form-label">Import Mode</label>
        <select class="form-select" id="import-mode" style="max-width:200px">
          <option value="merge">Merge with existing</option>
          <option value="replace">Replace all data</option>
        </select>
      </div>
      <input type="file" id="import-file" accept=".json" style="display:none" onchange="handleImport(event)">
      <button class="btn btn-secondary" onclick="document.getElementById('import-file').click()">📂 Choose JSON File</button>
      ${lastImport ? `<div class="last-backup" style="margin-top:8px">Last import: ${fmtDateFull(lastImport)}</div>` : ''}
    </div>

    <div class="data-card">
      <h3>🌱 Sample Data</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">Load sample experiments to explore the app, or clear them once you start logging real prints.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="seedLoad()">🌱 Load Sample Data</button>
        <button class="btn btn-danger" onclick="seedClear()">🗑 Clear Sample Data</button>
      </div>
    </div>

    <div class="data-card">
      <h3>🎨 Theme</h3>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn ${state.theme==='dark'?'btn-primary':'btn-secondary'}" onclick="setTheme('dark')">🌙 Dark</button>
        <button class="btn ${state.theme==='light'?'btn-primary':'btn-secondary'}" onclick="setTheme('light')">☀️ Light</button>
      </div>
    </div>

    <div class="data-card">
      <h3>⚠️ Danger Zone</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">Permanently delete all data. This cannot be undone.</p>
      <button class="btn btn-danger" onclick="clearAllData()">💥 Clear All Data</button>
    </div>

    <div class="data-card" style="background:var(--bg-secondary);border-style:dashed">
      <h3>🔒 Privacy Notice</h3>
      <p style="font-size:13px;color:var(--text-secondary)">All data is stored locally in your browser's IndexedDB. Nothing is sent to any server. Clearing browser storage or site data will erase your records. <strong>Export regularly to keep your data safe.</strong></p>
    </div>

    <div class="data-card">
      <h3>🔧 Maintenance Log</h3>
      <button class="btn btn-secondary" onclick="navigate('maintenance')">View Maintenance Log →</button>
    </div>
  `;
}

// ─── Achievements Screen ──────────────────────────────────────────────────────
function renderAchievementsScreen() {
  const screen = document.getElementById('screen-achievements');
  const unlocked = state.unlockedAchievements;
  const pct = Math.round((unlocked.length / ACHIEVEMENTS.length) * 100);

  screen.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">🏆 Achievements</div>
      <div class="section-sub">${unlocked.length}/${ACHIEVEMENTS.length} unlocked · ${state.xp} XP total</div></div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="xp-level-badge" id="xp-level">Lv ${state.level}</span>
        <span style="font-size:13px;color:var(--text-muted)">${pct}% complete</span>
      </div>
      <div class="xp-bar-track" style="height:10px;border-radius:5px">
        <div class="xp-bar-fill" id="xp-bar-fill" style="width:${xpProgress()}%;height:100%;border-radius:5px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:4px">
        <span class="section-sub">${state.xp} XP</span>
        <span class="section-sub">Next level: ${levelToXP(state.level+1)} XP</span>
      </div>
    </div>

    <div class="achievements-grid">
    ${ACHIEVEMENTS.map(ach => {
      const done = unlocked.includes(ach.id);
      return `<div class="ach-card ${done ? 'ach-done' : 'ach-locked'}">
        <div class="ach-emoji">${done ? ach.emoji : '🔒'}</div>
        <div class="ach-body">
          <div class="ach-title">${ach.title}</div>
          <div class="ach-desc">${ach.desc}</div>
        </div>
        <div class="ach-xp ${done?'ach-xp-done':''}">+${ach.xp}</div>
      </div>`;
    }).join('')}
    </div>
  `;
}

// ─── Helpers: Export/Import/Delete ───────────────────────────────────────────
window.exportData = async function() {
  const data = await DB.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `bambu-lab-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  await DB.settings.set('lastExport', new Date().toISOString());
  state.exports++;
  await DB.settings.set('exports', state.exports);
  await refreshState();
  await checkAchievements();
  toast('📦 Data exported!', 'success');
  if (state.currentScreen === 'data') renderDataScreen();
};

window.handleImport = async function(evt) {
  const file = evt.target.files[0]; if (!file) return;
  const mode = document.getElementById('import-mode')?.value || 'merge';
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.experiments && !data.notes) { toast('Invalid backup file', 'error'); return; }
    if (mode === 'replace' && !confirm('This will REPLACE all current data. Are you sure?')) return;
    await DB.importAll(data, mode);
    await refreshState();
    toast(`✅ Import complete! ${(data.experiments||[]).length} experiments loaded.`, 'success');
    navigate('dashboard');
  } catch { toast('Failed to parse JSON file', 'error'); }
  evt.target.value = '';
};

window.seedLoad = async function() {
  await loadSeedData();
  await refreshState();
  toast('🌱 Sample data loaded!', 'success');
  navigate('dashboard');
};

window.seedClear = async function() {
  if (!confirm('Clear all sample data?')) return;
  await clearSeedData();
  await refreshState();
  toast('🗑 Sample data cleared', 'info');
  if (state.currentScreen === 'data') renderDataScreen();
};

window.setTheme = function(theme) {
  state.theme = theme;
  applyTheme(theme);
  DB.settings.set('theme', theme);
  refreshAll();
  if (state.currentScreen === 'data') renderDataScreen();
};

window.clearAllData = async function() {
  if (!confirm('Delete ALL data permanently? This cannot be undone.')) return;
  if (!confirm('Are you absolutely sure? All experiments, photos, and notes will be lost.')) return;
  // Use import to clear — re-use the importAll replace path with empty data
  await DB.importAll({ experiments:[], photos:[], notes:[], maintenance:[] }, 'replace');
  state.xp = 0; state.unlockedAchievements = [];
  await DB.settings.set('xp', 0);
  await DB.settings.set('achievements', []);
  await refreshState();
  toast('All data cleared', 'info');
  navigate('dashboard');
};

// ─── Misc Actions ─────────────────────────────────────────────────────────────
window.deleteExp = async function(id, fromDetail = false) {
  if (!confirm('Delete this experiment? This cannot be undone.')) return;
  const photos = await DB.photos.getByExperiment(id);
  for (const p of photos) await DB.photos.delete(p.id);
  await DB.experiments.delete(id);
  await refreshState();
  toast('Experiment deleted', 'info');
  if (fromDetail) navigate('experiments');
  else if (state.currentScreen === 'experiments') renderExperimentList();
};

window.duplicateExp = async function(id) {
  const orig = await DB.experiments.getById(id); if (!orig) return;
  const copy = { ...orig, id: uuid(), title: orig.title + ' (Copy)', createdAt: null, updatedAt: null, photoIds: [], isBaseline: 0, baselineName: '', isSeed: false };
  await DB.experiments.save(copy);
  await refreshState();
  toast('📋 Duplicated! Now editing copy…', 'success');
  navigate('new-experiment', { editId: copy.id });
};

window.toggleBaseline = async function(id) {
  const exp = await DB.experiments.getById(id); if (!exp) return;
  if (!exp.isBaseline) {
    const name = prompt('Name this baseline profile:', exp.title);
    if (name === null) return;
    exp.isBaseline = 1; exp.baselineName = name;
    await awardXP(20, 'Baseline Set');
  } else {
    exp.isBaseline = 0; exp.baselineName = '';
  }
  await DB.experiments.save(exp);
  await refreshState();
  await checkAchievements();
  navigate('detail', { id });
};

// ─── Lightbox ─────────────────────────────────────────────────────────────────
window.openLightbox = function(src) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = src;
  lb.classList.add('open');
};

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ─── Global events ────────────────────────────────────────────────────────────
function setupGlobalEvents() {
  document.getElementById('lightbox')?.addEventListener('click', e => {
    if (e.target.id === 'lightbox' || e.target.id === 'lightbox-close')
      document.getElementById('lightbox').classList.remove('open');
  });
  document.getElementById('theme-btn')?.addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-'); }
function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' });
}
function fmtDateFull(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
}
function statusBadge(s) {
  return { success:'badge-success','partial success':'badge-partial',failed:'badge-failed',cancelled:'badge-cancelled' }[s]||'badge-cancelled';
}
function emptyState(icon, title, sub) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><h3>${title}</h3><p>${sub}</p></div>`;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toast(msg, type = 'info') {
  const wrap = document.getElementById('toast-container');
  const el   = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity 0.4s'; setTimeout(()=>el.remove(),400); }, 3000);
}

// expose navigate globally for inline onclick handlers
window.navigate = navigate;


// ─── Start ────────────────────────────────────────────────────────────────────
boot().catch(err => {
  document.body.innerHTML = `<div style="padding:32px;font-family:sans-serif;color:#ef4444"><h2>Boot Error</h2><pre>${err.message}</pre></div>`;
  console.error(err);
});
