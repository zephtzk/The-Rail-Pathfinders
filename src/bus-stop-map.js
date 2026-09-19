// A bounded local layer: no per-stop network requests and no inferred paths.
export function visibleBusStops(stops,bounds,center,limit=450) {
  const candidates=stops.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon)&&s.lat>=bounds.south&&s.lat<=bounds.north&&s.lon>=bounds.west&&s.lon<=bounds.east);
  const distance=s=>(s.lat-center.lat)**2+(s.lon-center.lng)**2;
  candidates.sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id));
  return {stops:candidates.slice(0,limit),total:candidates.length};
}

export function mountBusStopMap(map,stops,{onChoose,leaflet=globalThis.L}={}) {
  const layer=leaflet.layerGroup().addTo(map),renderer=leaflet.canvas({padding:.2});
  let enabled=true,disposed=false;
  const control=leaflet.control({position:'topright'});
  const container=document.createElement('div');container.className='leaflet-bar bus-stop-map-control';
  container.style.cssText='background:white;padding:7px;border-radius:8px;max-width:165px;margin-right:70px;color:#17324d';
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Bus stops';toggle.setAttribute('aria-pressed','true');
  toggle.style.cssText='background:#0054a6;color:white;border:0;border-radius:5px;padding:8px 12px;font:inherit;cursor:pointer';
  const status=document.createElement('div');status.setAttribute('role','status');status.style.cssText='font-size:11px;margin-top:4px;line-height:1.3';
  container.append(toggle,status);leaflet.DomEvent.disableClickPropagation(container);leaflet.DomEvent.disableScrollPropagation(container);
  control.onAdd=()=>container;control.addTo(map);
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
    if(!enabled){status.textContent='Hidden';return;}
    if(map.getZoom()<14){status.textContent='Zoom in to see bus stops';return;}
    const b=map.getBounds(),visible=visibleBusStops(stops,{south:b.getSouth(),north:b.getNorth(),west:b.getWest(),east:b.getEast()},map.getCenter());
    for(const stop of visible.stops){
      const label=document.createElement('span');label.textContent=`${stop.id} · ${stop.name}`;
      leaflet.circleMarker([stop.lat,stop.lon],{renderer,radius:6,color:'#0054a6',weight:2,fillColor:'#fff',fillOpacity:.95})
        .bindTooltip(label,{direction:'top'}).bindPopup(()=>popup(stop)).addTo(layer);
    }
    status.textContent=visible.total>visible.stops.length?`${visible.stops.length} of ${visible.total} nearby · zoom in for more`:`${visible.total} stops in this area`;
  }
  toggle.addEventListener('click',()=>{enabled=!enabled;toggle.setAttribute('aria-pressed',String(enabled));update();});
  map.on('moveend zoomend',update);update();
  return {remove(){disposed=true;map.off('moveend zoomend',update);map.removeLayer(layer);map.removeControl(control);}};
}
