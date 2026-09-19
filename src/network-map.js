import {validExternalGeometry} from './external-geometry.js';
import {journeyMapSegments,drawRouteSegments} from './route-map.js';
const OSM_TILES='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

// Browsers can decode a valid error image even when its HTTP status is 403.
// Check the response before giving Leaflet any image bytes, so a provider's
// access-denied raster cannot cover the route. This requires provider CORS.
function checkTileResponses(layer,fetcher){
  const requests=new WeakMap();
  layer.createTile=function(coords,done){
    const tile=document.createElement('img');tile.alt='';tile.setAttribute('role','presentation');
    const controller=new AbortController();let disposed=false,objectUrl=null;
    const timer=setTimeout(()=>controller.abort(),12000);
    const release=()=>{if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}};
    const cleanup=()=>{disposed=true;clearTimeout(timer);controller.abort();tile.onload=null;tile.onerror=null;release();};
    requests.set(tile,cleanup);
    tile.onload=()=>{clearTimeout(timer);release();if(!disposed)done(null,tile);};
    tile.onerror=()=>{clearTimeout(timer);release();if(!disposed)done(Error('Street map image is unavailable.'),tile);};
    fetcher(this.getTileUrl(coords),{signal:controller.signal,referrerPolicy:'origin',credentials:'omit'}).then(async response=>{
      if(!response.ok)throw Error('Street map request was refused.');
      const blob=await response.blob();
      if(!blob.size||blob.size>2*1024*1024||!/^image\//i.test(blob.type))throw Error('Street map response is not a usable image.');
      if(disposed)return;
      objectUrl=URL.createObjectURL(blob);tile.src=objectUrl;
    }).catch(error=>{clearTimeout(timer);release();if(!disposed)done(error,tile);});
    return tile;
  };
  layer.on('tileunload',event=>requests.get(event.tile)?.());
}

// Request only the visible map. Browser HTTP caching applies; the service worker
// deliberately excludes third-party tiles. Never prefetch an offline map here.
export function addStreetMap(map,{onStatus=()=>{},leaflet=globalThis.L,isOnline=()=>globalThis.navigator?.onLine!==false,url=OSM_TILES,attribution=OSM_ATTRIBUTION,fetcher=globalThis.fetch}={}) {
  let layer=null,disposed=false,status=null;
  const report=(next,message)=>{if(status===next)return;status=next;onStatus({status:next,available:next==='ready',message});};
  function retry(){
    if(disposed)return;
    if(layer){map.removeLayer(layer);layer=null;}
    if(!isOnline()){report('offline','Street map is offline. Your route and station guidance remain available.');return;}
    report('loading','Loading street map…');
    const candidate=leaflet.tileLayer(url,{
      attribution,maxZoom:19,referrerPolicy:'origin',
      updateWhenIdle:true,keepBuffer:1
    });
    checkTileResponses(candidate,fetcher);
    layer=candidate;
    candidate.on('tileload',()=>{if(layer===candidate)report('ready','Street map available.');});
    candidate.on('tileerror',()=>{
      if(layer!==candidate)return;
      // Remove the failed base layer so a provider's error image never obscures
      // journey geometry. Retry only after a deliberate user action.
      layer=null;map.removeLayer(candidate);
      report(isOnline()?'unavailable':'offline','Street map is unavailable. Your route and station guidance remain available.');
    });
    candidate.addTo(map);
  }
  retry();
  return {retry,remove(){disposed=true;if(layer)map.removeLayer(layer);layer=null;},get layer(){return layer;}};
}

// Coordinates come from the imported network. Straight links are explicitly schematic.
export function drawNetworkOverview(map,network) {
  const layer=L.layerGroup().addTo(map),stops=new Map(network.stops.map(s=>[s.id,s])),seen=new Set();
  for(const trip of network.trips){if(seen.has(trip.routeId))continue;seen.add(trip.routeId);const points=trip.stopTimes.map(([id])=>stops.get(id)).filter(s=>Number.isFinite(s?.lat)&&Number.isFinite(s?.lon)).map(s=>[s.lat,s.lon]);const route=network.routes.find(r=>r.id===trip.routeId),color=/^[a-f\d]{6}$/i.test(route?.color??'')?'#'+route.color:'#7e9cab';L.polyline(points,{color,weight:3,opacity:.32,dashArray:'4 6',interactive:false}).addTo(layer);}
  for(const station of network.stations){if(!Number.isFinite(station.lat)||!Number.isFinite(station.lon))continue;L.circleMarker([station.lat,station.lon],{radius:3,weight:1.5,color:'#819da6',fillColor:'#fffefa',fillOpacity:.95}).bindTooltip(`${station.name} (${station.id})`,{direction:'top'}).addTo(layer);}
  return layer;
}

// Callers own fitting/focus and replace the returned layer when the accepted
// route changes. No endpoint snapping, tile fetch, or automatic map motion.
export function drawExternalRoute(map,route,{leaflet=globalThis.L,network}={}){
  if(route?.provider!=='onemap'||!validExternalGeometry(route))return null;
  const layer=leaflet.layerGroup().addTo(map),drawn=drawRouteSegments(layer,journeyMapSegments(route,{network}),{leaflet,markers:false});
  return {layer,...drawn,attribution:'OneMap / Singapore Land Authority · approximate geographic route; indoor transitions unverified'};
}
