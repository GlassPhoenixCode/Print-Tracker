# 🧪 Bambu Print Lab Tracker

A **gamified, local-first experiment tracker** for your Bambu Lab X2D + Bambu Studio 3D-printing workflow. Log experiments, record settings changes, score results, compare prints, earn XP, and unlock achievements — all stored privately in your browser.

---

## ✨ Features

| Section | What it does |
|---|---|
| 🏠 **Dashboard** | Stats, charts, streaks, XP level, best print card |
| 🧪 **Experiment Lab** | Searchable/filterable experiment archive |
| ➕ **New Experiment** | Full form with X2D defaults pre-filled |
| ⭐ **Scoring** | 12 score sliders per experiment |
| 🔧 **Settings Tracker** | 60+ Bambu Studio settings with old/new values |
| 📸 **Photos** | Camera capture, auto-compression, lightbox |
| ⚖️ **Compare** | Side-by-side diff with radar chart + auto-summary |
| ⭐ **Baselines** | Mark known-good settings for reference |
| 📝 **Quick Notes** | Fast notes with tags, no full form required |
| 🔧 **Maintenance Log** | Nozzle changes, calibrations, filament drying |
| 🏆 **Achievements** | 20 unlockable achievements + XP system |
| 💾 **Export / Import** | Full JSON backup with photos as base64 |
| 📱 **PWA** | Installable, works offline after first load |

---

## 🚀 Deploy to GitHub Pages

### Method 1 — Upload files directly

1. Create a new GitHub repository (e.g. `bambu-print-lab`)
2. Upload all files to the repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `db.js`
   - `charts.js`
   - `service-worker.js`
   - `manifest.json`
   - `README.md`
3. Go to **Settings → Pages → Source → Deploy from branch → main / root**
4. Visit `https://yourusername.github.io/bambu-print-lab/`

### Method 2 — Git CLI

```bash
git init
git add .
git commit -m "Initial commit — Bambu Print Lab Tracker"
git remote add origin https://github.com/yourusername/bambu-print-lab.git
git push -u origin main
# Then enable GitHub Pages in repo Settings
```

---

## 📱 Install as PWA (Phone / Desktop)

**iPhone / iPad:** Open in Safari → Share button → "Add to Home Screen"  
**Android:** Open in Chrome → Menu → "Add to Home Screen" or "Install App"  
**Desktop Chrome/Edge:** Look for the install icon in the address bar

Once installed, the app works **fully offline**.

---

## 🔒 Privacy

- **All data stays in your browser** — nothing is sent to any server, ever.
- Data lives in **IndexedDB** in your browser's local storage.
- ⚠️ **Clearing browser site data will erase all your experiments.** Export regularly!
- Photos are compressed to JPEG and stored as base64 in IndexedDB.

---

## 💾 Backing Up

**Always export your data before:**
- Clearing browser history or site data
- Switching devices
- Reinstalling your browser

Go to **Data & Settings → Export Now** to download a JSON backup. To restore, use **Import** on any device with this app.

---

## 🎮 XP & Achievements

| Action | XP |
|---|---|
| Log an experiment | +30 XP |
| Successful print | +20 XP |
| 3+ settings changed | +15 XP |
| Photo added | +10 XP |
| 9+ overall score | +25 XP |
| Log quick note | +5 XP |
| Log maintenance | +10 XP |
| Set a baseline | +20 XP |
| Export data | +5 XP (first time) |
| Each achievement | +50–1000 XP |

Level up by accumulating XP. Formula: `Level = 1 + √(XP / 80)`

---

## ⚙️ Default Settings (X2D)

The form pre-fills sensible defaults for the **Bambu Lab X2D**:

| Setting | Default |
|---|---|
| Printer | Bambu Lab X2D |
| Studio Profile | 0.20mm Standard @X2D |
| Nozzle | 0.4 mm |
| Build Plate | Textured PEI Plate |
| Adhesive | None |
| AMS | Enabled |

All defaults can be overridden per-experiment.

---

## 🧩 Adding More Settings

To add Bambu Studio settings, edit `db.js` → `SETTINGS_CATEGORIES` object. Add to any existing category or create a new key. No other changes needed.

```js
// Example: add a new Quality setting
Quality: [
  'Layer height',
  // ... existing settings ...
  'My New Setting',  // ← add here
],
```

---

## 📂 File Structure

```
bambu-print-lab/
├── index.html          Shell, nav, screen containers
├── styles.css          Dark/light theme, gamification UI
├── app.js              All screens, navigation, XP, achievements
├── db.js               IndexedDB layer, seed data, X2D defaults
├── charts.js           Chart.js wrappers (donut, radar, bar, line)
├── service-worker.js   Offline caching (PWA)
├── manifest.json       PWA install metadata
└── README.md           This file
```

---

## 🛠 Browser Support

- Chrome / Edge 90+ ✅
- Safari 15+ (iOS 15+) ✅
- Firefox 89+ ✅
- Requires: IndexedDB, ES Modules, CSS Custom Properties

---

## 📄 License

MIT — use freely, modify freely, share freely.
