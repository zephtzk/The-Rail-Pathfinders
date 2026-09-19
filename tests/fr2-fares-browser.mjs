import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

// Exercise real journey transitions, fare computation and spending UI without
// depending on a parallel app build, public maps or external data requests.
const root=fileURLToPath(new URL('../',import.meta.url)),sourceRoot=path.join(root,'src');
const out=process.env.CAPTURE_DIR??path.join(root,'test-results/fr2-fares');
const fixture=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/commute.css"><link rel="stylesheet" href="/src/copilot.css"><link rel="stylesheet" href="/src/fare.css"><style>body.commute-app{height:auto;overflow:auto;padding:12px}main.companion-panel{max-width:620px;margin:auto;padding:15px;background:white;border-radius:20px}</style></head><body class="commute-app"><main class="companion-panel"></main><script type="module">
import {mountExpenditure} from '/src/fare-ui.js';
import {routeFromLegacy,startJourney,transition} from '/src/journey-v2.js';
window.spending=mountExpenditure({host:document.querySelector('main')});
window.finishTestJourney=({from='NS1',to='NS4',mode='real'}={})=>{
  const names={NS1:'Jurong East',NS4:'Choa Chu Kang',NS9:'Woodlands'};
  const plan=routeFromLegacy({id:'browser-fixture:'+from+':'+to,departureSeconds:36000,arrivalSeconds:37000,walkingSeconds:0,legs:[{type:'ride',mode:'rail',routeId:'NSL',fromStopId:from+'_A',toStopId:to+'_A',startSeconds:36000,endSeconds:37000,durationSeconds:1000,stopIds:[from+'_A',to+'_A']}]},{originId:from,destinationId:to,date:'2026-09-23',departureTime:'10:00'},{name:id=>names[id]??id});
  plan.mode=mode;
  const finished=transition(startJourney(plan,Date.now()-1000000),'finish',Date.now());
  const result=window.spending.complete(finished);
  window.lastFinished=finished;
  return {result,journey:finished};
};
</script></body></html>`;
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture);return;}
    const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname);
    if(!file.startsWith(sourceRoot+path.sep)||!['.js','.css'].includes(path.extname(file))){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const errors=[],checks=[];
const check=(label,ok)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Singapore'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-09-23T02:20:00Z'));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#spend-title').waitFor();
  const today=page.locator('[data-spending-disclosure=today]');
  const row=id=>today.locator(`[data-transaction="${id}"]`);
  const money=cents=>(cents/100).toFixed(2);
  const totals=()=>page.evaluate(()=>window.spending.ledger.totals(Date.now()).dayTotals);
  const record=id=>page.evaluate(id=>window.spending.ledger.read().state.records.find(r=>r.id===id),id);
  async function edit(id){const tools=row(id).locator('.spending-record-tools');if(!await tools.evaluate(e=>e.open))await tools.locator('> summary').click();await tools.locator('[data-edit]').click();}

  await page.locator('[data-spending-disclosure=budget] > summary').click();
  await page.locator('#commute-budget-form [name=amount]').fill('10.00');
  await page.locator('#commute-budget-form button.primary').click();
  const first=await page.evaluate(()=>window.finishTestJourney()),id=first.result.record.id,estimate=first.result.record.estimatedCents;
  check('finishing a real rail journey automatically records a non-null graph estimate',first.result.ok&&first.result.recorded&&Number.isInteger(estimate)&&estimate>0&&first.result.record.actualCents===null&&first.result.record.fareEstimate.estimateKind==='approximate-distance');
  check('budget counts the completed estimate once',await page.locator('.budget-amount').innerText()===`$${money(estimate)} recorded of $10.00`&&(await totals()).estimatedCents===estimate&&(await totals()).confirmedCents===0);
  const repeated=await page.evaluate(()=>window.spending.complete(window.lastFinished));
  check('repeating journey completion cannot double-charge the ledger',repeated.ok&&!repeated.recorded&&(await totals()).tripCount===1&&(await totals()).totalCents===estimate);

  await row(id).locator('.spending-record-tools > summary').click();
  const fare=row(id).locator('.fare-estimate'),fareText=await fare.innerText();
  check('record shows approximate label, effective date, checked date and official source',fareText.includes('Approximate distance')&&fareText.includes('estimated distance')&&fareText.includes('Fares effective 2025-12-27')&&fareText.includes('checked 2026-09-19')&&await fare.getByRole('link',{name:'Official fare source'}).getAttribute('href')==='https://www.ptc.gov.sg/fares/public-transport-fares-and-passes/');
  await fare.locator('details > summary').click();
  check('calculation details distinguish coordinate approximation from official fare distance',(await fare.innerText()).includes('not official fare distance or track length'));
  check('390px source disclosure has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'fare-estimate-mobile.png'),fullPage:true,animations:'disabled'});

  await edit(id);await page.locator('[data-confirm] [name=amount]').fill('1.90');await page.locator('[data-confirm] button').click();
  const confirmed=await record(id);
  check('manual charge replaces the estimate in totals while preserving its provenance',confirmed.actualCents===190&&confirmed.estimatedCents===estimate&&confirmed.fareEstimate.distanceSources[0].kind==='estimated-rail-distance'&&(await totals()).confirmedCents===190&&(await totals()).estimatedCents===0&&(await totals()).totalCents===190&&await row(id).locator('.spending-amount').innerText()==='$1.90');
  await edit(id);await page.locator('[data-adjust] [name=amount]').fill('-0.20');await page.locator('[data-adjust] [name=note]').fill('Refund confirmed in payment history');await page.locator('[data-adjust] button').click();
  check('refund updates the same trip and budget once',(await record(id)).adjustments.length===1&&(await totals()).totalCents===170&&await row(id).locator('.spending-amount').innerText()==='$1.70'&&await page.locator('.budget-amount').innerText()==='$1.70 recorded of $10.00');

  const second=await page.evaluate(()=>window.finishTestJourney({from:'NS9',to:'NS1'})),secondEstimate=second.result.record.estimatedCents,total=170+secondEstimate;
  check('budget combines one confirmed net charge and one labelled estimate without duplication',second.result.recorded&&secondEstimate>0&&(await totals()).tripCount===2&&(await totals()).confirmedCents===170&&(await totals()).estimatedCents===secondEstimate&&await page.locator('.budget-amount').innerText()===`$${money(total)} recorded of $10.00`);
  const replay=await page.evaluate(()=>window.finishTestJourney({mode:'replay'}));
  check('completed replay is stored separately and excluded from personal spending',replay.result.recorded&&replay.result.record.demo&&(await totals()).tripCount===2&&(await totals()).totalCents===total&&await page.evaluate(()=>window.spending.demoLedger.read().state.records.length)===1);
  await page.locator('#show-demo-spend').check();
  check('replay view explicitly states exclusion and hides personal budget',await page.locator('.spending').innerText().then(text=>text.includes('excluded from every personal total'))&&await page.locator('[data-transaction]').count()===1&&await page.locator('.commute-budget').count()===0);
  await page.locator('#show-demo-spend').uncheck();
  check('returning to personal spending preserves budget and totals',await page.locator('.budget-amount').innerText()===`$${money(total)} recorded of $10.00`);
  check('390px completed spending has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'fare-corrections-mobile.png'),fullPage:true,animations:'disabled'});
  await page.reload();await page.locator('#spend-title').waitFor();
  check('reload preserves actual charge, refund, estimate and replay separation',(await totals()).totalCents===total&&(await record(id)).actualCents===190&&(await record(id)).adjustments.length===1&&await page.evaluate(()=>window.spending.demoLedger.read().state.records.length)===1);
  check('no browser exceptions',errors.length===0);
  await writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,browser:browser.version(),viewport:{width:390,height:844},firstEstimateCents:estimate,secondEstimateCents:secondEstimate,finalPersonalCents:total,fixture:'Real source modules and journey transitions with synthetic test journeys; mobile browser emulation, not a live fare-payment check'},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
