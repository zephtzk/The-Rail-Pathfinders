// Real sharing HTTP with two isolated Edge contexts and one synthetic journey.
// TEST_BASE_URL is deliberately required. This test creates at most one share,
// deletes it in finally, and never writes links, capabilities, screenshots or traces.
import {chromium} from 'playwright';
import {makePlan,startJourney,JOURNEY_KEY} from '../src/journey-v2.js';

const PAIRING_KEY='commute-copilot-pairing-v2';
const checks=[],contexts=[];
let browser,creation,base,recipientPage,stage='configuration',failure=null,cleanupFailure=false,createRequests=0,acceptRequests=0,progressRequests=0,runtimeErrors=0;
const readStatuses=[];
const check=(name,value)=>{if(!value)throw Error(name);checks.push(name);console.log('PASS '+name);};
const readSession=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),PAIRING_KEY);
const readJourney=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_KEY);
// Incoming invitations can switch to Caregiver before routing data finishes;
// the enabled planner control is an initialization signal, even when its tab is hidden.
const ready=page=>page.locator('#find-routes:not([disabled])').waitFor({state:'attached'});

async function client(seed=null){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce'});
  contexts.push(context);
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await context.route('**/api/shares',route=>{
    if(route.request().method()==='POST'&&++createRequests>1)return route.abort();
    return route.continue();
  });
  await context.addInitScript(({seed,journeyKey})=>{
    // An explicit saved-off choice lets the test detect invitation-driven GPS.
    localStorage.setItem('commute-copilot-location-v2','off');
    if(seed&&!sessionStorage.getItem('fr3-sharing-seeded')){
      localStorage.setItem(journeyKey,JSON.stringify(seed));
      sessionStorage.setItem('fr3-sharing-seeded','yes');
    }
    window.__fr3GpsCalls=0;window.__fr3CopiedLink=null;
    Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'prompt'})}});
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
      watchPosition(){window.__fr3GpsCalls++;return window.__fr3GpsCalls;},
      getCurrentPosition(){window.__fr3GpsCalls++;},clearWatch(){},
    }});
    // Exercise the real Copy recipient link handler without using the OS clipboard.
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__fr3CopiedLink=value;}}});
  },{seed,journeyKey:JOURNEY_KEY});
  const page=await context.newPage();page.setDefaultTimeout(25000);
  page.on('pageerror',()=>runtimeErrors++);
  page.on('response',response=>{if(response.request().method()==='GET'&&/^\/api\/shares\/[^/]+$/.test(new URL(response.url()).pathname))readStatuses.push(response.status());});
  page.on('request',request=>{
    const path=new URL(request.url()).pathname;
    if(request.method()==='POST'&&/^\/api\/shares\/[^/]+\/accept$/.test(path))acceptRequests++;
    if(request.method()==='PATCH'&&/^\/api\/shares\/[^/]+\/progress$/.test(path))progressRequests++;
  });
  return {context,page};
}

async function cleanup(){
  if(!creation)return;
  stage='delete synthetic share';
  const url=base+'/api/shares/'+creation.id,headers={Authorization:'Bearer '+creation.editorToken};
  // UI reads use a viewer capability; cleanup deliberately uses the editor.
  for(let attempt=0;attempt<2;attempt++){
    const latest=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
    if(latest.status===404){check('synthetic shared data is absent after cleanup',true);return;}
    if(!latest.ok)throw Error('cleanup read failed');
    const state=await latest.json();
    const removed=await fetch(url,{method:'DELETE',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({eventId:crypto.randomUUID(),expectedRevision:state.revision}),signal:AbortSignal.timeout(15000)});
    if(removed.status===409&&attempt===0)continue;
    if(!removed.ok)throw Error('cleanup delete failed');
    const absent=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
    check('synthetic shared data is deleted using a fresh revision and editor capability',absent.status===404);
    return;
  }
  throw Error('cleanup revision kept changing');
}

try{
  if(!process.env.TEST_BASE_URL)throw Error('TEST_BASE_URL is required');
  const target=new URL(process.env.TEST_BASE_URL);
  if(!['http:','https:'].includes(target.protocol)||target.username||target.password||target.search||target.hash||target.pathname!=='/')throw Error('Use a plain application origin');
  base=target.origin;
  const fixture=makePlan({
    origin:{id:'fr3-share-fixture-origin',label:'Synthetic review start'},
    destination:{id:'fr3-share-fixture-destination',label:'Synthetic review destination'},
    date:'2026-09-21',departureTime:'10:00',mode:'replay',preferences:{stepFree:false,walkingLimitMinutes:30},
    route:{id:'fr3-share-fixture-route',departureSeconds:36000,arrivalSeconds:36120,walkingSeconds:120,accessibility:'fixture',provenance:'Synthetic FR3 sharing verification only; not real travel directions.',steps:[
      {id:'fr3-share-fixture-step',type:'walk',text:'Review the synthetic first step',durationSeconds:60},
      {id:'fr3-share-fixture-end',type:'walk',text:'Review the synthetic destination step',durationSeconds:60},
    ]},
  });
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  stage='creator Caregiver tab';
  const creator=await client(startJourney(fixture));
  await creator.page.goto(base);await ready(creator.page);
  await creator.page.locator('.app-nav [data-view="caregiver"]').click();
  const create=creator.page.getByRole('button',{name:'Create recipient link',exact:true});
  check('Caregiver exposes Create recipient link for the synthetic reviewed journey',await create.isVisible());
  stage='Create recipient link request';
  const responsePromise=creator.page.waitForResponse(response=>new URL(response.url()).pathname==='/api/shares'&&response.request().method()==='POST');
  await create.click();const response=await responsePromise;
  check('Create recipient link succeeds through the real sharing API',response.status()===201);
  creation=await response.json();
  await creator.page.locator('[data-copy="invite"]').waitFor();
  await creator.page.locator('[data-copy="invite"]').click();
  const recipientUrl=await creator.page.evaluate(()=>window.__fr3CopiedLink);
  const parsed=typeof recipientUrl==='string'?new URL(recipientUrl):null;
  check('Copy recipient link supplies the matching same-origin invitation privately',parsed?.origin===base&&parsed.pathname==='/'&&!parsed.search&&parsed.hash===`#invite=${creation.id}.${creation.inviteToken}`);
  check('creator remains a caregiver without activating GPS', (await readSession(creator.page)).role==='caregiver'&&await creator.page.evaluate(()=>window.__fr3GpsCalls===0));

  stage='recipient invitation review';
  const recipient=await client();recipientPage=recipient.page;await recipient.page.goto(recipientUrl);await ready(recipient.page);
  const accept=recipient.page.getByRole('button',{name:'Accept this trip · sharing stays off',exact:true});
  await accept.waitFor();
  check('recipient invitation fragment is removed from the address bar',new URL(recipient.page.url()).hash==='');
  check('isolated recipient sees the route for review before explicit acceptance',await accept.isVisible()&&await recipient.page.locator('#shared-view').getByText('Synthetic review start → Synthetic review destination',{exact:true}).isVisible()&&(await readJourney(recipient.page))===null&&(await readSession(recipient.page)).role==='recipient'&&acceptRequests===0);
  check('reviewing the invitation does not request GPS',await recipient.page.evaluate(()=>window.__fr3GpsCalls===0));

  stage='recipient explicit acceptance';await accept.click();
  await recipient.page.locator('#apply-sharing').waitFor({state:'attached'});
  await recipient.page.locator('.app-nav [data-view="caregiver"]').click();
  await recipient.page.locator('#apply-sharing').waitFor();
  const paired=await readSession(recipient.page),accepted=await readJourney(recipient.page);
  check('explicit acceptance creates the matching traveller journey',paired.role==='traveller'&&paired.id===creation.id&&typeof paired.travellerToken==='string'&&!paired.inviteToken&&accepted?.plan.id===fixture.id&&accepted.sharing?.shareId===creation.id&&accepted.status==='started');
  check('progress and geographic consent both remain off locally and on the server',paired.serverConsent?.progress===false&&paired.serverConsent?.location===false&&accepted.permissions.progress===false&&accepted.permissions.location===false&&accepted.location===null&&!await recipient.page.locator('#share-progress').isChecked()&&!await recipient.page.locator('#share-location').isChecked());
  check('acceptance does not activate GPS or upload journey progress',await recipient.page.evaluate(()=>window.__fr3GpsCalls===0)&&progressRequests===0);

  stage='recipient reload';await recipient.page.reload();await ready(recipient.page);
  await recipient.page.locator('.app-nav [data-view="caregiver"]').click();await recipient.page.locator('#apply-sharing').waitFor();
  const restored=await readSession(recipient.page),journey=await readJourney(recipient.page);
  check('accepted pairing and journey persist after reload without a second acceptance',restored.role==='traveller'&&restored.id===paired.id&&restored.travellerToken===paired.travellerToken&&journey?.id===accepted.id&&journey.plan.id===fixture.id&&await recipient.page.locator('#accept-invite').count()===0&&acceptRequests===1);
  check('reload preserves both consent choices off and does not activate GPS',restored.serverConsent?.progress===false&&restored.serverConsent?.location===false&&journey.permissions.progress===false&&journey.permissions.location===false&&journey.location===null&&!await recipient.page.locator('#share-progress').isChecked()&&!await recipient.page.locator('#share-location').isChecked()&&await recipient.page.evaluate(()=>window.__fr3GpsCalls===0)&&progressRequests===0);
  check('exactly one share was created and no browser runtime error occurred',createRequests===1&&runtimeErrors===0);
}catch{
  // Playwright exceptions can include navigation URLs. Never print raw errors.
  failure=stage;console.error('FAIL FR3 sharing-link verification at: '+stage);
  if(recipientPage){
    const diagnostic=await recipientPage.evaluate(key=>{
      const session=JSON.parse(localStorage.getItem(key)),views=['plan','current','saved','facilities','caregiver','spending','preferences','staff'];
      const button=document.querySelector('#accept-invite'),ancestors=[];
      for(let e=button;e&&e!==document.documentElement;e=e.parentElement){const css=getComputedStyle(e),box=e.getBoundingClientRect();ancestors.push({tag:e.tagName,hidden:e.hidden,inert:e.inert,ariaHidden:e.getAttribute('aria-hidden'),display:css.display,visibility:css.visibility,width:Math.round(box.width),height:Math.round(box.height)});}
      return {view:views.includes(document.body.dataset.view)?document.body.dataset.view:'unknown',recipientRole:session?.role==='recipient',travellerRole:session?.role==='traveller',fragmentPresent:!!location.hash,acceptButtonPresent:!!button,acceptLabelMatches:button?.textContent==='Accept this trip · sharing stays off',sharedReviewPresent:!!document.querySelector('#shared-view h4'),ancestors};
    },PAIRING_KEY).catch(()=>({diagnosticUnavailable:true}));
    console.error('Sanitized diagnostic '+JSON.stringify({...diagnostic,readStatuses,runtimeErrors}));
  }
}finally{
  try{await cleanup();}catch{cleanupFailure=true;console.error('FAIL synthetic sharing cleanup; manual scoped cleanup is required.');}
  for(const context of contexts)await context.close().catch(()=>{});
  await browser?.close().catch(()=>{});
}
if(failure||cleanupFailure)process.exitCode=1;
else console.log(`PASS FR3 recipient-link workflow: ${checks.length} checks, one synthetic share removed. Browser emulation and real API; no physical-device or push-delivery claim.`);
