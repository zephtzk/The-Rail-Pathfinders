import {choosePlannerDate} from './planner-browser-helpers.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createPersonalStore,PERSONAL_KEY} from '../src/personal.js';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4194';
const output=process.env.CAPTURE_DIR??'test-results/r4/legacy';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const results=[],errors=[];
const check=(name,value)=>{assert.ok(value,name);results.push({name,status:'PASS'});console.log('PASS '+name);};
async function cancelDate(page,field){
  const value=await page.locator(`[name="${field}"]`).inputValue();
  await page.locator(`[data-date-input="${field}"]`).click();
  await page.locator('.date-dialog[open] [aria-selected=true]').press('PageDown');
  await page.keyboard.press('Escape');
  await page.locator('.date-dialog[open]').waitFor({state:'hidden'});
  return await page.locator(`[name="${field}"]`).inputValue()===value&&await page.locator(`[data-date-input="${field}"]`).evaluate(e=>e===document.activeElement);
}
function personalSeed(replay) {
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const store=createPersonalStore(storage);
  for(const [id,label,stationId] of [['home','Home',replay?'payalebar':'CC9'],['work','Work',replay?'bugis':'DT14']]) {
    store.addPlace({id,label,stationId,lat:1.3,lng:103.8,sourceId:'lta:'+stationId,coverage:'supported',accessibility:'unknown'});
  }
  store.addTemplate({label:'Saved senior route',originId:'home',destinationId:'work',preferences:{stepFree:true,fareCategory:'senior',walkingLimitMinutes:25,maxExtraMinutes:7,preference:'fastest'}});
  return values.get(PERSONAL_KEY);
}
try {
  for(const mode of process.env.LEGACY_MODES?.split(',')??['rail','pilot','replay']) {
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:960},reducedMotion:'reduce'});
    await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:PERSONAL_KEY,value:personalSeed(mode==='replay')});
    const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(mode+': '+error.message));
    await page.goto(base+(mode==='rail'?'/?legacy=1':mode==='pilot'?'/multimodal.html?legacy=1':'/replay.html'));
    await page.locator('[data-date-input=saved-date]').waitFor();
    check(mode+' saved-route calendar cancellation preserves date and returns focus',await cancelDate(page,'saved-date'));
    await choosePlannerDate(page,'saved-date','2026-09-21');await page.locator('#saved-time').fill(mode==='replay'?'08:10':'10:00');
    await page.locator('[data-template][data-action=select]').click();
    if(mode!=='replay')await page.locator(mode==='rail'?'#rail-form':'#pilot-form').getByRole('button',{name:mode==='rail'?'Find rail journeys':'Find pilot journeys'}).click();
    await page.locator('#review-selected').click();
    const preview=await page.locator('#companion-preview').textContent();
    check(mode+' saved calendar date reaches the fresh route',preview.includes('2026-09-21'));
    check(mode+' saved route keeps senior fare and step-free requirement',preview.includes('senior fare category')&&preview.includes('verified step-free path required'));
    check(mode+' prepared trip hides the obsolete review action',!await page.locator('#review-selected').isVisible());
    if(mode==='replay') {
      await page.locator('#edit').click();
      check(mode+' planner calendar cancellation preserves date and returns focus',await cancelDate(page,'date'));
      check(mode+' cancelling calendar leaves the trip modal and prepared journey open',await page.locator('#trip-form').isVisible()&&await page.locator('#start-companion').count()===1);
      await choosePlannerDate(page,'date','2026-09-22');
      check(mode+' applying a calendar date clears stale Start Journey',await page.locator('#start-companion').count()===0);
      await page.locator('#trip-form [name=walkingLimit]').selectOption('12');
      check(mode+' editing removes stale Start Journey',await page.locator('#start-companion').count()===0);
      await page.locator('#trip-form').getByRole('button',{name:'Update journey'}).click();
    } else {
      const form=page.locator(mode==='rail'?'#rail-form':'#pilot-form');
      check(mode+' planner calendar cancellation preserves date and returns focus',await cancelDate(page,'date'));
      await choosePlannerDate(page,'deadlineDate','2026-09-21');
      await choosePlannerDate(page,'date','2026-09-22');
      check(mode+' matching arrival date follows departure and refreshes its label',await form.locator('[name=deadlineDate]').inputValue()==='2026-09-22'&&(await form.locator('[data-date-input=deadlineDate]').innerText()).includes('22 Sept 2026'));
      check(mode+' applying a calendar date clears stale Start Journey',await page.locator('#start-companion').count()===0);
      await form.locator('[name=walkingLimitMinutes]').selectOption('30');
      check(mode+' editing removes stale Start Journey',await page.locator('#start-companion').count()===0);
      await form.getByRole('button',{name:mode==='rail'?'Find rail journeys':'Find pilot journeys'}).click();
    }
    await page.locator('#review-selected').click();
    check(mode+' replanning keeps one calendar per surviving form',await page.locator('.date-dialog').count()===(mode==='replay'?1:2));
    check(mode+' replan uses the edited civil date and retains native time controls',(await page.locator('#companion-preview').textContent()).includes('2026-09-22')&&await page.locator('input[type=date]').count()===0&&await page.locator('input[type=time]').count()>0);
    check(mode+' replanning preserves saved hidden preferences',await page.locator('#companion-preview').textContent().then(text=>text.includes('senior fare category')&&text.includes('verified step-free path required')));
    if(mode==='replay') {
      await page.locator('#start-companion').click();
      const active=await page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
      check('replay accepted plan retains explicit walking edit and saved fare',active?.plan.preferences.walkingLimitMinutes===12&&active.plan.preferences.fareCategory==='senior'&&active.plan.preferences.stepFree===true);
    } else {
      await page.locator('#start-companion').click();
      check(mode+' unverified saved step-free requirement still blocks starting',await page.evaluate(()=>localStorage.getItem('commute-copilot-journey-v2'))===null);
    }
    await context.close();
  }
  check('legacy preference and invalidation flows have no uncaught page errors',errors.length===0);
} finally {
  await mkdir(output,{recursive:true});await writeFile(output+'/checks.json',JSON.stringify({results,errors},null,2));await browser.close();
}
