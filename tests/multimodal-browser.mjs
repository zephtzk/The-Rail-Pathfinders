import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4176';
const out=process.env.CAPTURE_DIR??'docs/evidence/phase3';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'}),page=await context.newPage();
const results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(name,value)=>{assert.ok(value,name);results.push({name,status:'PASS'});console.log(`PASS ${name}`);};
let liveRequests=0;
await context.route('**/api/bus-arrivals?*',async r=>{liveRequests++;const stop=new URL(r.request().url()).searchParams.get('stop');await r.fulfill({json:{schemaVersion:1,status:'available',stopCode:stop,retrievedAt:new Date().toISOString(),providerTimestamp:null,providerHttpDate:new Date().toISOString(),nextRefreshAt:new Date(Date.now()+30000).toISOString(),predictions:[{serviceNo:'28',operator:'GAS',slot:'NextBus',stopCode:stop,originCode:'75009',destinationCode:'52009',visitNumber:1,predictedArrival:new Date(Date.now()+5*60000).toISOString(),predictionBasis:'vehicle-location-estimate',matchStatus:'matched',match:{patternId:'28:GAS:1',direction:1,sequence:1}}]}});});
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-pilot-guidance-v1')));
async function captureRoute(){await page.locator('#save-pilot').click();return (await saved()).route;}
async function search(origin,destination,mode='mixed',extra={}){
  const f=page.locator('#pilot-form');
  await f.locator('[name=originId]').fill(origin);await f.locator('[name=destinationId]').fill(destination);
  await f.locator('[name=date]').fill(extra.date??'2026-09-18');await f.locator('[name=departureTime]').fill('10:00');
  await f.locator('[name=deadlineTime]').fill(extra.deadlineTime??'');await f.locator('[name=walkingLimitMinutes]').selectOption(extra.walk??'20');
  await f.locator('[name=mode]').selectOption(mode);await f.locator('[name=fixture]').selectOption(extra.fixture??'none');
  await page.getByRole('button',{name:'Find pilot journeys'}).click();
}
function arithmetic(r){assert.equal(r.totalSeconds,r.accessSeconds+r.waitSeconds+r.rideSeconds+r.transferSeconds+r.exitSeconds);assert.equal(r.totalSeconds,r.arrivalSeconds-r.departureSeconds);for(let i=1;i<r.legs.length;i++)assert.equal(r.legs[i].startSeconds,r.legs[i-1].endSeconds);assert.ok(r.walkingSeconds<=1200);return true;}
try{
  const begin=performance.now();await page.goto(`${base}/multimodal.html`);await page.locator('.route-hero').waitFor({timeout:60000});
  const coldMs=performance.now()-begin;
  const cdp=await context.newCDPSession(page),heap=await cdp.send('Runtime.getHeapUsage');
  await cdp.detach();
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/\/data\//.test(e.name)).map(e=>({name:e.name,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize,durationMs:e.duration})));
  check('cold local combined browser result meets predeclared 3-second target',coldMs<=3000);
  check('first-result browser heap meets predeclared150MiB target',heap.usedSize<=150*1024*1024);
  check('combined compressed transfer meets predeclared3MiB target',resources.reduce((s,r)=>s+r.encodedBodySize,0)<=3*1024*1024);
  const initial=await captureRoute();check('default pilot contains both estimated bus and scheduled rail',initial.legs.some(l=>l.mode==='bus')&&initial.legs.some(l=>l.mode==='rail'));
  await page.getByRole('button',{name:'Check current arrivals'}).click();await page.waitForFunction(()=>document.querySelector('#pilot-live').textContent.includes('vehicle-location-estimate'));
  check('synthetic current arrivals preserve selected journey timing',JSON.stringify((await captureRoute()).legs)===JSON.stringify(initial.legs));
  check('live panel distinguishes provider observation absence and separate itinerary date',(await page.locator('#pilot-live').innerText()).includes('Provider observation timestamp: unavailable')&&(await page.locator('#pilot-live').innerText()).includes('never alter'));
  check('bounded live refresh remains disabled during minimum interval',await page.getByRole('button',{name:'Check current arrivals'}).isDisabled());
  await search('bus:75009','bus:75059','bus-only');const direct=await captureRoute();
  check('direct bus has independently checked12min wait+7m30s ride=10:19:30',direct.arrivalSeconds===37170&&direct.waitSeconds===720&&direct.rideSeconds===450&&direct.transfers===0&&arithmetic(direct));
  await search('bus:75009','DT14');const mixed=await captureRoute();check('bus-to-rail uses recorded pedestrian link and complete arithmetic',mixed.legs.some(l=>l.pathId)&&mixed.legs.some(l=>l.mode==='rail')&&arithmetic(mixed));
  await search('DT14','bus:75009');const reverse=await captureRoute();check('rail-to-bus uses opposite-direction stop81111',reverse.legs.some(l=>l.type==='ride'&&l.mode==='bus'&&l.fromStopId==='bus:81111')&&arithmetic(reverse));
  await search('bus:75009','bus:81119','bus-only');const transfer=await captureRoute();check('same physical stop bus transfer is feasible and counted',transfer.transfers===1&&transfer.transferSeconds===60&&arithmetic(transfer));
  await search('bus:75009','DT14','mixed',{walk:'0'});check('total walking budget enforced in browser',await page.locator('.route-hero').count()===0);
  await search('bus:75009','DT14','mixed',{deadlineTime:'10:05'});check('impossible estimated deadline is not recommended',await page.locator('.route-hero').count()===0&&(await page.locator('#pilot-status').innerText()).includes('deadline'));
  await search('bus:75009','DT14','mixed',{date:'2026-09-19'});check('unsupported weekend bus date explicitly excluded',(await page.locator('#pilot-status').innerText()).includes('Weekends'));
  await search('DT14','bus:75009','mixed',{fixture:'ewl'});const fallback=await captureRoute();check('synthetic EWL closure fallback labelled and excludes EWL',!fallback.legs.some(l=>l.routeId==='EWL')&&(await page.locator('#pilot-journey').innerText()).includes('SYNTHETIC DISRUPTION FIXTURE'));
  await search('bus:75009','bus:75059','bus-only');await captureRoute();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  check('full pilot data and manifests cached',await page.evaluate(async()=>{const files=['rail-network','rail-manifest','bus-network','bus-manifest','walking-links'];return (await Promise.all(files.map(p=>caches.match(`/data/${p}.json`)))).every(Boolean);}));
  await context.setOffline(true);await page.waitForFunction(()=>navigator.onLine===false);await page.reload();await page.locator('.route-hero').waitFor({timeout:60000});
  check('actual offline reload restores bus guidance',!await page.evaluate(()=>navigator.onLine)&&(await saved()).route.arrivalSeconds===37170);
  await search('bus:75009','bus:81119','bus-only');const offlineBus=await captureRoute();
  check('actual new offline bus-only search changes destination and retains arithmetic',!await page.evaluate(()=>navigator.onLine)&&offlineBus.destinationId==='bus:81119'&&offlineBus.transfers===1&&arithmetic(offlineBus));
  await search('bus:75009','DT14');const offline=await captureRoute();
  check('actual new offline mixed search succeeds with coherent arithmetic',!await page.evaluate(()=>navigator.onLine)&&offline.destinationId==='DT14'&&offline.id!==direct.id&&arithmetic(offline));
  check('offline arrivals never labelled current',(await page.locator('#pilot-live').innerText()).includes('Offline · no current arrivals'));
  const hero=await page.locator('.route-hero').innerText();await page.screenshot({path:`${out}/pilot-offline-mobile.png`,fullPage:true});
  await page.locator('.route-hero').screenshot({path:`${out}/pilot-offline-result.png`});
  await context.setOffline(false);await page.waitForFunction(()=>document.querySelector('#pilot-connection').textContent==='');
  check('reconnection preserves selected guidance',await page.locator('.route-hero').innerText()===hero&&(await saved()).route.id===offline.id);
  await page.reload();await page.locator('.route-hero').waitFor();check('online reload restores the new saved selection',await page.locator('.route-hero').innerText()===hero);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});check(`no horizontal page overflow at${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');check('no horizontal overflow at200percent text',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('only one explicitly requested synthetic arrival fetch',liveRequests===1);check('no browser exceptions',errors.length===0);
  const applicationBuild=JSON.parse(await readFile('dist/client/data/application-build.json','utf8'));
  const workerSha256=createHash('sha256').update(await readFile('dist/server/index.js')).digest('hex');
  await writeFile(`${out}/multimodal-browser.json`,JSON.stringify({recordedAt:new Date().toISOString(),browser:browser.version(),evidenceClass:'Desktop Edge emulation, loopback, real browser networking disabled; live feed synthetic; no physical phone test',applicationBuild,workerSha256,coldMs,heap,resources,results,errors},null,2));
}catch(error){await page.screenshot({path:`${out}/pilot-failure.png`,fullPage:true});throw error;}finally{await browser.close();}
