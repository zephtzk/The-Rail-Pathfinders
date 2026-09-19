// A bounded local layer: no per-stop network requests and no inferred paths.
export function visibleBusStops(stops,bounds,center,limit=450) {
  const candidates=stops.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon)&&s.lat>=bounds.south&&s.lat<=bounds.north&&s.lon>=bounds.west&&s.lon<=bounds.east);
  const distance=s=>(s.lat-center.lat)**2+(s.lon-center.lng)**2;
  candidates.sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id));
  return {stops:candidates.slice(0,limit),total:candidates.length};
}

export function mountBusStopMap(map,stops,{onChoose,onStatus=()=>{},leaflet=globalThis.L}={}) {
  const layer=leaflet.layerGroup().addTo(map),renderer=leaflet.canvas({padding:.2,tolerance:4});
  let enabled=true,disposed=false;
  function popup(stop) {
    const box=document.createElement('div'),title=document.createElement('strong'),road=document.createElement('p');
    title.textContent=`${stop.id} · ${stop.name}`;road.textContent=stop.roadName??'';box.append(title,road);
    for(const [role,label] of [['origin','Start here'],['destination','Go here']]) {
      const button=document.createElement('button');button.type='button';button.textContent=label;button.style.cssText='margin:3px;padding:8px';
      button.addEventListener('click',()=>{map.closePopup();onChoose?.(role,stop.id);});box.append(button);
    }
    return box;
  }
  function update() {
    if(disposed)return;layer.clearLayers();
    if(!enabled){onStatus('Bus stops hidden');return;}
    if(map.getZoom()<14){onStatus('Zoom in to see bus stops');return;}
    const b=map.getBounds(),visible=visibleBusStops(stops,{south:b.getSouth(),north:b.getNorth(),west:b.getWest(),east:b.getEast()},map.getCenter());
    for(const stop of visible.stops){
      const label=document.createElement('span');label.textContent=`${stop.id} · ${stop.name}`;
      leaflet.circleMarker([stop.lat,stop.lon],{renderer,radius:3,color:'#0054a6',weight:1,fillColor:'#fff',fillOpacity:.95})
        .bindTooltip(label,{direction:'top'}).bindPopup(()=>popup(stop)).addTo(layer);
    }
    onStatus(visible.total>visible.stops.length?`${visible.stops.length} of ${visible.total} nearby · zoom in for more`:`${visible.total} stops in this area`);
  }
  map.on('moveend zoomend',update);update();
  return {
    setVisible(visible){if(disposed)return;enabled=Boolean(visible);update();},
    remove(){disposed=true;map.off('moveend zoomend',update);map.removeLayer(layer);map.removeLayer(renderer);}
  };
}
