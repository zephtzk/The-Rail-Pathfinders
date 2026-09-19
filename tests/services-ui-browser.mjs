// Focused controller fixture. The integrated commute/replay test is separate.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const now=Date.parse('2026-09-19T02:00:00Z');
const incident={id:'demo-fixture',demo:true,source:'demo',title:'Test closure <img src=x onerror="window.injected=true">',details:'Simulated only',status:'active',revision:1,startsAt:'2026-09-19T09:00:00+08:00',endsAt:'2026-09-19T11:00:00+08:00'};
let calls=0,payload={schemaVersion:1,checkedAt:new Date(now).toISOString(),notices:{status:'unavailable',error:'not_configured',items:[],segments:[]}};
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/commute.css"><body class="commute-app" style="height:auto;overflow:auto;padding:12px"><button id="app-control">Existing app control</button><main><div id="notice"></div><div id="services"></div><section id="facilities">Existing lift and toilet facilities</section></main><script type="module">import {mountServices} from '/src/services-ui.js';window.calls=[];window.controller=mountServices({host:document.querySelector('#services'),noticeHost:document.querySelector('#notice'),loadIncidents:()=>JSON.parse(localStorage.getItem('test-incidents')||'[]'),getContext:()=>({input:{date:'2026-09-19'}}),onReplay:incident=>window.calls.push(['replay',incident.id]),onOpenServices:()=>window.calls.push(['services']),now:()=>${now}});</script>`;
const allowed=new Set(['services-ui.js','services-model.js','feed-health.js','services.css','commute.css','fare.css']);
const server=createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(req.url==='/api/notices'){calls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(payload));return;}
  const name=req.url?.slice('/src/'.length);
  if(req.url?.startsWith('/src/')&&allowed.has(name)){res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(new URL('../src/'+name,import.meta.url)));return;}
  res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:320,height:800},serviceWorkers:'block'});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await context.addInitScript(value=>{if(!localStorage.getItem('test-incidents'))localStorage.setItem('test-incidents',JSON.stringify([value]));},incident);
const settled=()=>page.locator('#services-refresh:not([disabled])').waitFor();
const check=(label,value)=>{assert.ok(value,label);console.log('PASS '+label);};
try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await settled();
  check('Saved active demo is labelled simulated at entry',await page.locator('#notice').isVisible()&&/Simulated service incident/.test(await page.locator('#notice').innerText()));
  check('Unavailable official connection is unknown, not normal service',/not connected.*unknown/.test(await page.locator('#services-feed-status').innerText()));
  check('Saved incident text is escaped',await page.locator('#services-demo img').count()===0&&!await page.evaluate(()=>window.injected));
  check('Facility sibling is preserved',await page.locator('#facilities').innerText()==='Existing lift and toilet facilities');
  check('Mount changes no route',await page.evaluate(()=>window.calls.length)===0);
  await page.locator('[data-services-open]').click();check('Services callback and heading focus work',await page.evaluate(()=>window.calls[0][0]==='services'&&document.activeElement.id==='services-notices-heading'));
  await page.locator('[data-services-dismiss]').click();check('Dismiss hides entry but retains incident card',!await page.locator('#notice').isVisible()&&await page.locator('[data-service-incident]').count()===1);
  await page.reload();await settled();check('Session dismissal survives app reload',!await page.locator('#notice').isVisible());
  await page.locator('#services-reopen').click();check('Services reopens entry notice',await page.locator('#notice').isVisible());
  await page.locator('[data-services-dismiss]').click();await page.locator('[data-services-replay]').click();check('Replay passes the selected incident without replacing it',await page.evaluate(()=>window.calls.some(c=>c[0]==='replay'&&c[1]==='demo-fixture')));
  await page.evaluate(()=>{const values=JSON.parse(localStorage.getItem('test-incidents'));values[0].revision++;localStorage.setItem('test-incidents',JSON.stringify(values));window.dispatchEvent(new CustomEvent('demo:incidents-changed'));});
  check('Changed incident revision triggers a fresh notice',await page.locator('#notice').isVisible());
  await page.evaluate(()=>{const values=JSON.parse(localStorage.getItem('test-incidents'));values[0].status='resolved';localStorage.setItem('test-incidents',JSON.stringify(values));window.dispatchEvent(new CustomEvent('demo:incidents-changed'));});
  check('Resolved incident removes entry alert while retaining its history',!await page.locator('#notice').isVisible()&&/resolved/.test(await page.locator('#services-demo').innerText()));
  payload={schemaVersion:1,checkedAt:new Date(now).toISOString(),notices:{status:'available',retrievedAt:new Date(now).toISOString(),items:[{text:'Operator alert <img src=x onerror="window.injected=true">'}],segments:[]}};
  await page.locator('#services-refresh').click();await settled();check('Actual official text has a separate official entry label',/Official service advisory/.test(await page.locator('#notice').innerText())&&await page.locator('#services-official img').count()===0);
  await page.locator('[data-services-dismiss]').click();await page.locator('#services-refresh').click();await settled();check('Refreshing unchanged official text does not repeat a dismissed notice',!await page.locator('#notice').isVisible());
  payload.notices={...payload.notices,status:'unavailable'};await page.locator('#services-refresh').click();await settled();check('Unavailable cached advisory stays visible as last known without entry failure claim',!await page.locator('#notice').isVisible()&&/Last known official notice/.test(await page.locator('#services-official').innerText()));
  const before=calls;await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));});check('Focus and reconnection do not start polling',calls===before);
  check('320px fixture has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('No browser runtime errors',errors.length===0);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
