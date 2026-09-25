import {mountNebulaCompanion} from './nebula-companion.js';
import {deriveNebulaJourneyContext} from './nebula-journey-bridge.js';
import {officialServiceState} from './services-model.js';

export const NEBULA_SETTINGS_KEY='nebula-companion:candidate:20260925:settings';

/** One presentation adapter; accepted trip state remains owned by copilot-ui. */
export function mountNebulaIntegration({host,handoffHost,getContext,onNavigate,onDemo,getFeed=()=>null}){
  const pet=mountNebulaCompanion({host,onNavigate,storageKey:NEBULA_SETTINGS_KEY});
  let settingsHost=null,lastHandoff=null;
  const sync=()=>{
    const checkbox=settingsHost?.querySelector('#nebula-enabled');
    if(checkbox)checkbox.checked=pet.getState().enabled;
  };
  const unsubscribe=pet.subscribe(sync);
  function update(){
    const input=getContext();
    const context=deriveNebulaJourneyContext(input);
    const official=officialServiceState(getFeed(),{now:Date.now(),online:navigator.onLine});
    const notice=context.notice??(official.items?.length?{label:official.fresh?'Official service notice — review Services':'Last known service notice — recheck Services',severity:'warning',source:official.fresh?'live':'stale'}:null);
    pet.update({notice,bottomInset:Math.ceil(document.querySelector('.app-nav')?.getBoundingClientRect().height??88)+8,suppressed:false});
    const key=JSON.stringify([input.active?.id,input.active?.plan.mode,context.nextBoarding,context.handoffReason]);
    if(key===lastHandoff)return context;lastHandoff=key;
    handoffHost.replaceChildren();handoffHost.hidden=!input.active;
    if(!input.active)return context;
    const heading=document.createElement('h2');heading.textContent='Walk to your next boarding point';
    const note=document.createElement('p');note.className='field-note';
    handoffHost.append(heading);
    if(context.nextBoarding){
      const target=context.nextBoarding,link=document.createElement('a');
      link.id='nebula-maps';link.className='secondary';link.textContent=`Open walking directions to ${target.label}`;
      link.href=target.url;link.target='_blank';link.rel='noopener noreferrer';
      // Recheck on the actual gesture: expired/changed progress cannot open an old target.
      link.addEventListener('click',event=>{const latest=deriveNebulaJourneyContext(getContext());if(!latest.nextBoarding){event.preventDefault();update();return;}link.href=latest.nextBoarding.url;});
      handoffHost.append(link);
      note.textContent='Google Maps opens separately for walking. Your accepted Nebula trip stays here. Station coordinates may represent a station reference point, not a verified accessible entrance. Follow station signs and confirm boarding yourself.';
    }else note.textContent=context.handoffReason??'Accept a supported trip and confirm your progress to see a walking target.';
    handoffHost.append(note);
    if(input.active.plan.mode==='replay'){const demo=document.createElement('button');demo.type='button';demo.className='secondary';demo.id='nebula-demo-controls';demo.textContent='Open demonstration controls';demo.onclick=onDemo;handoffHost.append(demo);}
    return context;
  }
  function renderSettings(target){
    settingsHost=target;
    const section=document.createElement('section');section.className='presentation-setting';
    section.innerHTML='<h2>Nebula web companion</h2><label class="check-row"><input id="nebula-enabled" type="checkbox"> Show Nebula companion</label><p>The otter opens five tools in this app. When hidden, use the Enable Nebula button or this setting to bring it back.</p>';
    target.prepend(section);sync();section.querySelector('input').onchange=e=>pet.setEnabled(e.target.checked);
  }
  const refresh=()=>update();
  for(const event of ['copilot:state-changed','demo:incidents-changed','online','offline','focus','copilot:text-size-changed','copilot:presentation-changed'])window.addEventListener(event,refresh);
  const timer=setInterval(()=>{if(!document.hidden)update();},15000);
  return {update,renderSettings,destroy(){clearInterval(timer);unsubscribe();pet.destroy();for(const event of ['copilot:state-changed','demo:incidents-changed','online','offline','focus','copilot:text-size-changed','copilot:presentation-changed'])window.removeEventListener(event,refresh);}};
}
