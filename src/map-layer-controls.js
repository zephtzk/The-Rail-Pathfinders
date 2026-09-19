import {icon} from './icons.js';

export function mountMapLayerControls(map,{onBusToggle,onTrainToggle,leaflet=globalThis.L}={}) {
  const control=leaflet.control({position:'bottomleft'});
  const container=document.createElement('div');
  container.className='map-layer-control';
  container.setAttribute('role','group');
  container.setAttribute('aria-label','Map layers');
  const status=document.createElement('span');
  status.className='map-layer-status';
  status.setAttribute('role','status');
  status.id='bus-map-layer-status';
  function addToggle(name,label,onToggle) {
    const button=document.createElement('button');
    button.type='button';button.className='map-layer-toggle';
    button.innerHTML=icon(name,23);
    button.setAttribute('aria-label',label);
    button.setAttribute('aria-pressed','true');
    button.title=`Hide ${label.toLowerCase()}`;
    button.addEventListener('click',()=>{
      const visible=button.getAttribute('aria-pressed')!=='true';
      onToggle?.(visible);
      button.setAttribute('aria-pressed',String(visible));
      button.title=`${visible?'Hide':'Show'} ${label.toLowerCase()}`;
    });
    container.append(button);
    return button;
  }
  const bus=addToggle('bus','Bus stops',onBusToggle);
  bus.setAttribute('aria-describedby',status.id);
  addToggle('train','Train network',onTrainToggle);
  container.append(status);
  const caption=document.createElement('small');caption.className='map-view-caption';caption.textContent='Map View';container.append(caption);
  leaflet.DomEvent.disableClickPropagation(container);
  leaflet.DomEvent.disableScrollPropagation(container);
  control.onAdd=()=>container;control.addTo(map);
  return {
    setBusStatus(message){if(status.textContent!==message)status.textContent=message;},
    remove(){map.removeControl(control);}
  };
}
