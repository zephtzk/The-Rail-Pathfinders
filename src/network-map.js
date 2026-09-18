// Coordinates come from the imported network. Straight links are explicitly schematic.
export function drawNetworkOverview(map,network) {
  const layer=L.layerGroup().addTo(map),stops=new Map(network.stops.map(s=>[s.id,s])),seen=new Set();
  for(const trip of network.trips){if(seen.has(trip.routeId))continue;seen.add(trip.routeId);const points=trip.stopTimes.map(([id])=>stops.get(id)).filter(s=>Number.isFinite(s?.lat)&&Number.isFinite(s?.lon)).map(s=>[s.lat,s.lon]);const route=network.routes.find(r=>r.id===trip.routeId),color=/^[a-f\d]{6}$/i.test(route?.color??'')?'#'+route.color:'#7e9cab';L.polyline(points,{color,weight:3,opacity:.32,dashArray:'4 6',interactive:false}).addTo(layer);}
  for(const station of network.stations){if(!Number.isFinite(station.lat)||!Number.isFinite(station.lon))continue;L.circleMarker([station.lat,station.lon],{radius:3,weight:1.5,color:'#819da6',fillColor:'#fffefa',fillOpacity:.95}).bindTooltip(`${station.name} (${station.id})`,{direction:'top'}).addTo(layer);}
  return layer;
}
