// Synthetic provider responses + controlled desktop Edge geolocation. No live-provider claim.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4241',out='test-results/fr2-search';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce',permissions:['geolocation'],geolocation:{latitude:1.3,longitude:103.8,accuracy:10}});
await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
const points={origin:{id:'onemap:1.300000,103.800000',label:'Synthetic public origin',address:'Synthetic public origin address',lat:1.3,lng:103.8},destination:{id:'onemap:1.320000,103.810000',label:'Synthetic public destination',address:'Synthetic public destination address',lat:1.32,lng:103.81}};
const queries=[],requests=[],checks=[],errors=[];let held=null,holdNext=false,failNext=false;
await context.route('**/api/address/search',async route=>{
  const query=route.request().postDataJSON().query;queries.push(query);
  if(holdNext){holdNext=false;held=route;return;}
  if(failNext){failNext=false;return route.fulfill({status:503,json:{status:'unavailable',message:'Synthetic OneMap unavailable.'}});}
  return route.fulfill({json:{provider:'onemap',status:'ok',results:[query.includes('origin')?points.origin:points.destination]}});
});
await context.route('**/api/address/route',route=>{
  const body=route.request().postDataJSON();requests.push(body);
  const start=Date.parse(`${body.date}T${body.departureTime}:00+08:00`);
  const from={name:'Synthetic public start',...body.origin},to={name:'Synthetic public end',...body.destination};
  return route.fulfill({json:{provider:'onemap',status:'ok',retrievedAt:Date.now(),itineraries:[{startTime:start,endTime:start+900000,walkTime:0,legs:[{mode:'BUS',startTime:start,endTime:start+900000,duration:900,distance:3000,from,to,route:'Synthetic 23',headsign:'Synthetic terminus',geometry:null}]}]}});
});
const page=await context.newPage();page.setDefaultTimeout(18000);page.on('pageerror',e=>errors.push(e.message));
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
const station=async(role,query)=>{await page.locator('#'+role).fill(query);await page.locator(`#${role}-suggestions [data-index="0"]`).click();};
const address=async(role)=>{await page.locator('#'+role).fill(role+' public fixture');await page.locator(`#${role}-address-search`).click();await page.locator(`#${role}-suggestions [data-address-index="0"]`).click();};
const plan=async()=>{await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();};
const release=async()=>{const route=held;held=null;await route.fulfill({json:{provider:'onemap',status:'ok',results:[{...points.origin,id:'onemap:1.310000,103.820000',label:'Stale synthetic response',address:'Stale synthetic response',lat:1.31,lng:103.82}]}}).catch(()=>{});};
const waitHeld=async()=>{for(let i=0;i<50&&!held;i++)await page.waitForTimeout(20);assert.ok(held,'provider request is pending');};
try{
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  await page.waitForFunction(()=>document.querySelector('#app-location-status').dataset.usable==='true');
  check('healthy location banner is absent while approximate map position remains',!await page.locator('#app-location-status').isVisible()&&await page.locator('.device-location-dot').count()===1);
  check('separate street-address form was removed',await page.locator('.address-search-disclosure,#address-query,#address-role').count()===0);
  await page.screenshot({path:out+'/plan-mobile.png'});
  await page.locator('#origin').fill('Private appointment at home');await page.locator('#origin').press('Escape');
  check('typing and dismissing private labels never queries OneMap',queries.length===0);
  await station('origin','EW8');await station('destination','EW12');
  check('stations remain selectable at both endpoints without geocoding',/Paya Lebar/.test(await page.locator('#origin').inputValue())&&/Bugis/.test(await page.locator('#destination').inputValue())&&queries.length===0);
  await page.locator('[data-time="depart-later"]').click();await page.evaluate(()=>{const f=document.querySelector('#plan-form');f.elements.date.value='2026-09-21';f.elements.departureTime.value='10:00';f.elements.date.dispatchEvent(new Event('change',{bubbles:true}));});
  await plan();check('two station endpoints retain local multimodal planning',requests.length===0&&await page.locator('.route-card').count()>0);
  await address('destination');await plan();
  check('station to address routes to the selected address coordinates',requests.length===1&&requests[0].destination.lat===points.destination.lat&&requests[0].origin.lat!==points.origin.lat);
  await station('destination','EW12');await address('origin');await plan();
  check('address to station routes from the selected address coordinates',requests.length===2&&requests[1].origin.lat===points.origin.lat&&requests[1].destination.lat!==points.destination.lat);
  await address('destination');await plan();
  check('both address endpoints reach multimodal provider without station snapping',requests.length===3&&requests[2].origin.lat===points.origin.lat&&requests[2].destination.lat===points.destination.lat&&Object.keys(requests[2].origin).sort().join()==='lat,lng');
  await page.locator('#swap').click();await plan();
  check('swap moves confirmed coordinates with their displayed addresses',requests[3].origin.lat===points.destination.lat&&requests[3].destination.lat===points.origin.lat);
  await page.locator('#origin-clear').click();
  check('clear removes route preview, selected value and active descendant',await page.locator('#origin').inputValue()===''&&await page.locator('.route-card').count()===0&&await page.locator('#origin').getAttribute('aria-activedescendant')===null);
  await page.locator('#origin').fill('Unconfirmed public fixture');await page.locator('#origin').press('Escape');await page.locator('#find-routes').click();
  await page.waitForFunction(()=>document.querySelector('#planner-status').textContent.includes('Select a station'));
  check('unconfirmed text cannot reuse the cleared endpoint',requests.length===4);
  // Editing while a request is pending must clear its generation and result list.
  await page.waitForTimeout(1550);holdNext=true;await page.locator('#origin').fill('held edit public fixture');await page.locator('#origin-address-search').click();await waitHeld();
  await page.locator('#origin').fill('EW8');await release();await page.waitForTimeout(50);
  check('late response after editing cannot replace local station suggestions',await page.locator('#origin-suggestions [data-address-index]').count()===0&&/Paya Lebar/.test(await page.locator('#origin-suggestions').innerText()));
  await page.locator('#origin').press('ArrowDown');await page.locator('#origin').press('Enter');
  check('keyboard selection confirms the visible local station',/Paya Lebar/.test(await page.locator('#origin').inputValue())&&await page.locator('#origin').getAttribute('aria-expanded')==='false');
  await page.waitForTimeout(1550);holdNext=true;await page.locator('#origin').fill('held clear public fixture');await page.locator('#origin-address-search').click();await waitHeld();
  await page.locator('#origin-clear').click();await release();await page.waitForTimeout(50);
  check('late response after clear cannot restore a place or stale loading state',await page.locator('#origin').inputValue()===''&&!/Stale synthetic response/.test(await page.locator('#origin-suggestions').innerText())&&await page.locator('#origin').getAttribute('aria-busy')===null);
  await page.waitForTimeout(1550);holdNext=true;await page.locator('#origin').fill('held swap public fixture');await page.locator('#origin-address-search').click();await waitHeld();await page.locator('#swap').click();await release();
  check('swap cancels pending suggestions for both roles',await page.locator('#origin').getAttribute('aria-expanded')==='false'&&await page.locator('#destination').getAttribute('aria-expanded')==='false');
  // Cached same-session address stays available with an explicit cache label offline.
  await context.setOffline(true);await page.locator('#destination').fill('destination public fixture');await page.locator('#destination-address-search').click();await page.locator('#destination-suggestions [data-address-index="0"]').waitFor();
  check('cached address is explicitly labelled and selectable offline',/cached this session/.test(await page.locator('#destination-suggestions').innerText()));
  await page.locator('#destination-suggestions [data-address-index="0"]').click();await station('origin','EW8');await page.locator('#find-routes').click();
  await page.waitForFunction(()=>document.querySelector('#planner-status').textContent.includes('requires a connection'));
  check('offline address routing explains its limitation without a fabricated route',await page.locator('.route-card').count()===0);
  await context.setOffline(false);await page.waitForTimeout(1550);await page.evaluate(()=>document.querySelector('#app-message')?.classList.remove('is-visible'));await page.locator('#journey-sheet-handle').press('Home');failNext=true;await page.locator('#origin').fill('unavailable public fixture');await page.locator('#origin-address-search').click();
  await page.waitForFunction(()=>document.querySelector('#origin-search-status').textContent.includes('Synthetic OneMap unavailable'));
  check('provider failure offers local fallback and a retry in the same input',await page.locator('#origin-address-search').isVisible()&&/station or saved place/.test(await page.locator('#origin-search-status').innerText()));
  await page.screenshot({path:out+'/unavailable-mobile.png'});
  await page.locator('#origin').fill('destination public fixture');await page.locator('#origin').press('Escape');
  await page.setViewportSize({width:320,height:740});await page.addStyleTag({content:'html{font-size:200%!important}'});await page.locator('#journey-sheet-handle').press('Home');await page.locator('#origin').fill('Synthetic long public address for testing wrapping');
  check('search controls fit 320px enlarged-text layout',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:out+'/large-text-search.png'});
  const denied=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  await denied.addInitScript(()=>localStorage.setItem('commute-copilot-location-v2','denied'));await denied.route('https://tile.openstreetmap.org/**',r=>r.abort());
  const deniedPage=await denied.newPage();deniedPage.on('pageerror',e=>errors.push(e.message));await deniedPage.goto(base);await deniedPage.locator('#find-routes:not([disabled])').waitFor();
  await deniedPage.locator('#location-toggle').click();
  check('denied location retains explanation and a direct retry in the popover',/denied/.test(await deniedPage.locator('#app-location-status').innerText())&&await deniedPage.getByRole('button',{name:'Retry location',exact:true}).isVisible());await denied.close();
  await station('origin','EW12');await page.waitForTimeout(1550);
  const queryCount=queries.length,routeCount=requests.length,selectedQuery=await page.locator('#origin').inputValue();holdNext=true;
  for(let i=0;i<12&&await page.locator('#origin').getAttribute('aria-activedescendant')!=='origin-address-search';i++)await page.locator('#origin').press('ArrowDown');await page.locator('#origin').press('Enter');await waitHeld();
  check('Enter activates a highlighted search option on an already selected endpoint',queries.length===queryCount+1&&queries.at(-1)===selectedQuery&&requests.length===routeCount&&await page.locator('#origin').getAttribute('aria-busy')==='true');
  await page.locator('#destination').focus();
  check('blur cancels pending lookup and clears its status without planning',await page.locator('#origin-search-status').textContent()===''&&!await page.locator('#origin-search-status').isVisible()&&await page.locator('#origin').getAttribute('aria-busy')===null&&requests.length===routeCount);
  await release();await page.waitForTimeout(50);
  check('no application runtime exceptions',errors.length===0);
  await writeFile(out+'/results.json',JSON.stringify({checks,errors,evidence:'Synthetic OneMap fixtures; Edge desktop/mobile emulation. No physical phone, real travel or live provider validation.'},null,2));
}finally{await context.close();await browser.close();}
