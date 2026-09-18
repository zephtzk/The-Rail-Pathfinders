import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {choosePlannerDate,choosePlannerTime} from './planner-browser-helpers.mjs';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4195',out='docs/evidence/r5';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce'});
await context.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:403,body:'Controlled map fallback test'}));
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(label,value)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label);};
const trip=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
async function endpoint(role,value){await page.locator('#'+role).fill(value);await page.locator('#'+role).press('ArrowDown');await page.locator('#'+role).press('Enter');}
async function later(){await page.locator('[data-time=depart-later]').click();await choosePlannerDate(page,'date','2026-09-21');await choosePlannerTime(page,'departureTime','10:00');}
let metrics;
try{
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  await endpoint('origin','EW2');await endpoint('destination','EW12');await later();
  await page.locator('#find-routes').click();await page.locator('#review-route').click();await page.locator('#start-companion').click();
  const accepted=JSON.stringify(await trip());
  await page.locator('.app-nav [data-view=plan]').click();await endpoint('origin','99009');await endpoint('destination','28009');await later();
  // These observe frame scheduling; they do not alter application state.
  await page.evaluate(()=>{window.busFrameTimes=[];window.busFramesActive=true;const tick=t=>{window.busFrameTimes.push(t);if(window.busFramesActive)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  const before=performance.now();await page.locator('#find-routes').click();
  await page.locator('#destination').fill('59009');
  check('editing an endpoint cancels pending full-network search without freezing controls',await page.locator('#find-routes').isEnabled());
  await page.locator('#destination').press('ArrowDown');await page.locator('#destination').press('Enter');
  await page.waitForTimeout(450);
  check('cancelled search cannot repopulate old route results',await page.locator('.route-card').count()===0);
  check('cancellation leaves accepted trip unchanged',JSON.stringify(await trip())===accepted);
  const searchStarted=performance.now();await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();
  const searchMs=performance.now()-searchStarted;
  check('fresh full-network search completes after cancellation',await page.locator('.route-card').count()>0);
  check('fresh results preserve accepted trip until explicit review and acceptance',JSON.stringify(await trip())===accepted);
  const frames=await page.evaluate(()=>{window.busFramesActive=false;return window.busFrameTimes;});
  const gaps=frames.slice(1).map((v,i)=>v-frames[i]);
  metrics={elapsedMs:performance.now()-before,newWorkerSearchMs:searchMs,animationFrames:frames.length,maxFrameGapMs:Math.max(0,...gaps),viewport:{width:390,height:844}};
  check('UI continues scheduling frames through cancel and worker restart',frames.length>10);
  check('mobile layout remains within viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('no browser errors',errors.length===0);
  await page.locator('#app-message').waitFor({state:'hidden'});
  await page.locator('.route-card').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:out+'/bus-worker-mobile.png',animations:'disabled'});
}finally{
  await writeFile(out+'/bus-browser.json',JSON.stringify({recordedAt:new Date().toISOString(),evidenceClass:'Desktop Edge mobile/touch emulation; actual clicks/keyboard and worker termination; not a physical phone or live provider test',checks,errors,metrics},null,2)+'\n');
  await browser.close();
}
