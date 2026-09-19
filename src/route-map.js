import {icon} from './icons.js';
import {railLineStyle} from './rail-service-style.js';
export {railLineStyle} from './rail-service-style.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const coordinate=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);

export function routeModeStyle(step,routes=[]){
  const source=step?.source??step??{},type=step?.type??source.type,mode=String(source.mode??step?.mode??'').toLowerCase();
  if(['walk','transfer','access','exit','interchange'].includes(type)||mode==='walk')return {mode:'walk',color:'#5F6368',label:'Walk',name:'Walking',weight:4,dashArray:'1 9'};
  if(mode==='bus')return {mode:'bus',color:'#1A73E8',label:`Bus ${source.serviceNo??step?.serviceNo??source.routeId??''}`.trim(),name:'Bus',weight:6,dashArray:null};
  return {mode:'rail',...railLineStyle(source.routeId??step?.routeId,routes),weight:7,dashArray:null};
}

// Geometry and accepted instructions are read only. In particular, waits can
// appear between geometry entries, so stepIndex is the only valid association.
export function journeyMapSegments(route,{network,walking}={}){
  const routes=network?.routes??[];
  if(route?.geometry?.length)return route.geometry.flatMap(segment=>{
    const step=route.steps?.[segment.stepIndex];
    if(!step||!Array.isArray(segment.points)||segment.points.length<2||!segment.points.every(coordinate))return [];
    return [{points:segment.points,schematic:segment.kind==='schematic',...routeModeStyle(step,routes)}];
  });
  const legacy=route?.legacyRoute??route,stops=new Map((network?.stops??[]).map(stop=>[stop.id,stop]));
  return (legacy?.legs??route?.steps??[]).flatMap(step=>{
    const leg=step.source??step,type=step.type??leg.type;
    if(type==='wait')return [];
    const path=walking?.links?.find(path=>path.id===leg.pathId);
    const ids=leg.stopIds?.length?leg.stopIds:[leg.fromStopId,leg.toStopId];
    const points=path?.path?.waypoints?.map(p=>[p.lat,p.lon??p.lng])??ids.map(id=>{const stop=stops.get(id);return [stop?.lat,stop?.lon];});
    // Missing coordinates must not create a shortcut across an unknown stop.
    if(points.length<2||!points.every(coordinate)||points.every(p=>p[0]===points[0][0]&&p[1]===points[0][1]))return [];
    return [{points,schematic:!path,...routeModeStyle(step,routes)}];
  });
}

export function drawRouteSegments(layer,segments,{leaflet=globalThis.L,markers=true}={}){
  // Paint casings first so adjoining legs do not erase each other's colour.
  for(const segment of segments){
    leaflet.polyline(segment.points,{color:'#FFFFFF',weight:segment.weight+4,opacity:1,dashArray:segment.dashArray,lineCap:'round',lineJoin:'round',interactive:false,className:`journey-route-halo mode-${segment.mode}`}).addTo(layer);
  }
  for(const segment of segments){
    leaflet.polyline(segment.points,{color:segment.color,weight:segment.weight,opacity:1,dashArray:segment.dashArray,lineCap:'round',lineJoin:'round',interactive:false,className:`journey-route-line mode-${segment.mode}`}).addTo(layer);
    // A fine white centre pattern keeps buses distinguishable from blue rail
    // services even when the map is viewed without its legend.
    if(segment.mode==='bus')leaflet.polyline(segment.points,{color:'#FFFFFF',weight:1.5,opacity:.95,dashArray:'7 12',lineCap:'butt',interactive:false,className:'journey-bus-detail'}).addTo(layer);
  }
  if(markers){
    const seen=new Set();
    for(const segment of segments.filter(s=>s.mode!=='walk')){
      for(const point of [segment.points[0],segment.points.at(-1)]){
        const key=point.map(n=>n.toFixed(6)).join(',');if(seen.has(key))continue;seen.add(key);
        leaflet.circleMarker(point,{radius:4,weight:2,color:'#3C4043',fillColor:'#FFFFFF',fillOpacity:1,interactive:false,className:'journey-transfer-stop'}).addTo(layer);
      }
    }
    for(const segment of segments.filter(s=>s.mode!=='walk')){
      const middle=segment.points[Math.floor((segment.points.length-1)/2)],next=segment.points[Math.ceil((segment.points.length-1)/2)];
      const position=[(middle[0]+next[0])/2,(middle[1]+next[1])/2];
      leaflet.marker(position,{interactive:false,keyboard:false,zIndexOffset:-100,icon:leaflet.divIcon({className:'map-service-marker',html:`<span class="map-service-badge" style="--route-color:${segment.color}" aria-label="${esc(segment.name+' '+segment.label)}">${icon(segment.mode==='bus'?'bus':'train',14)}${esc(segment.label)}</span>`,iconSize:[1,1],iconAnchor:[0,0]})}).addTo(layer);
    }
  }
  return {points:segments.flatMap(segment=>segment.points),schematic:segments.some(segment=>segment.schematic),segments};
}

export function routeLegendHTML(segments){
  const unique=[...new Map(segments.map(segment=>[segment.mode==='rail'?segment.mode+segment.color+segment.label:segment.mode,segment])).values()];
  return unique.length?`<div class="map-route-legend" aria-label="Route key">${unique.map(segment=>`<span class="map-route-key mode-${segment.mode}" style="--route-color:${segment.color}" title="${esc(segment.name)}"><i class="map-route-swatch" aria-hidden="true"></i>${icon(segment.mode==='walk'?'walk':segment.mode==='bus'?'bus':'train',14)}<span>${esc(segment.mode==='rail'?segment.label:segment.name)}</span></span>`).join('')}</div>`:'';
}
