import {resolveCurrentExecution} from './current-execution.js';
import {icon} from './icons.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const STAFF_CUSTOM_MAX_LENGTH=500;
const customText=value=>typeof value==='string'?value.slice(0,STAFF_CUSTOM_MAX_LENGTH):'';
export const STAFF_REQUESTS=Object.freeze([
  {id:'automatic',label:'My current instruction'},
  {id:'platform',label:'Find the correct stop or platform'},
  {id:'transfer',label:'Help with a transfer'},
  {id:'exit',label:'Find the exit'},
  {id:'lift',label:'Check lift access'},
  {id:'alert',label:'Let me know at my stop'},
  {id:'custom',label:'Custom message'},
]);
export function staffCardForExecution(execution,request='automatic',customMessage=''){
  const allowed=STAFF_REQUESTS.some(r=>r.id===request)?request:'automatic',e=execution;
  let message;
  if(allowed==='custom')message=customText(customMessage).trim()||'Type your message below.';
  else if(allowed==='automatic'){
    if(['none','prepared'].includes(e.phase))message='Please help me plan my journey. I have not started an accepted trip.';
    else if(e.phase==='completed')message='I have confirmed that my journey is complete. Please help me if I need further directions.';
    else if(e.phase==='cancelled')message='I have cancelled my journey. Please help me choose what to do next.';
    else if(e.phase==='paused')message='My journey is paused. Please help me check where to continue before I resume.';
    else if(['blocked','detour-blocked'].includes(e.phase))message='My planned station path is unavailable. Please help me find a suitable route before I continue.';
    else if(e.phase==='review')message='My station directions need review after a facility change. Please help me check a suitable route.';
    else if(e.phase==='detour-reached')message='I have reached my toilet stop. Please help me return to my onward checkpoint when I am ready.';
    else message=`Please help me with my current step: ${e.current}`;
  }else message={platform:'Please help me find the correct stop or platform for my journey.',transfer:'Please help me find the way to my next connection.',exit:'Please help me find the appropriate station exit.',lift:'Please help me check which lift and step-free route I can use.',alert:e.rideDestination?`Please let me know when we reach ${e.rideDestination}, where I need to get off.`:'Please help me check where to get off, and let me know when we reach that stop.'}[allowed];
  return {request:allowed,message,context:e.accepted?`Journey destination: ${e.destination}`:e.phase==='prepared'?'Prepared trip — not started':'No active travel instruction',phase:e.phase,contextKey:e.contextKey,notice:e.indoorNotice,fixture:e.fixture===true};
}
export function createStaffSelection(){let contextKey=null,request='automatic',draft='';return {select(value){request=STAFF_REQUESTS.some(r=>r.id===value)?value:'automatic';},setCustom(value){draft=customText(value);},resolve(execution){const changed=contextKey!==null&&contextKey!==execution.contextKey;if(contextKey!==execution.contextKey){request='automatic';draft='';}contextKey=execution.contextKey;return {...staffCardForExecution(execution,request,draft),customMessage:draft,selectionReset:changed};}};}
export function staffCardHTML(card){return `<article class="staff-assistance-card" aria-label="Message to show to staff"><p class="staff-card-context">${esc(card.context)}</p>${card.fixture?'<p class="guidance-fixture">Training journey · fictional directions</p>':''}<p class="staff-card-message">${esc(card.message)}</p>${card.notice?`<p class="staff-card-evidence"><strong>${esc(card.notice.title)}</strong> · Ask staff to check the route.</p>`:''}</article>`;}
export function mountStaffCard(host,{getActive=()=>null,getPrepared=()=>null,name,onBack=()=>{},onStationGuide=()=>{}}={}){
  if(!document.querySelector('link[data-staff-custom-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/src/staff-custom.css';style.dataset.staffCustomStyle='';document.head.append(style);}
  const selection=createStaffSelection();let lastCard;
  function render(){const execution=resolveCurrentExecution(getActive(),{prepared:getPrepared(),name}),card=selection.resolve(execution);lastCard=card;
    const focused=host.contains(document.activeElement)?document.activeElement?.dataset?.staffAction:null;
    host.innerHTML=`<div class="staff-page"><p class="field-note">Opening it does not contact anyone or share your trip.</p>${staffCardHTML(card)}<p class="staff-update-note" role="status">${card.selectionReset?'Your instruction changed. The card now follows your current step.':''}</p><label class="staff-request-label" for="staff-request">Message to show</label><div class="staff-request-picker"><select id="staff-request" data-staff-action="request">${STAFF_REQUESTS.map(r=>`<option value="${r.id}" ${r.id===card.request?'selected':''}>${esc(r.label)}</option>`).join('')}</select>${card.request!=='automatic'?`<button type="button" class="staff-current-instruction-tick" data-staff-action="automatic" aria-label="Use my current instruction" title="Use my current instruction">${icon('check',20)}</button>`:''}</div><div class="staff-page-actions"><button class="primary" data-staff-action="back">Back to current guidance</button><button class="secondary" data-staff-action="station">Station guide</button></div></div>`;
    if(card.request==='custom'){
      const editor=document.createElement('div');editor.className='staff-custom-editor';
      editor.innerHTML=`<label for="staff-custom-message">Your message</label><textarea id="staff-custom-message" data-staff-action="custom" rows="4" maxlength="${STAFF_CUSTOM_MAX_LENGTH}" aria-describedby="staff-custom-help staff-custom-count" placeholder="Type what you would like staff to know">${esc(card.customMessage)}</textarea><div class="staff-custom-meta"><p id="staff-custom-help">Kept only while this page is open.</p><output id="staff-custom-count" for="staff-custom-message">${card.customMessage.length}/${STAFF_CUSTOM_MAX_LENGTH}</output></div>`;
      host.querySelector('.staff-request-picker').after(editor);
      editor.querySelector('textarea').oninput=e=>{
        selection.setCustom(e.target.value);lastCard=selection.resolve(execution);
        host.querySelector('.staff-card-message').textContent=lastCard.message;
        editor.querySelector('output').textContent=`${lastCard.customMessage.length}/${STAFF_CUSTOM_MAX_LENGTH}`;
      };
    }
    host.querySelector('[data-staff-action="request"]').onchange=e=>{const custom=e.target.value==='custom';selection.select(e.target.value);render();if(custom)host.querySelector('textarea')?.focus();};
    host.querySelector('[data-staff-action="automatic"]')?.addEventListener('click',()=>{selection.select('automatic');render();host.querySelector('select').focus();});
    host.querySelector('[data-staff-action="back"]').onclick=onBack;host.querySelector('[data-staff-action="station"]').onclick=onStationGuide;
    if(focused)host.querySelector(`[data-staff-action="${focused}"]`)?.focus({preventScroll:true});
  }
  render();return {refresh:render,getCard:()=>lastCard,destroy(){host.replaceChildren();}};
}
