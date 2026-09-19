import {RAIL_DISTANCE_VERSION,RAIL_DISTANCE_STATIONS,RAIL_DISTANCE_EDGES,RAIL_DISTANCE_ALIASES} from './fare-distance-data.js';
export {RAIL_DISTANCE_VERSION,BUS_CATEGORY_VERSION,BUS_FARE_CATEGORIES} from './fare-distance-data.js';

const links=new Map(Object.keys(RAIL_DISTANCE_STATIONS).map(id=>[id,[]]));
for(const [from,to,metres] of RAIL_DISTANCE_EDGES)links.get(from).push({to,metres});
const cache=new Map();
function validDate(date){
  if(typeof date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(date))return false;
  const time=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date&&date>=RAIL_DISTANCE_VERSION.validFrom&&date<=RAIL_DISTANCE_VERSION.validThrough;
}
function resolve(value){
  if(typeof value!=='string'||value.length>160)return null;
  const raw=value.trim().toUpperCase().replace(/_[AB]$/,'');
  if(links.has(raw))return raw;
  const key=value.trim().replace(/\s+(MRT|LRT)(?:\s+Station)?$/i,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  return Object.hasOwn(RAIL_DISTANCE_ALIASES,key)?RAIL_DISTANCE_ALIASES[key]:null;
}
function shortest(from,to){
  const key=from+'|'+to;if(cache.has(key))return cache.get(key);
  const distances=new Map([[from,0]]),visited=new Set();let result=null;
  while(true){
    let current=null,best=Infinity;
    for(const [id,distance] of distances)if(!visited.has(id)&&distance<best){current=id;best=distance;}
    if(current===null)break;
    if(current===to){result=best;break;}
    visited.add(current);
    for(const next of links.get(current))if(best+next.metres<(distances.get(next.to)??Infinity))distances.set(next.to,best+next.metres);
  }
  cache.set(key,result);return result;
}

// Only use as a labelled estimate when an official fare distance is unavailable.
// Returning null for a zero-distance paid-area change prevents inventing a ride.
export function approximateRailDistance(from,to,date){
  if(!validDate(date))return null;
  const origin=resolve(from),destination=resolve(to);if(!origin||!destination||origin===destination)return null;
  const metres=shortest(origin,destination);if(metres===null||metres<=0)return null;
  return {kind:'estimated-rail-distance',metres:Math.ceil(metres/100)*100,from:origin,to:destination,source:RAIL_DISTANCE_VERSION.source,sourceVersion:RAIL_DISTANCE_VERSION.sourceVersion,networkSha256:RAIL_DISTANCE_VERSION.networkSha256,method:RAIL_DISTANCE_VERSION.method,reviewedAt:RAIL_DISTANCE_VERSION.reviewedAt,validFrom:RAIL_DISTANCE_VERSION.validFrom,validThrough:RAIL_DISTANCE_VERSION.validThrough};
}
