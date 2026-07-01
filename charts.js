const chartState={};
function isDarkMode(){return document.body.dataset.theme==='dark';}
function chartPalette(){
  const dark=isDarkMode();
  return {
    text: dark ? '#f4f6fb' : '#171923',
    muted: dark ? '#c7d2e7' : '#4b5563',
    grid: dark ? 'rgba(226,232,240,.28)' : 'rgba(15,23,42,.16)',
    axis: dark ? 'rgba(226,232,240,.9)' : 'rgba(15,23,42,.75)',
    fills: dark
      ? ['rgba(125,165,255,.82)','rgba(95,210,138,.82)','rgba(255,209,102,.82)','rgba(255,122,122,.82)','rgba(190,160,255,.82)','rgba(103,232,249,.82)','rgba(251,146,60,.82)','rgba(244,114,182,.82)']
      : ['rgba(37,99,235,.78)','rgba(21,128,61,.78)','rgba(180,83,9,.78)','rgba(185,28,28,.78)','rgba(124,58,237,.78)','rgba(8,145,178,.78)','rgba(234,88,12,.78)','rgba(219,39,119,.78)'],
    strokes: dark
      ? ['#a8c3ff','#8af0b0','#ffe08a','#ff9c9c','#d3bbff','#9af3ff','#fdba74','#f9a8d4']
      : ['#1d4ed8','#15803d','#b45309','#b91c1c','#6d28d9','#0e7490','#c2410c','#be185d']
  };
}
function withDatasetColors(datasets){
  const p=chartPalette();
  return datasets.map((ds,i)=>({
    borderColor: ds.borderColor || p.strokes[i%p.strokes.length],
    backgroundColor: ds.backgroundColor || (ds.type==='line' ? p.fills[i%p.fills.length] : p.fills[i%p.fills.length]),
    pointBackgroundColor: ds.pointBackgroundColor || p.strokes[i%p.strokes.length],
    pointBorderColor: ds.pointBorderColor || p.text,
    borderWidth: ds.borderWidth || 2,
    ...ds
  }));
}
function baseOptions(extra={}){
  const p=chartPalette();
  return {
    responsive:true,
    maintainAspectRatio:false,
    color:p.text,
    plugins:{
      legend:{position:'bottom',labels:{color:p.text,boxWidth:14,usePointStyle:true}},
      tooltip:{titleColor:'#fff',bodyColor:'#fff',backgroundColor:'rgba(15,23,42,.92)',borderColor:p.grid,borderWidth:1}
    },
    scales:{
      x:{ticks:{color:p.axis},grid:{color:p.grid},border:{color:p.grid}},
      y:{ticks:{color:p.axis},grid:{color:p.grid},border:{color:p.grid}},
      r:{angleLines:{color:p.grid},grid:{color:p.grid},pointLabels:{color:p.text},ticks:{color:p.axis,backdropColor:isDarkMode()?'rgba(17,19,24,.85)':'rgba(255,255,255,.85)'}}
    },
    ...extra
  };
}
function mergeScaleOptions(base,extra){
  if(!extra.scales) return base;
  const merged={...base,scales:{...base.scales}};
  for(const [axis,val] of Object.entries(extra.scales)) merged.scales[axis]={...(merged.scales[axis]||{}),...val};
  return {...extra,...merged,scales:merged.scales};
}
function destroyChart(id){if(chartState[id]){chartState[id].destroy(); delete chartState[id];}}
function makeChart(id,type,data,options={}){
  destroyChart(id); const el=document.getElementById(id); if(!el||typeof Chart==='undefined') return;
  const colored={...data,datasets:withDatasetColors(data.datasets||[])};
  let opts=baseOptions(); opts=mergeScaleOptions(opts,options);
  chartState[id]=new Chart(el,{type,data:colored,options:opts});
}
function avg(nums){const n=nums.filter(x=>Number.isFinite(x)); return n.length? n.reduce((a,b)=>a+b,0)/n.length:0;}
function renderCharts(exps){
  const statusCounts=countBy(exps,e=>e.result.status||'unknown');
  makeChart('statusChart','doughnut',{labels:Object.keys(statusCounts),datasets:[{data:Object.values(statusCounts),backgroundColor:chartPalette().fills}]});
  const mats=[...new Set(exps.map(e=>e.filament.material||'unknown'))];
  makeChart('filamentChart','bar',{labels:mats,datasets:[{label:'Avg overall score',data:mats.map(m=>avg(exps.filter(e=>e.filament.material===m).map(e=>+e.scores.overallPrintQuality||0)))}]},{scales:{y:{beginAtZero:true,max:10}}});
  const cats={}; exps.forEach(e=>(e.settingsChanged||[]).forEach(s=>cats[s.category]=(cats[s.category]||0)+1));
  makeChart('settingsChart','bar',{labels:Object.keys(cats),datasets:[{label:'Changes logged',data:Object.values(cats)}]});
  const sorted=[...exps].sort((a,b)=>new Date(a.dateTime)-new Date(b.dateTime));
  makeChart('qualityChart','line',{labels:sorted.map(e=>new Date(e.dateTime||e.createdAt).toLocaleDateString()),datasets:[{label:'Overall quality',data:sorted.map(e=>+e.scores.overallPrintQuality||0),tension:.25,fill:false}]},{scales:{y:{beginAtZero:true,max:10}}});
  const best=[...exps].sort((a,b)=>(+b.scores.overallPrintQuality||0)-(+a.scores.overallPrintQuality||0))[0];
  const labels=['Surface','Strength','Accuracy','Support','Stringing','Overall'];
  const vals=best?[best.scores.surfaceFinish,best.scores.strength,best.scores.dimensionalAccuracy,best.scores.supportRemoval,best.scores.stringingControl,best.scores.overallPrintQuality].map(x=>+x||0):[0,0,0,0,0,0];
  makeChart('radarChart','radar',{labels,datasets:[{label:best?best.title:'No data',data:vals,backgroundColor:isDarkMode()?'rgba(122,162,255,.22)':'rgba(37,99,235,.18)'}]},{scales:{r:{beginAtZero:true,max:10}}});
}
function renderCompareRadar(a,b){
  const labels=['Surface','Strength','Accuracy','Support','Stringing','Overall'];
  const vals=e=>[e.scores.surfaceFinish,e.scores.strength,e.scores.dimensionalAccuracy,e.scores.supportRemoval,e.scores.stringingControl,e.scores.overallPrintQuality].map(x=>+x||0);
  setTimeout(()=>makeChart('compareRadar','radar',{labels,datasets:[{label:a.title,data:vals(a),backgroundColor:isDarkMode()?'rgba(122,162,255,.18)':'rgba(37,99,235,.16)'},{label:b.title,data:vals(b),backgroundColor:isDarkMode()?'rgba(95,210,138,.18)':'rgba(21,128,61,.16)'}]},{scales:{r:{beginAtZero:true,max:10}}}),0);
}
function countBy(arr,fn){return arr.reduce((o,x)=>{const k=fn(x);o[k]=(o[k]||0)+1;return o;},{});}
