import {icon} from './icons.js';
import {locationDescription} from './location-assistance.js';

export function updateNetworkStatus(host,online){
  const label=online?'Online':'Offline';
  host.dataset.online=String(online);host.setAttribute('aria-label',label);host.title=label;
  host.innerHTML=`<svg class="network-signal" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 18v3h3v-3zm5-5v8h3v-8zm5-5v13h3V8zm5-5v18h3V3z" fill="currentColor"/>${online?'':'<path class="network-signal-halo" d="m5 5 14 14M19 5 5 19"/><path class="network-signal-cross" d="m5 5 14 14M19 5 5 19"/>'}</svg><span class="location-sr-only">${label}</span>`;
}

export function mountLocationControls({button,popover,status,service,onStop}){
  const enable=popover.querySelector('#location-popover-enable'),stop=popover.querySelector('#location-popover-stop');
  const close=({focus=false}={})=>{popover.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();};
  const fit=()=>{if(!popover.hidden)popover.style.maxHeight=`${Math.max(0,innerHeight-popover.getBoundingClientRect().top-12)}px`;};
  button.onclick=()=>{popover.hidden=!popover.hidden;button.setAttribute('aria-expanded',String(!popover.hidden));fit();};
  new ResizeObserver(fit).observe(button.closest('.app-topbar'));
  window.addEventListener('resize',fit);
  document.addEventListener('pointerdown',event=>{if(!popover.hidden&&!popover.contains(event.target)&&!button.contains(event.target))close();});
  document.addEventListener('focusin',event=>{if(!popover.hidden&&!popover.contains(event.target)&&!button.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!popover.hidden){event.preventDefault();close({focus:true});}});
  enable.onclick=()=>service.start();
  stop.onclick=async()=>{try{await onStop();}catch(error){status.textContent=error?.message??'Location stopped on this device. The sharing update is pending.';}};
  let lastAnnouncement='';
  return service.subscribe(state=>{
    const label=state.usable?'Location on':state.status==='denied'?'Location denied':state.status==='unavailable'?'Location unavailable':state.status==='suspended'?'Location paused':!state.enabled?'Location off':/stale/i.test(state.reason)?'Location stale':/timed out/i.test(state.reason)?'Location timed out':state.position?'Low location accuracy':'Locating';
    button.setAttribute('aria-label',`Location services: ${label.toLowerCase()}`);button.title=label;button.dataset.usable=String(state.usable);
    button.innerHTML=`${icon('location',22)}${!state.enabled?'<span class="location-off-mark" aria-hidden="true"></span>':''}`;
    status.dataset.usable=String(state.usable);status.textContent=locationDescription(state.position,state);
    // Announce meaningful state changes; continuous fix timestamps stay in the popover.
    if(label!==lastAnnouncement){popover.parentElement.querySelector('#location-announcement').textContent=label;lastAnnouncement=label;}
    const focusedAction=document.activeElement;
    enable.hidden=state.enabled;enable.textContent=['denied','unavailable'].includes(state.status)?'Retry location':'Enable location';stop.hidden=!state.enabled;
    if(focusedAction===stop&&stop.hidden)enable.focus();
    else if(focusedAction===enable&&enable.hidden)stop.focus();
  });
}
