// Controlled GPS/accepted-route fixtures in the retained legacy pages. No physical travel evidence.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {acceptJourney} from '../src/journey-state.js';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4233',out='test-results/pre-fr2-location-legacy-controls';
const override=process.env.SOURCE_OVERRIDE==='1'?await readFile(new URL('../src/journey-ui.js',import.meta.url),'utf8'):null;
const checks=[],errors=[],pass=name=>{checks.push(name);console.log('PASS '+name);};
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
await mkdir(out,{recursive:true});
function fixture(kind){
  const indoors=kind==='transfer',fromStopId=indoors?'DT14_A':'bus:01012',toStopId=indoors?'EW12_A':'bus:01013';
  const leg={type:kind,mode:indoors?'rail':'bus',serviceNo:'7',fromStopId,toStopId,durationSeconds:60,startSeconds:36000,endSeconds:36060,walkingSeconds:0};
  return acceptJourney({id:'labelled-location-controls-fixture',date:'2026-09-21',departureSeconds:36000,arrivalSeconds:36060,walkingSeconds:0,deadlineSeconds:null,legs:[leg],provenance:'Synthetic control visibility fixture'},{originId:fromStopId,destinationId:toStopId,date:'2026-09-21',departureTime:'10:00',walkingLimitMinutes:30,stepFree:false},'labelled-fixture-build');
}
async function sendFix(page,accuracy=10){await page.evaluate(accuracy=>window.testLocationCalls.at(-1).success({coords:{latitude:1.3,longitude:103.85,accuracy},timestamp:Date.now()}),accuracy);}
try{
  for(const path of ['/multimodal.html?legacy=1']){
    for(const kind of ['access','wait','ride','transfer']){
      const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},reducedMotion:'reduce'});
      if(override)await context.route('**/src/journey-ui.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:override}));
      await context.addInitScript(state=>{
        localStorage.setItem('commute-copilot-active-journey-v1',JSON.stringify(state));
        window.testLocationCalls=[];
        Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'prompt'})}});
        Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(success,failure){window.testLocationCalls.push({success,failure});return window.testLocationCalls.length;},clearWatch(){}}});
      },fixture(kind));
      const page=await context.newPage();page.on('pageerror',error=>errors.push(`${path} ${kind}: ${error.message}`));
      await page.goto(base+path);await page.locator('#legacy-manual-recovery').waitFor();
      await page.waitForFunction(()=>window.testLocationCalls.length===1);
      const before=await page.evaluate(()=>localStorage.getItem('commute-copilot-active-journey-v1'));
      assert.equal(await page.locator('#progress-form').isVisible(),true);await sendFix(page);
      const recovery=page.locator('#legacy-manual-recovery');
      assert.equal(await recovery.evaluate(element=>element.open),kind!=='access');
      assert.equal(await page.locator('#progress-form').isVisible(),kind!=='access');
      pass(`${path} ${kind}: usable GPS ${kind==='access'?'compacts outdoor recovery':'retains explicit indoor/wait/boarding confirmation'}`);
      if(kind==='access'){
        await recovery.locator('summary').click();await page.locator('#progress-form [name=kind]').selectOption('unknown');
        await page.locator('#progress-form [name=walk]').fill('7');await page.locator('#progress-form button').focus();await sendFix(page);
        assert.equal(await recovery.evaluate(element=>element.open),true);assert.equal(await page.locator('#progress-form [name=walk]').inputValue(),'7');
        assert.equal(await page.locator('#progress-form [name=kind]').inputValue(),'unknown');
        assert.equal(await page.locator('#progress-form button').evaluate(element=>element===document.activeElement),true);
        pass(`${path} GPS update preserves pending recovery fields and confirmation focus`);
        await page.evaluate(()=>window.testLocationCalls.at(-1).failure({code:1}));
        assert.equal(await recovery.evaluate(element=>element.open),true);
        await page.evaluate(async()=>{const {getAppLocation}=await import('/src/location-assistance.js');getAppLocation().start();});await sendFix(page);
        assert.equal(await recovery.evaluate(element=>element.open),true,'becoming usable must preserve active correction');
        assert.equal(await page.locator('#progress-form button').evaluate(element=>element===document.activeElement),true);
        pass(`${path} denied-to-usable recovery does not dismiss an active confirmation`);
        await recovery.locator('summary').click();await sendFix(page);assert.equal(await recovery.evaluate(element=>element.open),false);
        await sendFix(page,250);assert.equal(await recovery.evaluate(element=>element.open),true);
        pass(`${path} low-accuracy fallback expands manual correction`);
        await recovery.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/legacy-manual-recovery-mobile.png',animations:'disabled'});
      }
      assert.equal(await page.evaluate(()=>localStorage.getItem('commute-copilot-active-journey-v1')),before);
      pass(`${path} ${kind}: assistance leaves canonical legacy progress unchanged`);
      await context.close();
    }
  }
  assert.deepEqual(errors,[]);pass('legacy location controls produce no browser runtime errors');
}finally{
  await writeFile(out+'/verification.json',JSON.stringify({base,checks,errors,sourceOverride:!!override,fixture:'Synthetic route and mocked browser GPS; no physical-device verification'},null,2));
  await browser.close();
}
