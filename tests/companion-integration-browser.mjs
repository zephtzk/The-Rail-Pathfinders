// Built candidate only. Every browser context and all sharing records are synthetic.
// Maps navigation is intercepted: this suite does not establish a native app launch.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createMultimodalRouter} from '../src/multimodal-engine.js';
import {JOURNEY_KEY,startJourney} from '../src/journey-v2.js';
import {LEDGER_KEY,DEMO_LEDGER_KEY} from '../src/fare-ledger.js';

const target=new URL(process.env.TEST_BASE_URL??'http://127.0.0.1:4187');
if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.hash||target.search)throw Error('Use an isolated local candidate origin. This suite creates synthetic shares.');
const base=target.origin,out=process.env.CAPTURE_DIR??'test-results/companion-integration';
const fixedTime=new Date('2026-09-25T02:00:00.000Z');
const actions=[['disruptions','Disruptions','facilities'],['facilities','Facilities','facilities'],['caregiver','Caregiver','caregiver'],['spending','Spending','spending'],['staff','Show to staff','staff']];
const checks=[],failures=[],measurements=[],providerStates=[],contexts=[];
let stage='launch',scenarioName='launch',runtimeErrors=0,creation=null,cleanupFailed=false;
const mark=name=>{stage=`${scenarioName} > ${name}`;};
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log('PASS '+name);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const action=(page,id)=>page.locator(`#nebula-host [data-nebula-action="${id}"]`);
const nav=(page,id)=>page.locator(`.app-nav [data-view="${id}"]`).click();
const active=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_KEY);
const ready=page=>page.locator('#find-routes:not([disabled])').waitFor({state:'attached'});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
await mkdir(out,{recursive:true});

async function client({width=390,seed=null,serviceWorkers='block'}={}){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers,timezoneId:'Asia/Singapore',reducedMotion:'reduce'});
  contexts.push(context);
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await context.addInitScript(({seed,key})=>{
    if(!sessionStorage.getItem('nebula-integration-seeded')){
      localStorage.setItem('commute-copilot-location-v2','off');
      localStorage.setItem('nebula-integration-unrelated','preserved');
      if(seed)localStorage.setItem(key,JSON.stringify(seed));
      sessionStorage.setItem('nebula-integration-seeded','true');
    }
    window.__nebulaGpsCalls=0;window.__nebulaCopied=null;
    Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'prompt'})}});
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(){window.__nebulaGpsCalls++;return 1;},getCurrentPosition(){window.__nebulaGpsCalls++;},clearWatch(){}}});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__nebulaCopied=value;}}});
  },{seed,key:JOURNEY_KEY});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',()=>runtimeErrors++);
  // Fixed Date keeps the packaged 25 September demonstration reproducible;
  // timers still run normally, so this is not evidence of real-time travel.
  await page.clock.setFixedTime(fixedTime);
  return {context,page};
}
async function open(page){
  if(await action(page,'toggle').getAttribute('aria-expanded')!=='true')await action(page,'toggle').click();
  await action(page,'disruptions').waitFor({state:'visible'});
}
async function destination(page,id){await open(page);await action(page,id).click();}
async function capture(page,name){await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'});}
async function scenario(name,run){scenarioName=name;stage=name;try{await run();}catch(error){const message=error instanceof assert.AssertionError?error.message:`${error.name==='TimeoutError'?'Timed out':'Browser action failed'} at the named step.`;failures.push({scenario:name,stage,message});console.error(`FAIL ${stage}: ${message}`);}}
async function fit(page,label){
  await open(page);
  const result=await page.locator('#nebula-host').evaluate(host=>{
    const visible=[...host.querySelectorAll('button')].filter(el=>el.checkVisibility());
    return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,buttons:visible.map(el=>{
      const r=el.getBoundingClientRect();return {action:el.dataset.nebulaAction,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,hit:el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),overflow:el.scrollWidth>el.clientWidth+2};
    }),animations:host.getAnimations({subtree:true}).filter(a=>a.playState==='running').length};
  });
  measurements.push({label,...result});
  check(`${label}: page does not overflow horizontally`,result.documentWidth<=result.width+1);
  check(`${label}: five separate labelled icon buttons fit horizontally`,result.buttons.filter(b=>actions.some(([id])=>id===b.action)).length===5&&result.buttons.every(b=>b.left>=-1&&b.right<=result.width+1&&b.width>=44&&b.height>=44&&!b.overflow));
  // Large text can require the companion's own shelf to scroll. Verify every
  // action after bringing it into view instead of requiring simultaneous fit.
  for(const [id] of actions){
    await action(page,id).scrollIntoViewIfNeeded();
    check(`${label}: ${id} remains reachable through shelf scrolling`,await action(page,id).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1&&el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}));
  }
  check(`${label}: reduced motion has no running companion animation`,result.animations===0);
  await capture(page,label.replaceAll(/[^a-z0-9]+/gi,'-').toLowerCase());
}
async function reveal(page,selector){
  const id=await page.locator(selector).evaluate(el=>el.closest('.view')?.id?.replace('view-','')??null);
  if(id&&await page.locator(`.app-nav [data-view="${id}"]`).count())await nav(page,id);
  else if(id==='demo'&&!await page.locator(selector).isVisible()){
    await nav(page,'facilities');await page.locator('#nebula-demo-open').click();
  }
  await page.locator(selector).scrollIntoViewIfNeeded();
}
async function shareRequest(path,token,method='GET',body){
  return fetch(`${base}/api/shares/${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
}
async function deleteSyntheticShare(){
  if(!creation)return;
  for(let attempt=0;attempt<2;attempt++){
    const response=await shareRequest(creation.id,creation.editorToken);if(response.status===404){creation=null;return;}
    if(!response.ok)throw Error('Unable to read synthetic share for cleanup');
    const latest=await response.json();
    const deleted=await shareRequest(creation.id,creation.editorToken,'DELETE',{eventId:crypto.randomUUID(),expectedRevision:latest.revision});
    if(deleted.status===409)continue;if(!deleted.ok)throw Error('Unable to delete synthetic share');
    creation=null;return;
  }
  throw Error('Synthetic share cleanup conflict');
}

try{
  await scenario('destinations, settings, keyboard and responsive text',async()=>{
    for(const width of [390,320]){
      const {context,page}=await client({width});await page.goto(base);await ready(page);
      check(`${width}px: clean context has no accepted trip`,await active(page)===null);
      check(`${width}px: original eight navigation buttons and one journey controller remain`,await page.locator('.app-nav button').count()===8&&await page.locator('#companion').count()===1);
      await open(page);
      check(`${width}px: exactly five separately labelled icons`,await page.locator('#nebula-host .nebula-companion__action').count()===5&&await page.locator('#nebula-host .nebula-companion__action svg').count()===5);
      for(const [id,label,view] of actions){
        await destination(page,id);
        check(`${width}px: ${label} opens the existing ${view} view`,await page.locator(`#view-${view}`).isVisible()&&await action(page,'toggle').getAttribute('aria-expanded')==='false');
        if(id==='disruptions')check(`${width}px: Disruptions focuses service notices`,await page.locator('#services-notices-heading').evaluate(el=>document.activeElement===el));
        if(id==='facilities')check(`${width}px: Facilities focuses the actual nearby facility controls`,await page.locator('#nearby-facilities-host').evaluate(el=>document.activeElement===el));
      }
      await nav(page,'preferences');await page.locator('#nebula-enabled').uncheck();
      check(`${width}px: Settings off exposes discoverable re-enable`,await action(page,'enable').isVisible()&&!await action(page,'toggle').isVisible());
      check(`${width}px: candidate preference is namespaced and unrelated storage survives`,await page.evaluate(()=>JSON.parse(localStorage.getItem('nebula-companion:candidate:20260925:settings'))?.enabled===false&&localStorage.getItem('nebula-integration-unrelated')==='preserved'));
      await page.reload();await ready(page);await nav(page,'preferences');
      check(`${width}px: disabled state persists and Settings agrees`,!await page.locator('#nebula-enabled').isChecked()&&await action(page,'enable').isVisible());
      await action(page,'enable').click();
      check(`${width}px: re-enable synchronizes Settings`,await page.locator('#nebula-enabled').isChecked());
      await open(page);await action(page,'disable').click();
      check(`${width}px: companion off synchronizes Settings`,!await page.locator('#nebula-enabled').isChecked());
      await page.locator('#nebula-enabled').check();await action(page,'toggle').focus();await page.keyboard.press('Enter');
      check(`${width}px: keyboard opens companion`,await action(page,'toggle').getAttribute('aria-expanded')==='true');
      for(let index=0;index<actions.length;index++){
        const [id]=actions[index];check(`${width}px: native Tab order reaches ${id}`,await action(page,id).evaluate(el=>document.activeElement===el));
        if(index<actions.length-1)await page.keyboard.press('Tab');
      }
      await page.keyboard.press('Escape');
      check(`${width}px: Escape collapses and returns trigger focus`,await action(page,'toggle').getAttribute('aria-expanded')==='false'&&await action(page,'toggle').evaluate(el=>document.activeElement===el));
      for(const percent of [80,200]){
        const slider=page.locator('#text-size-slider');await slider.focus();await slider.press(percent===200?'End':'Home');
        check(`${width}px: native text control reaches ${percent}%`,await slider.inputValue()===String(percent));
        await nav(page,'current');await fit(page,`${width}px ${percent} percent`);
        await destination(page,'spending');check(`${width}px ${percent}%: actions still navigate`,await page.locator('#view-spending').isVisible());
        await nav(page,'preferences');
      }
      await context.close();
    }
  });

  await scenario('demo acceptance, Maps, private sharing and spending separation',async()=>{
    mark('prepare first rehearsal');let {context,page}=await client();await page.goto(base);await ready(page);
    await reveal(page,'#nebula-demo-prepare');await page.locator('#nebula-demo-prepare').click();await page.locator('#start-companion').waitFor();
    check('Preparing the clearly labelled demonstration does not accept a trip',await active(page)===null&&/Demo|replay|rehearsal/i.test(await page.locator('#companion-preview').innerText()));
    await page.locator('#start-companion').click();await page.locator('#view-current').waitFor({state:'visible'});
    const original=await active(page);
    check('Explicit Start accepts the 25 September rehearsal and keeps sharing off',original?.plan.mode==='replay'&&original.plan.departureDate==='2026-09-25'&&original.plan.departureTime==='10:00'&&!original.permissions.progress&&!original.permissions.location);
    mark('first cancellation and Keep offer');await reveal(page,'#r2-demo-cancel');await page.locator('#r2-demo-cancel').click();await nav(page,'current');await page.locator('#r2-decline').waitFor();
    check('A disruption offer preserves the accepted route',same((await active(page)).route,original.route));
    await page.locator('#r2-decline').click();
    check('Keep current route preserves journey identity and accepted route',(await active(page)).id===original.id&&same((await active(page)).route,original.route));
    mark('repeat cancellation respects switching cooldown');await reveal(page,'#r2-demo-cancel');await page.locator('#r2-demo-cancel').click();await nav(page,'current');
    check('Repeated event respects the switching cooldown with no second offer',await page.locator('#r2-accept,#r2-decline').count()===0&&/cooldown|already accepted or declined/i.test(await page.locator('#r2-comparison').innerText()));
    check('Suppressed repeat keeps the same accepted journey and route',(await active(page)).id===original.id&&same((await active(page)).route,original.route));
    await context.close();
    // Acceptance gets an independent user-created rehearsal, never a mutation
    // that clears decision history or bypasses the production cooldown policy.
    mark('prepare independent acceptance rehearsal');({context,page}=await client());await page.goto(base);await ready(page);
    await reveal(page,'#nebula-demo-prepare');await page.locator('#nebula-demo-prepare').click();await page.locator('#start-companion').waitFor();await page.locator('#start-companion').click();await page.locator('#view-current').waitFor({state:'visible'});
    const freshOriginal=await active(page);
    check('Acceptance rehearsal is independent of the declined journey',freshOriginal.id!==original.id&&freshOriginal.routingContext.decisions.length===0);
    mark('fresh cancellation and Accept offer');await reveal(page,'#r2-demo-cancel');await page.locator('#r2-demo-cancel').click();await destination(page,'disruptions');
    check('Disruptions opens and focuses the pending accepted-trip comparison',await page.locator('#view-current').isVisible()&&await page.locator('#r2-comparison').evaluate(el=>document.activeElement===el));
    await page.locator('#r2-accept').waitFor();
    check('Fresh offer waits for explicit acceptance',same((await active(page)).route,freshOriginal.route));
    await page.locator('#r2-accept').click();const accepted=await active(page);
    check('Accept updates the same journey with an accepted route revision',accepted.id===freshOriginal.id&&!same(accepted.route,freshOriginal.route)&&accepted.routeRevisions.length===freshOriginal.routeRevisions.length+1&&same(accepted.plan.destination,freshOriginal.plan.destination)&&same(accepted.route,accepted.plan.route));
    mark('accepted Maps coordinate resolution');
    const [rail,bus,walking]=await Promise.all(['rail-network','bus-network','walking-links'].map(name=>readFile(new URL(`../public/data/${name}.json`,import.meta.url),'utf8').then(JSON.parse)));
    const network=createMultimodalRouter(rail,bus,walking).network;
    const step=accepted.route.steps.slice(accepted.progress.stepIndex).find(s=>s.type==='ride');
    const stop=network.stops.find(s=>s.id===(step?.fromStopId??step?.source?.fromStopId));
    const point=step?.source?.mode==='bus'?stop:network.stations.find(s=>s.id===stop?.stationId);
    await page.locator('#nebula-maps[href]').waitFor();
    const href=await page.locator('#nebula-maps').getAttribute('href'),maps=new URL(href);
    check('Maps URL uses independently resolved accepted next boarding coordinates',!!point&&maps.origin==='https://www.google.com'&&maps.pathname==='/maps/dir/'&&maps.searchParams.get('api')==='1'&&maps.searchParams.get('travelmode')==='walking'&&maps.searchParams.get('destination')===`${point.lat},${point.lon}`&&!maps.searchParams.has('waypoints'));
    check('Maps link opens a separate context with safe opener attributes',await page.locator('#nebula-maps').getAttribute('target')==='_blank'&&/noopener/.test(await page.locator('#nebula-maps').getAttribute('rel')));
    await context.route('https://www.google.com/maps/dir/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Intercepted Maps test</title><p>URL handoff test only</p>'}));
    mark('Maps popup click and return');const popupPromise=page.waitForEvent('popup');await page.locator('#nebula-maps').click();const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');
    check('Click hands the reviewed walking URL to a new browser tab',popup.url()===href);await popup.close();await page.bringToFront();
    const returned=await active(page);check('Returning preserves accepted identity, route and manual progress',returned.id===accepted.id&&same(returned.route,accepted.route)&&same(returned.progress,accepted.progress));
    mark('Maps return reload');await page.reload();await ready(page);await nav(page,'current');
    check('Reload after Maps retains accepted trip',(await active(page)).id===accepted.id&&same((await active(page)).route,accepted.route));
    await capture(page,'accepted-current-trip');

    mark('create local read-only share');await destination(page,'caregiver');const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/shares'&&r.request().method()==='POST');await page.locator('#prepare-link').click();const response=await created;
    check('Candidate local sharing service creates a real read-only share',response.status()===201);creation=await response.json();
    check('Share has a viewer capability without an invitation capability',creation.purpose==='plan-view'&&!!creation.viewerToken&&!creation.inviteToken);
    mark('private link fields');await page.locator('#plan-recipient-link').waitFor();const link=await page.locator('#plan-recipient-link').inputValue();const parsed=new URL(link);
    check('Private recipient capability stays in the candidate-origin fragment',parsed.origin===base&&parsed.pathname==='/'&&parsed.search===''&&parsed.hash===`#view-trip=${creation.id}.${creation.viewerToken}`);
    const ownPlan=structuredClone(accepted.plan);ownPlan.id='recipient-private-plan';ownPlan.destination.label='Synthetic private destination';const ownJourney=startJourney(ownPlan,fixedTime.getTime()),ownRaw=JSON.stringify(ownJourney);
    const recipient=await client({seed:ownJourney});let recipientWrites=0;
    recipient.page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/shares')&&r.method()!=='GET')recipientWrites++;});
    mark('isolated recipient view');await recipient.page.goto(link);await recipient.page.locator('#shared-trip-content h2').waitFor();
    check('Recipient strips the fragment and displays shared endpoints',new URL(recipient.page.url()).hash===''&&(await recipient.page.locator('#shared-trip-content').innerText()).includes(accepted.plan.destination.label));
    check('Recipient stays read-only with no companion, location or owner journey changes',await recipient.page.locator('button').count()===1&&await recipient.page.locator('#shared-trip-refresh').count()===1&&await recipient.page.locator('#nebula-host,.app-nav').count()===0&&await recipient.page.evaluate(key=>localStorage.getItem(key),JOURNEY_KEY)===ownRaw&&await recipient.page.evaluate(()=>window.__nebulaGpsCalls)===0);
    mark('recipient reload');await recipient.page.reload();await recipient.page.locator('#shared-trip-content h2').waitFor();check('Recipient reload keeps its private session and sends no writes',await recipient.page.locator('.app-nav').count()===0&&recipientWrites===0);
    mark('synthetic share revocation');await deleteSyntheticShare();await recipient.page.locator('#shared-trip-refresh').click();await recipient.page.waitForFunction(()=>/unavailable|expired/i.test(document.querySelector('#shared-trip-status').textContent));
    check('Revocation makes the recipient link unavailable',await recipient.page.locator('#shared-trip-content h2').count()===0);await recipient.context.close();

    mark('replay completion and spending');await nav(page,'current');await page.locator('#journey-finish').click();
    const ledgers=await page.evaluate(({real,demo})=>({real:JSON.parse(localStorage.getItem(real)??'{"records":[]}'),demo:JSON.parse(localStorage.getItem(demo)??'{"records":[]}')}),{real:LEDGER_KEY,demo:DEMO_LEDGER_KEY});
    check('Explicit demonstration completion only enters the replay ledger',(await active(page)).status==='completed'&&ledgers.real.records.length===0&&ledgers.demo.records.some(r=>r.journeyId===accepted.id&&r.demo));
    await destination(page,'spending');check('Personal spending remains separate by default',!await page.locator('#show-demo-spend').isChecked()&&await page.locator('#spending-companion .spending-record').count()===0);
    await page.locator('#show-demo-spend').check();check('Replay spending is explicitly labelled',/Replay records: excluded from every personal total/.test(await page.locator('#spending-companion').innerText())&&await page.locator('#spending-companion .spending-record').count()===1);
    await context.close();
  });

  await scenario('unavailable providers remain honest',async()=>{
    const {context,page}=await client();
    await context.route('**/api/notices',route=>route.fulfill({json:{schemaVersion:1,status:'unavailable',checkedAt:fixedTime.toISOString(),notices:{status:'unavailable',error:'not_configured',items:[],segments:[]}}}));
    await page.goto(base);await ready(page);await destination(page,'disruptions');await page.locator('#services-refresh:not([disabled])').waitFor();
    check('Unavailable official feed is unknown rather than normal service',/not connected.*unknown/i.test(await page.locator('#services-feed-status').innerText()));
    check('Unavailable provider fixture does not claim a live notice',await page.locator('#nebula-host .nebula-companion__notice[data-source="live"]:visible').count()===0);
    for(const [provider,path] of [['OneMap','/api/address/status'],['LTA notices','/api/notices'],['LTA facilities','/api/facilities']]){
      // Direct HTTP bypasses the browser's unavailable-notice fixture. Record
      // only capability states, never credentials or provider payload data.
      const response=await fetch(base+path,{signal:AbortSignal.timeout(15000)}),value=await response.json();
      providerStates.push({provider,httpStatus:response.status,status:value.status??value.notices?.status??'unavailable',noticeStatus:value.notices?.status??null,configured:value.status==='configured'});
      check(`${provider}: real candidate API returns an explicit capability state`,typeof (value.status??value.notices?.status)==='string');
    }
    await context.close();
  });

  await scenario('isolated service worker cache and new browser storage',async()=>{
    const {context,page}=await client({serviceWorkers:'allow'});await page.goto(base);await ready(page);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const state=await page.evaluate(async key=>({journey:localStorage.getItem(key),scopes:(await navigator.serviceWorker.getRegistrations()).map(r=>r.scope),caches:await caches.keys()}),JOURNEY_KEY);
    check('Fresh browser profile inherits no accepted journey',state.journey===null);
    check('Service worker scope belongs only to candidate origin',state.scopes.length===1&&state.scopes[0]===base+'/');
    check('Candidate service worker has a build-specific cache',state.caches.some(key=>key.startsWith('commute-copilot-')&&key!=='commute-copilot-v1'));
    await context.setOffline(true);await page.reload();await ready(page);check('Candidate shell loads offline from its own cache',await action(page,'toggle').isVisible());
    await context.close();
  });
  check('No browser runtime exceptions',runtimeErrors===0);
}finally{
  try{await deleteSyntheticShare();}catch{cleanupFailed=true;console.error('FAIL synthetic share cleanup');}
  for(const context of contexts)await context.close().catch(()=>{});
  await browser.close();
  await writeFile(`${out}/results.json`,JSON.stringify({base,fixtureDate:'2026-09-25',checks,failures,runtimeErrors,cleanupFailed,measurements,providerStates,evidence:'Local built candidate in fresh desktop Edge contexts; mobile viewport and reduced-motion emulation; Maps intercepted; no physical-device or native-app launch claim. Provider configured status alone does not establish successful live access.'},null,2));
}
console.log(JSON.stringify({checks:checks.length,failures:failures.length,runtimeErrors,cleanupFailed}));
if(failures.length||runtimeErrors||cleanupFailed)process.exitCode=1;
