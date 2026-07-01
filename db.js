const DB_NAME = 'bambuPrintLabTracker';
const DB_VERSION = 1;
const STORES = ['experiments','photos','notes','maintenance','appSettings'];
let db;
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=e=>{const d=e.target.result;STORES.forEach(s=>{if(!d.objectStoreNames.contains(s)) d.createObjectStore(s,{keyPath:'id'});});};req.onsuccess=e=>{db=e.target.result;resolve(db);};req.onerror=()=>reject(req.error);});}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function put(store,val){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(val);r.onsuccess=()=>res(val);r.onerror=()=>rej(r.error);});}
function getAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}
function getOne(store,id){return new Promise((res,rej)=>{const r=tx(store).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function del(store,id){return new Promise((res,rej)=>{const r=tx(store,'readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function clearStore(store){return new Promise((res,rej)=>{const r=tx(store,'readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
async function exportAllData(){const out={app:'Bambu Print Lab Tracker',version:1,exportedAt:new Date().toISOString()};for(const s of STORES) out[s]=await getAll(s); await put('appSettings',{id:'lastBackup',value:out.exportedAt}); return out;}
async function importAllData(data,mode='merge'){if(!data||!data.experiments) throw new Error('Invalid backup file.'); if(mode==='replace') for(const s of STORES) await clearStore(s); for(const s of STORES){if(Array.isArray(data[s])) for(const item of data[s]) await put(s,item);} await put('appSettings',{id:'lastBackup',value:new Date().toISOString()});}
function uuid(){return (crypto.randomUUID?crypto.randomUUID():'id-'+Date.now()+'-'+Math.random().toString(16).slice(2));}
async function imageToDataUrl(file,max=1200,quality=.78){return new Promise((resolve,reject)=>{const img=new Image();const reader=new FileReader();reader.onload=e=>{img.onload=()=>{let w=img.width,h=img.height;if(Math.max(w,h)>max){const r=max/Math.max(w,h);w=Math.round(w*r);h=Math.round(h*r);}const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality));};img.onerror=reject;img.src=e.target.result;};reader.onerror=reject;reader.readAsDataURL(file);});}
