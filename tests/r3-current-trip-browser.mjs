// After npm run build. These checks exercise user actions in the unified UI.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {makePlan,startJourney} from '../src/journey-v2.js';
import {acceptJourney} from '../src/journey-state.js';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4233';
const plan=makePlan({origin:{id:'r3-start',label:'Test entrance'},destination:{id:'r3-end',label:'Test destination'},date:'2026-09-18',departureTime:'10:00',mode:'real',preferences:{walkingLimitMinutes:30},route:{id:'r3-current-route',steps:[{id:'one',text:'Confirm the entrance',durationSeconds:60},{id:'two',text:'Confirm the destination',durationSeconds:60}],departureSeconds:36000,arrivalSeconds:36120,walkingSeconds:120,accessibility:'unknown',provenance:'Synthetic current-trip browser test'}});
const read=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
let browser;const contexts=[],errors=[];
async function client(seed,session=null){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});contexts.push(context);
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  // Seed a deliberate full-guidance choice for direct location/cancel/finish controls, only once.
  await context.addInitScript(({active,session})=>{if(!sessionStorage.getItem('r3-seeded')){localStorage.setItem('commute-copilot-presentation-v1',JSON.stringify({schemaVersion:1,simpleGuidance:false}));localStorage.setItem('commute-copilot-journey-v2',JSON.stringify(active));if(session)localStorage.setItem('commute-copilot-pairing-v2',JSON.stringify(session));sessionStorage.setItem('r3-seeded','yes');}window.geoCalls=[];window.geoCleared=[];Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'prompt'})}});Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(success,failure){window.geoCalls.push({success,failure});return window.geoCalls.length;},clearWatch:id=>window.geoCleared.push(id)}});},{active:seed,session});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();await page.locator('.app-nav [data-view=current]').click();return {context,page};
}
try{
  assert.equal((await fetch(base+'/api/push/config')).ok,true,'build and start the assigned preview before this test');
  const build=await fetch(base+'/data/application-build.json').then(r=>r.json());
  const seed=startJourney(plan);seed.routingContext=acceptJourney({id:'r3-current-context',deadlineSeconds:null,departureSeconds:36000,arrivalSeconds:36120,legs:[{type:'access',fromStopId:'r3-start',toStopId:'r3-middle',durationSeconds:60,startSeconds:36000,endSeconds:36060,walkingSeconds:60},{type:'exit',fromStopId:'r3-middle',toStopId:'r3-end',durationSeconds:60,startSeconds:36060,endSeconds:36120,walkingSeconds:60}]},{walkingLimitMinutes:30,date:'2026-09-18',departureTime:'10:00'},build.applicationSha256);
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const {context,page}=await client(seed);
  assert.equal(await page.locator('#trip-details').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#companion-active .trip-guidance').count(),0);
  assert.equal(await page.locator('#station-tools > summary').isVisible(),true);
  await page.locator('#station-tools > summary').click();
  assert.equal(await page.locator('#companion-facilities [data-action=layout]').isVisible(),true);
  assert.equal(await page.locator('#companion-facilities [data-action=toilets]').isVisible(),true);
  await page.locator('#station-tools > summary').click();
  console.log('PASS current summary stays concise while route details and station tools remain available');
  await page.locator('.reroute-tools > summary').click();
  assert.match(await page.locator('.reroute-tools').innerText(),/Manual timing & route correction/);
  await page.locator('#r2-progress [name=kind]').selectOption('unknown');
  await page.locator('#r2-progress [name=walk]').fill('0.25');
  await page.locator('#r2-progress button').click();
  assert.equal((await read(page)).routingContext.progress.walkedSeconds,15);
  const confirmed=await read(page);await page.locator('#r2-progress [name=walk]').fill('0');await page.locator('#r2-progress button').click();
  assert.equal((await read(page)).revision,confirmed.revision);
  console.log('PASS plain-language route check converts walking minutes without bypassing progress safeguards');
  await page.waitForFunction(()=>window.geoCalls.length===1);assert.equal(await page.locator('#locate-once').isVisible(),false);
  await page.evaluate(()=>window.geoCalls[0].success({coords:{latitude:1.31,longitude:103.81,accuracy:30},timestamp:Date.now()}));
  await page.locator('#journey-cancel').click();assert.equal(await page.locator('#cancel-trip-confirmation').isVisible(),true);assert.equal((await read(page)).status,'started');
  await page.locator('#keep-current-trip').click();assert.equal((await read(page)).status,'started');assert.equal(await page.evaluate(()=>window.geoCleared.length),0);
  console.log('PASS cancellation is explicitly confirmed; keeping the trip preserves guidance and local collection');
  await context.setOffline(true);await page.locator('#journey-cancel').click();await page.locator('#confirm-journey-cancel').click();
  const cancelled=await read(page);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.id,seed.id);assert.equal(cancelled.location,null);assert.equal(cancelled.permissions.location,false);assert.equal(cancelled.permissions.progress,false);assert.equal(cancelled.permissions.geolocation,'stopped');assert.deepEqual(await page.evaluate(()=>window.geoCleared),[1]);
  await page.evaluate(()=>window.geoCalls[0].success({coords:{latitude:1.4,longitude:103.9,accuracy:20},timestamp:Date.now()}));assert.equal((await read(page)).location,null);
  assert.equal(await page.locator('#journey-finish').count(),0);assert.equal(await page.locator('#r2-progress').count(),0);assert.equal(await page.locator('#retry-fare').count(),0);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-expenditure-v2'))?.records.length??0),0);
  await context.setOffline(false);await page.reload();await page.locator('#find-routes:not([disabled])').waitFor();await page.locator('.app-nav [data-view=current]').click();assert.equal((await read(page)).status,'cancelled');assert.equal(await page.locator('#journey-cancel').count(),0);
  console.log('PASS offline cancellation survives reload, blocks queued location fixes, and creates no completed-trip spending');
  const completedClient=await client(seed),completedPage=completedClient.page;
  await completedPage.locator('#journey-finish').click();assert.equal((await read(completedPage)).status,'completed');
  await completedPage.locator('#retry-fare').click();assert.equal(await completedPage.locator('#view-spending').isVisible(),true);
  assert.equal(await completedPage.locator('#view-current').isVisible(),false);
  assert.equal(await completedPage.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-expenditure-v2')).records.length),1);
  await completedPage.locator('.app-nav [data-view=current]').click();await completedPage.locator('#retry-fare').click();assert.equal(await completedPage.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-expenditure-v2')).records.length),1);
  console.log('PASS completed-trip spending opens its own page and repeated visits cannot duplicate its record');
  for(const offlineCancellation of [true,false]){
  const created=await fetch(base+'/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan})}).then(r=>r.json());
  const accepted=await fetch(base+`/api/shares/${created.id}/accept`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${created.inviteToken}`},body:JSON.stringify({eventId:crypto.randomUUID(),expectedRevision:created.revision,consent:{progress:true,location:true}})}).then(r=>r.json());
  assert.ok(accepted.travellerToken);
  const sharedSeed=structuredClone(seed);sharedSeed.permissions={...sharedSeed.permissions,progress:true,location:true};sharedSeed.sharing={shareId:created.id,planId:plan.id};
  const paired=await client(sharedSeed,{id:created.id,role:'traveller',travellerToken:accepted.travellerToken,revision:accepted.revision,sharingEpoch:accepted.sharingEpoch,serverConsent:accepted.consent,sharingPaused:accepted.sharingPaused,accessRevoked:accepted.accessRevoked});
  const remote=(traveller=false)=>fetch(base+`/api/shares/${created.id}`,{headers:{Authorization:`Bearer ${traveller?accepted.travellerToken:created.viewerToken}`}}).then(r=>r.json());
  await paired.page.waitForFunction(()=>window.geoCalls.length===1);assert.equal(await paired.page.locator('#locate-once').isVisible(),false);
  await paired.page.evaluate(()=>window.geoCalls[0].success({coords:{latitude:1.31,longitude:103.81,accuracy:30},timestamp:Date.now()}));
  for(let i=0;i<40&&!(await remote()).location;i++)await new Promise(resolve=>setTimeout(resolve,100));assert.ok((await remote()).location);
  if(offlineCancellation)await paired.context.setOffline(true);await paired.page.locator('#journey-cancel').click();assert.match(await paired.page.locator('#cancel-trip-confirmation').innerText(),/does not remove their access/);await paired.page.locator('#confirm-journey-cancel').click();
  if(offlineCancellation){
  await paired.page.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-pairing-v2'))?.pendingPrivacyAction==='stop-location'&&document.querySelector('#companion-message').textContent.includes('pending'));
  assert.equal((await read(paired.page)).status,'cancelled');assert.equal((await read(paired.page)).location,null);assert.equal((await remote()).consent.location,true);
  await paired.context.setOffline(false);
  }
  await paired.page.waitForFunction(()=>!JSON.parse(localStorage.getItem('commute-copilot-pairing-v2'))?.pendingPrivacyAction);
  for(let i=0;i<40&&(await remote(true)).status!=='cancelled';i++)await new Promise(resolve=>setTimeout(resolve,100));
  const stopped=await remote(true);assert.equal(stopped.status,'cancelled');assert.equal(stopped.consent.location,false);assert.equal(stopped.consent.progress,false);assert.equal(stopped.location,null);assert.equal(stopped.accessRevoked,false);assert.equal((await remote()).location,null);
  console.log(offlineCancellation?'PASS offline cancellation persists pending caregiver privacy change and reconnect confirms the cancelled server state without revoking access':'PASS online cancellation clears shared location and records cancelled state after privacy changes');
  }
  assert.deepEqual(errors,[]);console.log('PASS no browser runtime errors');
}finally{for(const context of contexts)await context.close();await browser?.close();}
