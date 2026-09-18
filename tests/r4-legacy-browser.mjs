import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createPersonalStore,PERSONAL_KEY} from '../src/personal.js';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4194';
const output=process.env.CAPTURE_DIR??'test-results/r4/legacy';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const results=[],errors=[];
const check=(name,value)=>{assert.ok(value,name);results.push({name,status:'PASS'});console.log('PASS '+name);};
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
    await page.locator('#saved-date').waitFor();
    await page.locator('#saved-date').fill('2026-09-21');await page.locator('#saved-time').fill(mode==='replay'?'08:10':'10:00');
    await page.locator('[data-template][data-action=select]').click();
    if(mode!=='replay')await page.locator(mode==='rail'?'#rail-form':'#pilot-form').getByRole('button',{name:mode==='rail'?'Find rail journeys':'Find pilot journeys'}).click();
    await page.locator('#review-selected').click();
    const preview=await page.locator('#companion-preview').textContent();
    check(mode+' saved route keeps senior fare and step-free requirement',preview.includes('senior fare category')&&preview.includes('verified step-free path required'));
    check(mode+' prepared trip hides the obsolete review action',!await page.locator('#review-selected').isVisible());
    if(mode==='replay') {
      await page.locator('#edit').click();await page.locator('#trip-form [name=walkingLimit]').selectOption('12');
      check(mode+' editing removes stale Start Journey',await page.locator('#start-companion').count()===0);
      await page.locator('#trip-form').getByRole('button',{name:'Update journey'}).click();
    } else {
      const form=page.locator(mode==='rail'?'#rail-form':'#pilot-form');
      await form.locator('[name=walkingLimitMinutes]').selectOption('30');
      check(mode+' editing removes stale Start Journey',await page.locator('#start-companion').count()===0);
      await form.getByRole('button',{name:mode==='rail'?'Find rail journeys':'Find pilot journeys'}).click();
    }
    await page.locator('#review-selected').click();
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
