import {SharingClient} from './sharing-client.js';
import {renderItineraryTimeline} from './itinerary-display.js';
import {readPresentationPreferences} from './presentation-preferences.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const href of ['/src/shared-trip-view.css','/src/itinerary-display.css']){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
// Isolate a recipient tab from this device's own journeys and owner credentials.
const memory=new Map();let storage;
try{storage=sessionStorage;storage.setItem('commute-copilot-readonly-trip-v1','true');}catch{storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};}
const sharing=new SharingClient(storage);sharing.useFragment();
try{document.documentElement.style.fontSize=readPresentationPreferences(localStorage).textSizePercent+'%';}catch{}
document.body.className='shared-trip-page';document.querySelector('.skip')?.remove();
document.getElementById('app').innerHTML='<main id="main" class="shared-trip-card"><header><img src="/icon.svg" width="56" height="56" alt="Nebula companion"><div><p>READ-ONLY</p><h1>Shared trip</h1></div></header><div id="shared-trip-content"></div><p id="shared-trip-status" role="status">Loading...</p><button type="button" id="shared-trip-refresh">Refresh trip</button></main>';
const content=document.getElementById('shared-trip-content'),status=document.getElementById('shared-trip-status'),button=document.getElementById('shared-trip-refresh');
async function refresh(){
  button.disabled=true;status.textContent='Loading...';
  try{
    const result=await sharing.read();
    if(result?.purpose!=='plan-view'||!result.readOnly||!result.sharedPlan)throw Error('This trip link is unavailable or has expired.');
    const plan=result.sharedPlan;
    content.innerHTML=`<h2>${esc(plan.origin?.label??plan.origin?.id)} → ${esc(plan.destination?.label??plan.destination?.id)}</h2><p>${esc(plan.departureDate??'')} ${esc(plan.departureTime??'')} SGT</p>${renderItineraryTimeline(plan.route??{steps:[]},{name:id=>id})}`;
    status.textContent='Current shared plan · refreshed '+new Date().toLocaleTimeString();
  }catch(error){content.replaceChildren();status.textContent=error.status===404?'This trip link is unavailable or has expired.':error.message||'Unable to load the shared trip. Try again.';}
  finally{button.disabled=false;}
}
button.addEventListener('click',refresh);refresh();
