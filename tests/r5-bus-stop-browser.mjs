import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {choosePlannerDate,choosePlannerTime} from './planner-browser-helpers.mjs';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4196';
const out='test-results/r5-bus-stop';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce'});
await context.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:403,body:'Controlled map fallback'}));
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const check=(label,pass)=>{assert.ok(pass,label);checks.push(label);console.log('PASS '+label);};
const host=role=>page.locator(`#${role}-stop-details`);
const disclosure=role=>host(role).locator('details');
const fieldIcon=role=>page.locator(`#${role}`).locator('xpath=ancestor::div[contains(@class,"endpoint-field")]').locator('.field-icon svg');
const nav=async view=>page.locator(`.app-nav [data-view=${view}]`).click();
const acceptedTrip=()=>page.evaluate(()=>localStorage.getItem('commute-copilot-journey-v2'));
async function capture(name){await page.locator('#app-message').waitFor({state:'hidden'});await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'});}
async function select(role,code){await page.locator(`#${role}`).fill(code);await page.locator(`#${role}`).press('ArrowDown');await page.locator(`#${role}`).press('Enter');}
async function later(){await page.locator('[data-time=depart-later]').click();await choosePlannerDate(page,'date','2026-09-21');await choosePlannerTime(page,'departureTime','10:00');}
async function search(){await page.locator('#find-routes').click();await page.locator('#find-routes:not([disabled])').waitFor();await page.locator('#review-route').waitFor();}
let build,largeTextReachability;
try{
  const bus=await (await context.request.get(`${base}/data/bus-network.json`)).json();
  build=await (await context.request.get(`${base}/data/application-build.json`)).json();
  const codeOf=id=>String(id).replace(/^bus:/,'');
  const patterns=code=>bus.patterns.filter(pattern=>pattern.stops.some(stop=>codeOf(stop.stopId)===code));
  const numbers=code=>[...new Set(patterns(code).map(pattern=>String(pattern.serviceNo)))].sort(new Intl.Collator('en',{numeric:true,sensitivity:'base'}).compare).join(', ');
  const stopName=code=>bus.stops.find(stop=>codeOf(stop.id)===code)?.name;
  await page.clock.setFixedTime(new Date('2026-09-21T01:55:00Z'));
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  // The large-text geometry check deliberately includes the full-guidance current-trip peek.
  await nav('preferences');await page.locator('#simple-guidance-toggle').uncheck();await nav('plan');
  check('unselected endpoints do not display bus stop details',await host('origin').isHidden()&&await host('destination').isHidden());
  await page.locator('#origin').fill('EW2');
  const trainGraphic=await page.locator('#origin-option-0 svg').innerHTML();
  check('rail suggestions retain the train icon',await page.locator('#origin-option-0 .icon-trip').count()===1);
  await page.locator('#origin').press('ArrowDown');await page.locator('#origin').press('Enter');
  await select('destination','EW12');await later();await search();
  await page.locator('#review-route').click();
  const accepted=await acceptedTrip();assert.ok(accepted,'fixture journey was accepted');await nav('plan');

  await page.locator('#origin').fill('59009');
  check('bus suggestions use a distinct bus drawing',await page.locator('#origin-option-0 .icon-bus').count()===1&&await page.locator('#origin-option-0 svg').innerHTML()!==trainGraphic);
  check('bus suggestion subtitle contains only unique naturally sorted bus numbers',await page.locator('#origin-option-0 small').innerText()===numbers('59009'));
  await page.locator('#origin').press('ArrowDown');await page.locator('#origin').press('Enter');
  check('keyboard selection shows compact numbers and collapsed details with a bus field icon',await host('origin').isVisible()&&await host('origin').locator('.bus-service-numbers').innerText()===numbers('59009')&&!await disclosure('origin').evaluate(element=>element.open)&&await fieldIcon('origin').getAttribute('class')==='icon icon-bus');
  await disclosure('origin').locator('summary').press('Enter');
  const expanded=await disclosure('origin').innerText();
  const namedPattern=patterns('59009').find(pattern=>!pattern.loop&&pattern.originCode!==pattern.destinationCode&&stopName(pattern.originCode)&&stopName(pattern.destinationCode));
  assert.ok(namedPattern,'source fixture has a named non-loop direction');
  check('keyboard expansion exposes stop identity, every listed direction and operator',await disclosure('origin').evaluate(element=>element.open)&&expanded.includes('59009 · '+stopName('59009'))&&await disclosure('origin').locator('li').count()===patterns('59009').length&&expanded.includes(`${stopName(namedPattern.originCode)} → ${stopName(namedPattern.destinationCode)}`)&&/Direction [12]/.test(expanded)&&/SBS Transit|SMRT|Tower Transit|Go-Ahead Singapore/.test(expanded));
  const unsupported=patterns('59009').find(pattern=>pattern.timingSupported===false);assert.ok(unsupported,'source fixture has a listed service without supported timing');
  check('unsupported timing stays listed with its planner limitation',await disclosure('origin').locator('li').filter({hasText:`Bus ${unsupported.serviceNo} ·`}).filter({hasText:'Not available in this route planner.'}).count()>0);
  await choosePlannerTime(page,'departureTime','10:15');
  check('departure changes retain open details for the same selected stop',await disclosure('origin').evaluate(element=>element.open)&&await host('origin').locator('.bus-service-numbers').innerText()===numbers('59009'));
  await disclosure('origin').locator('summary').tap();
  const numbersUncovered=await host('origin').locator('.bus-service-numbers').evaluate(element=>{
    const swap=document.querySelector('#swap').getBoundingClientRect(),range=document.createRange();range.selectNodeContents(element);
    return [...range.getClientRects()].every(rect=>rect.right<=swap.left||rect.left>=swap.right||rect.bottom<=swap.top||rect.top>=swap.bottom);
  });
  check('touch collapses the disclosure and all compact numbers remain uncovered',!await disclosure('origin').evaluate(element=>element.open)&&await host('origin').locator('.bus-service-numbers').isVisible()&&numbersUncovered);
  await capture('bus-stop-compact-mobile');
  await page.locator('#origin').fill('990');
  check('editing immediately removes stale stop details and resets the field icon',await host('origin').isHidden()&&await host('origin').locator('details').count()===0&&await fieldIcon('origin').getAttribute('class')==='icon icon-compass');
  await page.locator('#origin').fill('');
  check('clearing an endpoint leaves no prior stop service description',await host('origin').isHidden()&&await host('origin').innerText()==='');
  await select('origin','99009');await select('destination','59009');
  check('new stop selections show their own numbers and reset to collapsed',await host('origin').locator('.bus-service-numbers').innerText()===numbers('99009')&&!await disclosure('origin').evaluate(element=>element.open)&&!await disclosure('destination').evaluate(element=>element.open));
  await disclosure('origin').locator('summary').tap();await page.locator('#swap').click();
  check('swapping endpoints exchanges stop details without retaining the other stop open state',await host('origin').locator('.bus-service-numbers').innerText()===numbers('59009')&&await host('destination').locator('.bus-service-numbers').innerText()===numbers('99009')&&!await disclosure('origin').evaluate(element=>element.open)&&!await disclosure('destination').evaluate(element=>element.open));

  await select('origin','99009');await select('destination','99049');await search();
  await page.locator('#save-route').click();await page.locator('#save-route-form [name=label]').fill('Bus stop display check');await page.locator('#save-route-form button').click();
  await select('origin','EW2');await select('destination','EW12');
  assert.equal(await acceptedTrip(),accepted,'endpoint editing, details, swapping and route saving leave the accepted journey byte-identical');
  await page.reload();await page.locator('#find-routes:not([disabled])').waitFor();
  // Reload intentionally stops any old location permission/session. The accepted
  // journey identity, status, plan and route must still match exactly.
  const restoredAccepted=await acceptedTrip();
  for(const key of ['id','status','plan','route'])assert.deepEqual(JSON.parse(restoredAccepted)[key],JSON.parse(accepted)[key],`reload preserves accepted ${key}`);
  await nav('saved');await page.locator('.saved-route-card').filter({hasText:'Bus stop display check'}).locator('[data-open]').click();
  check('reopening a saved bus route after reload restores both compact stop disclosures',await host('origin').locator('.bus-service-numbers').innerText()===numbers('99009')&&await host('destination').locator('.bus-service-numbers').innerText()===numbers('99049')&&!await disclosure('origin').evaluate(element=>element.open)&&!await disclosure('destination').evaluate(element=>element.open));
  check('selecting, editing, swapping and reopening endpoints preserve the accepted journey',await acceptedTrip()===restoredAccepted);
  await disclosure('origin').locator('summary').tap();await page.locator('#journey-sheet-handle').press('Home');await disclosure('origin').locator('summary').scrollIntoViewIfNeeded();
  await capture('bus-stop-expanded-mobile');
  await page.setViewportSize({width:320,height:844});await page.addStyleTag({content:'html{font-size:200%}'});
  await page.waitForFunction(()=>Math.abs(parseFloat(document.body.style.getPropertyValue('--nav-height'))-document.querySelector('.app-nav').getBoundingClientRect().height)<1);await page.locator('#journey-sheet-handle').press('Home');
  check('expanded stop directions fit at 320px and 200 percent text without horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await disclosure('origin').evaluate(element=>element.scrollWidth<=element.clientWidth)&&await page.locator('#journey-panel-content').evaluate(element=>element.clientHeight>100));
  await disclosure('origin').locator('summary').scrollIntoViewIfNeeded();await capture('bus-stop-large-text');
  await disclosure('origin').locator('li').first().evaluate(element=>element.scrollIntoView({block:'start',inline:'nearest'}));
  await disclosure('origin').locator('li').first().evaluate(element=>{
    const panel=document.querySelector('#journey-panel-content'),peek=document.querySelector('#trip-peek').getBoundingClientRect(),range=document.createRange();range.selectNodeContents(element);
    const textBottom=Math.max(...[...range.getClientRects()].map(rect=>rect.bottom));
    // Scroll within the real panel to account for the persistent current-trip
    // peek; do not hide the peek or change any layout/application state.
    panel.scrollTop+=Math.max(0,textBottom-Math.min(panel.getBoundingClientRect().bottom,peek.top)+8);
  });
  largeTextReachability=await disclosure('origin').locator('li').first().evaluate(element=>{
    const content=document.querySelector('#journey-panel-content').getBoundingClientRect(),peek=document.querySelector('#trip-peek').getBoundingClientRect(),nav=document.querySelector('.app-nav').getBoundingClientRect();
    const range=document.createRange();range.selectNodeContents(element);
    const rects=[...range.getClientRects()];
    return {textTop:Math.min(...rects.map(rect=>rect.top)),textBottom:Math.max(...rects.map(rect=>rect.bottom)),visibleTop:content.top,visibleBottom:Math.min(content.bottom,peek.top,nav.top),panelHeight:content.height};
  });
  await capture('bus-stop-large-directions');
  check('large-text service direction and operator scroll fully above the current-trip peek',largeTextReachability.textTop>=largeTextReachability.visibleTop&&largeTextReachability.textBottom<=largeTextReachability.visibleBottom);
  await page.setViewportSize({width:1440,height:960});await page.reload();await page.locator('#find-routes:not([disabled])').waitFor();await select('origin','99009');await disclosure('origin').locator('summary').click();
  check('desktop layout exposes readable bus stop directions without overflow',await disclosure('origin').locator('h3').isVisible()&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await capture('bus-stop-desktop');
  const endingBuild=await (await context.request.get(`${base}/data/application-build.json`)).json();
  check('no browser runtime errors or build changes during verification',errors.length===0&&endingBuild.applicationSha256===build.applicationSha256);
}finally{
  await writeFile(out+'/results.json',JSON.stringify({recordedAt:new Date().toISOString(),base,applicationSha256:build?.applicationSha256,checks,errors,largeTextReachability,environment:'Desktop Edge; 390px touch/mobile and 320px 200 percent text emulation. Real keyboard, pointer, touch, search, save and reload interactions; not a physical device test.'},null,2)+'\n');
  await browser.close();
}
