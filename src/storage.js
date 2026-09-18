import {validateInput} from './engine.js';
import {STATIONS} from './data.js';
export const STORAGE_KEY='commute-copilot-journey-v1';
export function saveJourney(storage,state){
  const payload={...state,version:1,savedAt:new Date().toISOString()};
  try{const raw=JSON.stringify(payload);storage.setItem(STORAGE_KEY,raw);if(storage.getItem(STORAGE_KEY)!==raw)throw Error('Write not verified');return {ok:true,payload};}
  catch{return {ok:false,error:'Could not save on this device. Check browser storage and try again.'};}
}
export function restoreJourney(storage){
  try{const p=JSON.parse(storage.getItem(STORAGE_KEY));if(!p||p.version!==1||!p.input||validateInput(p.input).length||!Array.isArray(p.routes)||p.routes.length!==2||!['direct','circle'].every(id=>p.routes.some(r=>r?.id===id))||p.routes.some(r=>!validRoute(r))||!['direct','circle'].includes(p.selected)||!['normal','planned','disruption'].includes(p.scene)||!['origin','payalebar'].includes(p.current)||!Number.isFinite(Date.parse(p.savedAt))||!validGeometry(p.geometry))return null;return p;}catch{return null;}
}
function validRoute(r){return !!r&&[r.arrival,r.duration,r.walking,r.totalWalking,r.buffer].every(Number.isFinite)&&typeof r.feasible==='boolean'&&Array.isArray(r.reasons)&&Array.isArray(r.affected)&&Array.isArray(r.legs)&&r.legs.length>0&&r.legs.every(l=>l&&['walk','wait','ride'].includes(l.type)&&[l.minutes,l.start,l.end].every(Number.isFinite)&&l.minutes>=0&&l.end>=l.start&&typeof l.text==='string'&&(l.type==='ride'?Array.isArray(l.stops)&&l.stops.length>=2&&l.stops.every(s=>STATIONS[s]):!!STATIONS[l.station]));}
function validGeometry(g){return g?.type==='FeatureCollection'&&Array.isArray(g.features)&&g.features.length>0&&g.features.every(f=>f?.geometry?.type==='LineString'&&f.properties&&Array.isArray(f.geometry.coordinates)&&f.geometry.coordinates.length>=2&&f.geometry.coordinates.every(p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90));}
export function sourceState({online,checkedAt,status},now=Date.now()){
  if(!online)return 'offline';if(status==='unavailable'||status==='partial')return status;
  if(!checkedAt||!Number.isFinite(Date.parse(checkedAt))||Date.parse(checkedAt)>now+30000||now-Date.parse(checkedAt)>120000)return 'stale';return status==='replay'?'replay':'available';
}
