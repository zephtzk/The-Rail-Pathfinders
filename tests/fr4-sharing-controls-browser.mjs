import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const workspace=process.env.TEST_WORKSPACE??fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(pathToFileURL(resolve(workspace,'node_modules/playwright/index.mjs')).href);
const {makePlan,startJourney,JOURNEY_KEY}=await import(pathToFileURL(resolve(workspace,'src/journey-v2.js')).href);
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4254',checks=[],errors=[];
const check=(label,value)=>{assert.ok(value,label);checks.push(label);};
const fixture=makePlan({origin:{id:'fixture-origin',label:'Synthetic start'},destination:{id:'fixture-end',label:'Synthetic destination'},date:'2026-09-21',departureTime:'10:00',mode:'replay',preferences:{stepFree:false},route:{id:'fixture',departureSeconds:36000,arrivalSeconds:36120,walkingSeconds:120,accessibility:'fixture',steps:[{id:'a',type:'walk',text:'Synthetic first step',durationSeconds:60},{id:'b',type:'walk',text:'Synthetic last step',durationSeconds:60}]}});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const out='test-results/fr4-sharing-controls';await mkdir(out,{recursive:true});
try{
  for(const fallback of [false,true]){
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
    const share={id:'a'.repeat(22),editorToken:'e'.repeat(43),viewerToken:'v'.repeat(43),purpose:'plan-view',revision:1};let plan=structuredClone(fixture),deleted=false,creates=0,patches=0,pushCalls=0;
    await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await context.route('**/api/push/**',route=>{pushCalls++;return route.fulfill({json:{configured:false}});});
    await context.route('**/api/shares**',route=>{
      const method=route.request().method(),path=new URL(route.request().url()).pathname,body=method==='GET'?null:route.request().postDataJSON();
      if(method==='POST'&&path==='/api/shares'){creates++;plan=body.plan;return route.fulfill({status:201,json:share});}
      if(deleted)return route.fulfill({status:404,json:{error:{message:'Unavailable'}}});
      if(method==='PATCH'){assert.equal(body.expectedRevision,share.revision);plan=body.plan;share.revision++;patches++;return route.fulfill({json:{revision:share.revision}});}
      if(method==='DELETE'){deleted=true;return route.fulfill({json:{ok:true,revision:share.revision+1}});}
      return route.fulfill({json:{id:share.id,purpose:share.purpose,readOnly:true,sharedPlan:plan,revision:share.revision,status:'shared-plan'}});
    });
    await context.addInitScript(({active,key,fallback})=>{
      localStorage.setItem('commute-copilot-location-v2','off');if(!sessionStorage.getItem('test-seeded')){localStorage.setItem(key,JSON.stringify(active));sessionStorage.setItem('test-seeded','yes');}
      const next=sessionStorage.getItem('test-next-journey');if(next){localStorage.setItem(key,next);sessionStorage.removeItem('test-next-journey');}
      window.copyCalls=0;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{window.copyCalls++;if(fallback)throw Error('Clipboard denied');}}});
    },{active:startJourney(fixture),key:JOURNEY_KEY,fallback});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor({state:'attached'});await page.locator('.app-nav [data-view=caregiver]').click();await page.locator('#prepare-link').click();await page.locator('#plan-recipient-link').waitFor();
    await page.waitForFunction(()=>document.querySelector('#plan-share-copy-status').textContent!== 'Select the link to copy it.');
    check(`${fallback?'fallback':'copied'}: provider has exactly the requested two actions`,JSON.stringify(await page.locator('#companion-sharing button').allTextContents())===JSON.stringify(['Refresh shared trip','Cancel sharing']));
    check('Clipboard is attempted once and visible result matches',await page.evaluate(()=>window.copyCalls)===1&&(await page.locator('#plan-share-copy-status').textContent()).includes(fallback?'use Copy':'copied'));
    const link=page.locator('#plan-recipient-link');await link.focus();check('Readonly link supports manual selection',await link.evaluate(e=>e.readOnly&&e.selectionStart===0&&e.selectionEnd===e.value.length&&e.value.includes('#view-trip=')));
    await page.evaluate(key=>{const active=JSON.parse(localStorage.getItem(key));active.plan.destination.label='New provider destination';sessionStorage.setItem('test-next-journey',JSON.stringify(active));},JOURNEY_KEY);
    await page.reload();await page.locator('#find-routes:not([disabled])').waitFor({state:'attached'});await page.locator('.app-nav [data-view=caregiver]').click();await page.locator('#refresh-plan-link').click();await page.waitForFunction(()=>document.querySelector('#companion-sharing h4')?.textContent.includes('New provider destination'));
    check('Refresh synchronizes current provider plan through fresh revision',patches===1&&plan.destination.label==='New provider destination');
    check('Refresh or reload never automatically recopies the link',await page.evaluate(()=>window.copyCalls)===0);
    // A cached legacy owner also receives the two-control interface.
    share.purpose='handoff';
    await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('commute-copilot-pairing-v2'));delete s.purpose;s.inviteToken='i'.repeat(43);localStorage.setItem('commute-copilot-pairing-v2',JSON.stringify(s));});
    await page.reload();await page.locator('#find-routes:not([disabled])').waitFor({state:'attached'});await page.locator('.app-nav [data-view=caregiver]').click();
    check('Cached legacy owner has two actions without notifications',JSON.stringify(await page.locator('#companion-sharing button').allTextContents())===JSON.stringify(['Refresh shared trip','Cancel sharing'])&&await page.locator('#enable-push,#disable-push').count()===0);
    check('Legacy invitation is not presented as a read-only recipient link',await page.locator('#plan-recipient-link').count()===0&&(await page.locator('#companion-sharing').innerText()).includes('Cancel this older share'));
    await page.locator('#delete-plan-link').click();await page.locator('#prepare-link').waitFor();check('Cancel deletes the share and clears local pairing',deleted&&await page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-pairing-v2'))===null));
    check('No push API use and only one share created',pushCalls===0&&creates===1);await context.close();
  }
  check('No browser exceptions',errors.length===0);console.log(`PASS ${checks.length} sharing control checks`);
}finally{await writeFile(`${out}/results.json`,JSON.stringify({checks,errors,evidence:'Synthetic sharing API; built app in local desktop Edge preview.'},null,2));await browser.close();}
