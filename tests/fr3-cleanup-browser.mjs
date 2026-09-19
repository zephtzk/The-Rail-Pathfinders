// FR3 layout cleanup: installed Edge with mobile/touch emulation.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {choosePlannerDate,choosePlannerTime} from './planner-browser-helpers.mjs';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4252',out='test-results/fr3-cleanup';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[],errors=[],measurements=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Singapore',serviceWorkers:'block'});
  await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  const nav=view=>page.locator(`.app-nav [data-view=${view}]`).click();
  const active=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
  const expand=async()=>{const h=page.locator('#journey-sheet-handle');if(await h.isVisible()&&await page.locator('#main').getAttribute('data-sheet-state')!=='expanded')await h.click();};
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  check('removed coverage and route-map sections are absent from the DOM',await page.locator('.coverage-details,#coverage-copy,#route-map-details,#route-map-key,#route-map-note').count()===0);
  await nav('preferences');await page.locator('#simple-guidance-toggle').uncheck();await nav('plan');
  for(const [role,query]of [['origin','CC26'],['destination','EW9']]){await page.locator('#'+role).fill(query);await page.locator(`#${role}-suggestions [role=option]`).first().click();}
  await page.locator('[data-time=depart-later]').click();await choosePlannerDate(page,'date','2026-09-21');await choosePlannerTime(page,'departureTime','10:00');
  await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();await expand();
  check('suggested route is immediately followed by Save route and Start journey',await page.locator('[data-route="0"]').evaluate(e=>e.nextElementSibling?.classList.contains('route-actions')&&e.nextElementSibling.querySelector('#save-route')&&e.nextElementSibling.querySelector('#review-route')));
  check('primary controls precede all remaining route information',await page.locator('.route-actions').evaluate(e=>[...document.querySelectorAll('#route-results > .field-note,#route-results > .review-details,#route-results > [data-route]:not([aria-pressed=true])')].every(other=>!!(e.compareDocumentPosition(other)&Node.DOCUMENT_POSITION_FOLLOWING))));
  check('successful planning has no redundant start instruction or timing-assumptions disclosure',await page.locator('#route-start-note').isHidden()&&!/Timing assumptions/.test(await page.locator('#route-results').innerText()));
  check('estimates and accessibility limits remain available before starting',/Times and fares are estimates.*accessibility and crowding are not verified/.test(await page.locator('#route-start-limits').innerText()));
  await page.locator('#save-route').click();await page.locator('#save-route-form [name=label]').fill('FR3 cleanup checked route');await page.locator('#save-route-form button').click();
  check('saving does not start a trip',await active()===null&&(await page.locator('#route-save-status').innerText()).includes('Saved: FR3 cleanup checked route'));
  await page.locator('[data-route="1"]').click();
  check('selecting another route keeps both actions immediately below that selected card',await page.locator('[data-route="1"]').evaluate(e=>e.getAttribute('aria-pressed')==='true'&&e.nextElementSibling?.classList.contains('route-actions')));
  await page.locator('[data-route="0"]').click();await page.locator('[data-route="0"]').scrollIntoViewIfNeeded();
  await page.locator('#app-message.is-visible').waitFor({state:'detached'});
  await page.screenshot({path:`${out}/plan-mobile.png`});
  await page.locator('#review-route').click();await expand();
  check('Start journey opens accepted current trip',(await active())?.status==='started'&&await page.locator('#view-current').isVisible());
  for(const simple of [true,false]){
    await nav('preferences');await page.locator('#simple-guidance-toggle').setChecked(simple);await nav('current');await expand();
    check(`${simple?'simple':'full'} guidance exposes all three labelled trip actions`,await page.locator('#trip-more-actions').count()===0&&JSON.stringify(await page.locator('.trip-actions button').allTextContents())===JSON.stringify(['End trip','Pause trip','Cancel trip'])&&(await Promise.all(['journey-finish','journey-pause','journey-cancel'].map(id=>page.locator('#'+id).isVisible()))).every(Boolean));
    check(`${simple?'simple':'full'} current trip omits redundant position and arrival explanations`,!/(You have not confirmed your position yet|Accepted guidance retained|Arrival time is an estimate)/.test(await page.locator('#companion-active').innerText())&&await page.locator('#location-estimate').isHidden());
  }
  await page.locator('#journey-pause').click();
  check('Pause trip preserves trip and exposes Resume trip',(await active()).status==='paused'&&await page.locator('#journey-pause').innerText()==='Resume trip');
  await page.locator('#journey-pause').click();check('Resume trip restores the same active journey',(await active()).status==='started');
  await page.locator('#journey-cancel').click();check('Cancel trip still requires the existing explicit confirmation',await page.locator('#cancel-trip-confirmation').isVisible()&&(await active()).status==='started');
  await page.locator('#keep-current-trip').click();check('Keep current trip dismisses cancellation without changing the trip',(await active()).status==='started'&&await page.locator('#cancel-trip-confirmation').isHidden());
  const sizes=[{name:'390',width:390,height:844},{name:'320',width:320,height:844},{name:'desktop',width:1440,height:960},{name:'320-large',width:320,height:1000,text:'200%'}];
  for(const size of sizes){
    await page.setViewportSize({width:size.width,height:size.height});await page.evaluate(text=>document.documentElement.style.fontSize=text??'',size.text);
    for(const view of ['plan','current','saved','facilities','caregiver','spending','preferences','staff']){
      await nav(view);await expand();
      const measurement=await page.evaluate(()=>{const c=document.querySelector('.panel-scroll'),n=document.querySelector('.app-nav').getBoundingClientRect();return {noOverflow:document.documentElement.scrollWidth<=innerWidth+1&&c.scrollWidth<=c.clientWidth+1,contentHeight:c.clientHeight,aboveNavigation:c.getBoundingClientRect().bottom<=n.top+1};});
      measurements.push({size:size.name,view,...measurement});
      check(`${size.name} ${view}: content fits and stays scrollable above navigation`,measurement.noOverflow&&measurement.aboveNavigation&&measurement.contentHeight>100);
      if(view==='current'){
        const controls=await page.locator('.trip-actions button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {height:r.height,width:r.width};}));
        check(`${size.name}: trip action touch targets remain at least 44px`,controls.every(r=>r.height>=44&&r.width>=44));
        await page.locator('#app-message.is-visible').waitFor({state:'detached'});
        await page.locator('#current-summary').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/current-${size.name}.png`});
        if(size.name==='390'){await page.locator('.trip-actions').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/trip-actions-mobile.png`});}
      }
    }
  }
  check('no browser runtime errors',errors.length===0);
}finally{
  await writeFile(`${out}/results.json`,JSON.stringify({base,passed:checks.length,checks,measurements,errors,environment:'Installed Edge; 390px and 320px touch emulation, desktop, 200% text. Street tiles blocked. Physical devices and provider integrations not claimed.'},null,2));
  await browser.close();
}
