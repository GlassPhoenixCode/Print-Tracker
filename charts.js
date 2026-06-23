/**
 * charts.js — Chart.js wrappers for Bambu Print Lab Tracker
 */
const registry = {};

function destroy(id) { if (registry[id]) { registry[id].destroy(); delete registry[id]; } }
function reg(id, c) { destroy(id); registry[id] = c; return c; }

const dark = () => document.documentElement.getAttribute('data-theme') !== 'light';
const grid = () => dark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
const lbl  = () => dark() ? '#94a3b8' : '#64748b';
const font = { family: "'Inter','Segoe UI',sans-serif", size: 11 };

const PAL = ['#00b4c8','#f59e0b','#22c55e','#a855f7','#ef4444','#f97316','#14b8a6','#ec4899'];

export function renderStatusDonut(id, counts) {
  destroy(id);
  const ctx = document.getElementById(id)?.getContext('2d'); if (!ctx) return;
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  reg(id, new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Success','Partial','Failed','Cancelled'],
      datasets: [{ data: [counts.success||0,counts.partial||0,counts.failed||0,counts.cancelled||0],
        backgroundColor: ['#22c55e','#f59e0b','#ef4444','#6b7280'], borderWidth: 0, hoverOffset: 8 }]
    },
    options: { cutout:'70%', plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: c => ` ${c.label}: ${c.raw} (${total?Math.round(c.raw/total*100):0}%)` } } }, animation:{duration:700} },
    plugins:[{ id:'ct', beforeDraw(chart) {
      const {width:w,height:h,ctx:c} = chart; c.save();
      c.textAlign='center'; c.textBaseline='middle';
      c.font=`bold ${Math.round(h*.18)}px ${font.family}`; c.fillStyle=dark()?'#e2e8f0':'#1e293b';
      c.fillText(total, w/2, h/2-8);
      c.font=`${Math.round(h*.09)}px ${font.family}`; c.fillStyle=lbl();
      c.fillText('total', w/2, h/2+12); c.restore();
    }}]
  }));
}

export function renderQualityByFilament(id, data) {
  destroy(id);
  const ctx = document.getElementById(id)?.getContext('2d'); if (!ctx) return;
  reg(id, new Chart(ctx, {
    type:'bar',
    data:{ labels:data.map(d=>d.label), datasets:[{ label:'Avg Quality', data:data.map(d=>d.avg), backgroundColor:data.map((_,i)=>PAL[i%PAL.length]+'cc'), borderColor:data.map((_,i)=>PAL[i%PAL.length]), borderWidth:1, borderRadius:5 }] },
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{min:0,max:10,grid:{color:grid()},ticks:{color:lbl(),font}}, x:{grid:{display:false},ticks:{color:lbl(),font}} }, plugins:{legend:{display:false}}, animation:{duration:600} }
  }));
}

export function renderExperimentsByCategory(id, data) {
  destroy(id);
  const ctx = document.getElementById(id)?.getContext('2d'); if (!ctx) return;
  reg(id, new Chart(ctx, {
    type:'bar',
    data:{ labels:data.map(d=>d.label), datasets:[{ data:data.map(d=>d.count), backgroundColor:'#00b4c8aa', borderColor:'#00b4c8', borderWidth:1, borderRadius:4 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, scales:{ x:{grid:{color:grid()},ticks:{color:lbl(),font}}, y:{grid:{display:false},ticks:{color:lbl(),font}} }, plugins:{legend:{display:false}}, animation:{duration:600} }
  }));
}

export function renderQualityOverTime(id, data) {
  destroy(id);
  const ctx = document.getElementById(id)?.getContext('2d'); if (!ctx) return;
  reg(id, new Chart(ctx, {
    type:'line',
    data:{ labels:data.map(d=>d.label), datasets:[{ label:'Quality', data:data.map(d=>d.score), borderColor:'#00b4c8', backgroundColor:'#00b4c822', borderWidth:2, pointRadius:4, pointHoverRadius:7, pointBackgroundColor:'#00b4c8', fill:true, tension:0.35 }] },
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{min:0,max:10,grid:{color:grid()},ticks:{color:lbl(),font}}, x:{grid:{display:false},ticks:{color:lbl(),font,maxTicksLimit:8}} }, plugins:{legend:{display:false}}, animation:{duration:600} }
  }));
}

export function renderRadar(id, experiments) {
  destroy(id);
  const ctx = document.getElementById(id)?.getContext('2d'); if (!ctx) return;
  const LABELS = ['Surface','Strength','Accuracy','Supports','Stringing','Overall'];
  const colors = [['#00b4c8','#00b4c822'],['#f59e0b','#f59e0b22'],['#a855f7','#a855f722']];
  reg(id, new Chart(ctx, {
    type:'radar',
    data:{
      labels:LABELS,
      datasets: experiments.map((e,i) => ({
        label: e.title.length>22 ? e.title.slice(0,20)+'…' : e.title,
        data: [e.scores?.surfaceFinish||0,e.scores?.strength||0,e.scores?.dimensionalAccuracy||0,e.scores?.supportRemoval||0,e.scores?.stringingControl||0,e.scores?.overallQuality||0],
        borderColor:colors[i%3][0], backgroundColor:colors[i%3][1], borderWidth:2, pointRadius:3
      }))
    },
    options:{ responsive:true, maintainAspectRatio:false, scales:{ r:{ min:0,max:10, ticks:{stepSize:2,color:lbl(),font,backdropColor:'transparent'}, grid:{color:grid()}, angleLines:{color:grid()}, pointLabels:{color:lbl(),font:{...font,size:10}} } }, plugins:{ legend:{display:experiments.length>1,labels:{color:lbl(),font,boxWidth:10}} }, animation:{duration:600} }
  }));
}

export function renderComparisonBars(id, a, b) {
  destroy(id);
  const ctx = document.getElementById(id)?.getContext('2d'); if (!ctx) return;
  const KEYS = [['overallQuality','Overall'],['surfaceFinish','Surface'],['dimensionalAccuracy','Accuracy'],['strength','Strength'],['supportRemoval','Supports'],['stringingControl','Stringing'],['overhangPerformance','Overhang'],['bridgingPerformance','Bridging']];
  reg(id, new Chart(ctx, {
    type:'bar',
    data:{
      labels:KEYS.map(([,l])=>l),
      datasets:[
        { label:a.title.slice(0,18), data:KEYS.map(([k])=>a.scores?.[k]||0), backgroundColor:'#00b4c8bb', borderColor:'#00b4c8', borderWidth:1, borderRadius:3 },
        { label:b.title.slice(0,18), data:KEYS.map(([k])=>b.scores?.[k]||0), backgroundColor:'#f59e0bbb', borderColor:'#f59e0b', borderWidth:1, borderRadius:3 },
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{min:0,max:10,grid:{color:grid()},ticks:{color:lbl(),font}}, x:{grid:{display:false},ticks:{color:lbl(),font}} }, plugins:{ legend:{labels:{color:lbl(),font,boxWidth:10}} }, animation:{duration:500} }
  }));
}

export function refreshAll() { Object.values(registry).forEach(c => c.update()); }
