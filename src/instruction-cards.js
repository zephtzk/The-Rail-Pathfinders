// Only explicitly marked usage instructions belong here. Service notices,
// errors, route constraints and other important states keep their own lifecycle.
export const INSTRUCTION_SESSION_KEY='commute-copilot-instruction-dismissals-v1';
const fallbackDismissals=new Set();

export function createInstructionSession({getStorage=()=>globalThis.sessionStorage,memory=new Set()}={}){
  let storage;
  try{
    storage=getStorage();
    const saved=JSON.parse(storage?.getItem(INSTRUCTION_SESSION_KEY)??'[]');
    if(Array.isArray(saved))for(const key of saved)if(typeof key==='string'&&key)memory.add(key);
  }catch{/* A blocked or damaged session store must not block the app. */}
  return {
    isDismissed:key=>memory.has(key),
    dismiss(key){
      if(typeof key!=='string'||!key)return;
      memory.add(key);
      try{storage?.setItem(INSTRUCTION_SESSION_KEY,JSON.stringify([...memory]));}catch{/* Retain this document's session in memory. */}
    },
  };
}

let currentSession;
const originalHidden=new WeakMap();
function defaultSession(){return currentSession??=createInstructionSession({memory:fallbackDismissals});}

const STATIC_INSTRUCTIONS=Object.freeze({
  'indoor-guidance':'indoor guidance information',
  'travel-information':'travel information',
  'station-connections':'station connection information',
  'facility-station-coverage':'station coverage information',
});

// Mark static cards explicitly in their templates. Observe replacement nodes so
// location updates, preference changes and navigation retain their dismissals.
export function mountInstructionCards(root,{session=defaultSession()}={}){
  function enhance(card){
    const key=card.dataset.instructionCard,label=Object.hasOwn(STATIC_INSTRUCTIONS,key)?STATIC_INSTRUCTIONS[key]:null;
    if(!label){if(originalHidden.has(card))renderInstructionCard(card,null,{session});return;}
    if(originalHidden.has(card)&&card.dataset.instructionId===key&&card.querySelector('[data-dismiss-instruction]'))return;
    renderInstructionCard(card,{key,label,focusTarget:()=>{
      const target=card.closest('.view')?.querySelector('h1')??card.closest('[role="tabpanel"]')?.querySelector('h2')??card.parentElement;
      if(target&&!target.hasAttribute('tabindex'))target.tabIndex=-1;
      return target;
    }},{session});
  }
  function scan(node){
    if(node.nodeType!==1)return;
    if(node.matches('[data-instruction-card]'))enhance(node);
    node.querySelectorAll('[data-instruction-card]').forEach(enhance);
  }
  scan(root);
  const observer=new root.ownerDocument.defaultView.MutationObserver(records=>{
    for(const record of records){
      if(record.type==='attributes')enhance(record.target);
      else {if(record.target.matches?.('[data-instruction-card]'))enhance(record.target);record.addedNodes.forEach(scan);}
    }
  });
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-instruction-card']});
  return ()=>observer.disconnect();
}

// Call after rendering a card; call with no instruction before reusing the
// element for a status/error. This synchronous hook avoids a dismissed-card flash
// and never infers dismissibility from colour, wording or a general CSS class.
export function renderInstructionCard(card,instruction=null,{session=defaultSession()}={}){
  if(originalHidden.has(card)){card.hidden=originalHidden.get(card);originalHidden.delete(card);}
  card.querySelectorAll('[data-dismiss-instruction]').forEach(button=>button.remove());
  card.classList.remove('instruction-card');
  delete card.dataset.instructionId;
  delete card.dataset.instructionDismissed;
  if(!instruction?.key)return;
  const {key,label='usage instructions',focusTarget}=instruction;
  originalHidden.set(card,card.hidden);
  card.classList.add('instruction-card');
  card.dataset.instructionId=key;
  card.dataset.instructionDismissed=String(session.isDismissed(key));
  if(session.isDismissed(key))card.hidden=true;
  const doc=card.ownerDocument;
  if(!doc.querySelector('link[data-instruction-card-style]')){
    const style=doc.createElement('link');style.rel='stylesheet';style.href='/src/instruction-cards.css';
    style.dataset.instructionCardStyle='';doc.head.append(style);
  }
  const button=doc.createElement('button');
  button.type='button';button.className='instruction-card-close';button.dataset.dismissInstruction=key;
  button.setAttribute('aria-label',`Dismiss ${label} for this session`);
  const glyph=doc.createElement('span');glyph.textContent='×';glyph.setAttribute('aria-hidden','true');button.append(glyph);
  button.addEventListener('click',()=>{
    session.dismiss(key);
    for(const other of doc.querySelectorAll('[data-instruction-id]'))if(other.dataset.instructionId===key){other.dataset.instructionDismissed='true';other.hidden=true;}
    // Avoid leaving keyboard focus in content that just disappeared.
    const target=typeof focusTarget==='function'?focusTarget():focusTarget;
    if(target&&!target.disabled&&!target.closest('[hidden]'))target.focus({preventScroll:true});
  });
  card.append(button);
}
