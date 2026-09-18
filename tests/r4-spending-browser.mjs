import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

// Serve the real source modules in a small browser fixture so this focused suite
// remains independent of concurrent application rebuilds and external map data.
const sourceRoot=path.resolve('src'),out=process.env.CAPTURE_DIR??'test-results/r4-spending';
const fixture='<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/commute.css"><link rel="stylesheet" href="/src/copilot.css"><link rel="stylesheet" href="/src/fare.css"><style>body.commute-app{height:auto;overflow:auto;padding:20px}main.companion-panel{max-width:620px;margin:auto;padding:20px;background:white;border-radius:20px}@media(max-width:420px){body.commute-app{padding:12px}main.companion-panel{padding:15px}}</style></head><body class="commute-app"><main id="spending-test" class="companion-panel"></main><script type="module">import {mountExpenditure} from "/src/fare-ui.js";window.spending=mountExpenditure({host:document.querySelector("main")});</script></body></html>';
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(fixture);return;}
    const url=new URL(req.url,'http://localhost'),file=path.resolve('.'+url.pathname);
    if(!file.startsWith(sourceRoot+path.sep)||!['.js','.css'].includes(path.extname(file))){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Singapore'}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(label,ok)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
const period=id=>page.locator(`[data-spending-disclosure="${id}"]`);
const row=(scope,id)=>period(scope).locator(`[data-transaction="${id}"]`);
async function edit(scope,id){const r=row(scope,id);await r.locator('.spending-record-tools > summary').click();await r.locator('[data-edit]').click();}
const read=()=>page.evaluate(()=>window.spending.ledger.read().state);
try{
  await page.clock.setFixedTime(new Date('2026-09-23T02:00:00Z'));await page.goto(base);await page.locator('#spend-title').waitFor();
  const ids=await page.evaluate(()=>{
    const l=window.spending.ledger;
    for(const [label,completedAt,cents,kind] of [['Today estimate','2026-09-23T01:00:00Z',149,'estimate'],['Monday trip','2026-09-21T01:00:00Z',150,'actual'],['Earlier this month','2026-09-01T01:00:00Z',200,'actual'],['Older trip','2026-08-15T01:00:00Z',250,'actual']])l.addManual({label,completedAt,cents,kind,journeyId:label});
    l.complete({id:'pending',status:'completed',completedAt:'2026-09-23T01:30:00Z',plan:{mode:'real',origin:{label:'Bugis'},destination:{label:'Paya Lebar'}},route:{}},{estimate:{status:'unavailable',totalCents:null}});
    window.spending.demoLedger.addManual({label:'Separate replay',completedAt:'2026-09-23T01:00:00Z',cents:999});window.spending.refresh();
    return Object.fromEntries(l.read().state.records.map(r=>[r.journeyId,r.id]));
  });
  check('Today starts open; calendar week and month start collapsed',await period('today').evaluate(e=>e.open)&&!await period('week').evaluate(e=>e.open)&&!await period('month').evaluate(e=>e.open));
  check('each period has its own transactions',await period('today').locator('[data-transaction]').count()===2&&await period('week').locator('[data-transaction]').count()===3&&await period('month').locator('[data-transaction]').count()===4);
  check('pending count is in every applicable header at normal weight',await period('today').locator('summary .spending-pending').innerText()==='1 trip awaiting amount'&&await period('today').locator('summary .spending-pending').evaluate(e=>getComputedStyle(e).fontWeight)==='400');
  check('periods have visible spacing',await period('week').evaluate(e=>e.getBoundingClientRect().top-e.previousElementSibling.getBoundingClientRect().bottom)>=20);
  check('transaction rows retain padding inside their period card',await row('today',ids.pending).evaluate(e=>parseFloat(getComputedStyle(e).paddingRight)>=15&&parseFloat(getComputedStyle(e.parentElement).paddingLeft)===0));
  check('earlier records remain accessible without appearing in current period totals',await period('earlier').locator('[data-transaction]').count()===1&&(await period('month').locator('summary').first().innerText()).includes('$4.99'));
  await mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'spending-mobile.png'),fullPage:true,animations:'disabled'});
  const initialLedger=await page.evaluate(()=>localStorage.getItem('commute-copilot-expenditure-v2'));

  await period('week').locator('> summary').click();await period('month').locator('> summary').click();
  await edit('week',ids['Today estimate']);
  check('only the selected overlapping row opens an editor',await page.locator('[data-confirm]').count()===1&&await row('week',ids['Today estimate']).locator('[data-confirm]').count()===1&&await row('today',ids['Today estimate']).locator('[data-confirm]').count()===0);
  await page.locator('[data-confirm] [name=amount]').fill('1.59');await page.locator('[data-confirm] button').click();
  check('confirming from week updates the single transaction and all overlapping totals',(await read()).records.find(r=>r.id===ids['Today estimate']).actualCents===159&&(await period('today').locator('> summary').innerText()).includes('$1.59')&&(await period('week').locator('> summary').innerText()).includes('$3.09')&&(await period('month').locator('> summary').innerText()).includes('$5.09'));
  check('expanded periods remain open after saving',await period('week').evaluate(e=>e.open)&&await period('month').evaluate(e=>e.open));
  await edit('month',ids['Today estimate']);await page.locator('[data-adjust] [name=amount]').fill('-0.20');await page.locator('[data-adjust] [name=note]').fill('Fare correction');await page.locator('[data-adjust] button').click();
  check('refund from month affects only the intended transaction once',(await read()).records.find(r=>r.id===ids['Today estimate']).adjustments.length===1&&(await period('today').locator('> summary').innerText()).includes('$1.39'));
  await row('week',ids['Today estimate']).locator('[data-adjustment]').click();
  check('removing an adjustment through another period targets the same transaction',(await read()).records.find(r=>r.id===ids['Today estimate']).adjustments.length===0&&(await period('month').locator('> summary').innerText()).includes('$5.09'));
  await edit('month',ids.pending);await page.locator('[data-confirm] [name=amount]').fill('2.11');await page.locator('[data-confirm] button').click();
  check('pricing pending trip clears all three pending labels and retains other rows',await page.locator('.spending-pending').count()===1&&(await period('today').locator('> summary').innerText()).includes('$3.70')&&(await read()).records.length===5);
  await row('month',ids['Today estimate']).locator('.spending-record-tools > summary').click();await row('month',ids['Today estimate']).locator('[data-delete]').click();
  const after=await read();check('deleting from month removes all copies and preserves the tombstone',await page.locator(`[data-transaction="${ids['Today estimate']}"]`).count()===0&&after.records.length===4&&after.deletedJourneyIds.includes('Today estimate'));
  await page.reload();await page.locator('#spend-title').waitFor();
  check('reload retains edited records and default collapsed week/month',await period('today').locator('[data-transaction]').count()===1&&(await period('today').locator('> summary').innerText()).includes('$2.11')&&!await period('week').evaluate(e=>e.open)&&!await period('month').evaluate(e=>e.open));
  await page.locator('#show-demo-spend').check();check('replay records stay separate from period spending',await page.locator('[data-transaction]').count()===1&&await page.locator('.spending-period').count()===0&&(await page.locator('.spending').innerText()).includes('excluded from every personal total'));
  await page.locator('#show-demo-spend').uncheck();
  await page.setViewportSize({width:320,height:844});await page.locator('html').evaluate(e=>e.style.fontSize='22px');
  check('narrow large text spending fits without horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'spending-large-text.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1280,height:900});await page.locator('html').evaluate(e=>e.style.fontSize='16px');await page.screenshot({path:path.join(out,'spending-desktop.png'),fullPage:true,animations:'disabled'});
  if(process.env.TEST_BASE_URL){
    const appContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Singapore',serviceWorkers:'block'});
    await appContext.addInitScript(value=>localStorage.setItem('commute-copilot-expenditure-v2',value),initialLedger);
    const initialPersonal=JSON.stringify({schemaVersion:2,places:[{id:'home',label:'Home',routingId:'EW8',lat:1.3,lng:103.8,sourceId:'lta:EW8',coverage:'supported',accessibility:'unknown',savedVia:'user'},{id:'work',label:'Work',routingId:'EW12',lat:1.31,lng:103.81,sourceId:'lta:EW12',coverage:'supported',accessibility:'unknown',savedVia:'user'}],templates:[{id:'saved-personal-route',label:'Daily commute',originId:'home',destinationId:'work',preferences:{},savedVia:'user'}],migrations:[]});
    await appContext.addInitScript(value=>localStorage.setItem('commute-copilot-personal-v2',value),initialPersonal);
    await appContext.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:403,body:'Map excluded from spending regression'}));
    const app=await appContext.newPage();app.on('pageerror',e=>errors.push(e.message));await app.clock.setFixedTime(new Date('2026-09-23T02:00:00Z'));
    await app.goto(process.env.TEST_BASE_URL);await app.locator('#find-routes:not([disabled])').waitFor();await app.locator('.app-nav [data-view=spending]').click();
    check('integrated Spending page shows Today transactions and collapsed larger periods',await app.locator('#view-spending [data-spending-disclosure=today]').evaluate(e=>e.open)&&!await app.locator('#view-spending [data-spending-disclosure=week]').evaluate(e=>e.open)&&!await app.locator('#view-spending [data-spending-disclosure=month]').evaluate(e=>e.open));
    await app.screenshot({path:path.join(out,'integrated-spending-mobile.png'),animations:'disabled'});
    await app.setViewportSize({width:320,height:844});await app.locator('body').evaluate(e=>e.classList.add('large-text'));
    check('integrated Spending page fits narrow large text',await app.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.panel-scroll').scrollWidth<=document.querySelector('.panel-scroll').clientWidth));
    await app.screenshot({path:path.join(out,'integrated-spending-large-text.png'),animations:'disabled'});
    await app.setViewportSize({width:1280,height:900});await app.locator('body').evaluate(e=>e.classList.remove('large-text'));await app.screenshot({path:path.join(out,'integrated-spending-desktop.png'),animations:'disabled'});
    await app.locator('.app-nav [data-view=saved]').click();check('saved route remains available beside spending',await app.locator('#saved-routes .saved-route-card').count()===1);
    await app.locator('.app-nav [data-view=spending]').click();
    const expense=app.locator(`#view-spending [data-spending-disclosure=today] [data-transaction="${ids['Today estimate']}"]`);
    await expense.locator('.spending-record-tools > summary').click();await expense.locator('[data-delete]').click();
    check('visiting Saved routes cannot replace a fare deletion handler',await app.locator(`[data-transaction="${ids['Today estimate']}"]`).count()===0&&await app.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-expenditure-v2')).deletedJourneyIds.includes('Today estimate'))&&await app.evaluate(()=>localStorage.getItem('commute-copilot-personal-v2'))===initialPersonal);
    await appContext.close();
  }
  check('no browser exceptions',errors.length===0);await writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,browser:browser.version(),fixture:'Real fare modules in isolated browser fixture; desktop/mobile emulation only'},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
