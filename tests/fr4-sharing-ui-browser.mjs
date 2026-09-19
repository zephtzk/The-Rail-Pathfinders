// Local-only smoke; no capabilities, URLs, screenshots, or raw exceptions logged.
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const workspace=process.env.TEST_WORKSPACE??fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(pathToFileURL(resolve(workspace,'node_modules/playwright/index.mjs')).href);
const {makePlan,startJourney,JOURNEY_KEY}=await import(pathToFileURL(resolve(workspace,'src/journey-v2.js')).href);
const PAIRING_KEY='commute-copilot-pairing-v2',checks=[];
let browser,creation,base,stage='configuration',failure=false,cleanupFailure=false,runtimeErrors=0,creates=0,recipientWrites=0;
const check=(name,value)=>{if(!value)throw Error(name);checks.push(name);console.log('PASS '+name);};
const request=async(path,token,method='GET',body)=>fetch(base+'/api/shares/'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
async function client(seed){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Asia/Singapore',reducedMotion:'reduce'});
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await context.addInitScript(({seed,key})=>{
    localStorage.setItem('commute-copilot-location-v2','off');
    if(!sessionStorage.getItem('fr4-sharing-seeded')){localStorage.setItem(key,JSON.stringify(seed));sessionStorage.setItem('fr4-sharing-seeded','true');}
    window.__fr4GpsCalls=0;window.__fr4CopiedLink=null;
    Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'prompt'})}});
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(){window.__fr4GpsCalls++;return 1;},getCurrentPosition(){window.__fr4GpsCalls++;},clearWatch(){}}});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__fr4CopiedLink=value;}}});
  },{seed,key:JOURNEY_KEY});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',()=>runtimeErrors++);return {context,page};
}
try{
  if(!process.env.TEST_BASE_URL)throw Error('TEST_BASE_URL required');
  const target=new URL(process.env.TEST_BASE_URL);
  if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.username||target.password||target.hash||target.search||target.pathname!=='/')throw Error('Local plain origin required');
  base=target.origin;
  const fixture=makePlan({origin:{id:'fr4-synthetic-start',label:'Synthetic review start'},destination:{id:'fr4-synthetic-end',label:'Synthetic review destination'},date:'2026-09-21',departureTime:'10:00',mode:'replay',preferences:{stepFree:false,walkingLimitMinutes:30},route:{id:'fr4-synthetic-route',departureSeconds:36000,arrivalSeconds:36120,walkingSeconds:120,accessibility:'fixture',provenance:'Synthetic sharing smoke only',steps:[{id:'fr4-first',type:'walk',text:'Review the synthetic first step',durationSeconds:60},{id:'fr4-end',type:'walk',text:'Review the synthetic destination step',durationSeconds:60}]}});
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const owner=await client(startJourney(fixture));
  await owner.context.route('**/api/shares',route=>{if(route.request().method()==='POST'&&++creates>1)return route.abort();return route.continue();});
  stage='creator Caregiver';await owner.page.goto(base);await owner.page.locator('#find-routes:not([disabled])').waitFor({state:'attached'});await owner.page.locator('.app-nav [data-view=caregiver]').click();
  stage='create plan-view share';const created=owner.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/shares'&&r.request().method()==='POST');await owner.page.locator('#prepare-link').click();const response=await created;check('Caregiver creates share through real API',response.status()===201);creation=await response.json();check('Share is read-only plan purpose with no invite capability',creation.purpose==='plan-view'&&!creation.inviteToken);
  stage='copy read-only link';await owner.page.waitForFunction(()=>window.__fr4CopiedLink);const link=await owner.page.locator('#plan-recipient-link').inputValue();const parsed=new URL(link);check('Copied link uses same-origin viewer-only fragment',await owner.page.evaluate(()=>window.__fr4CopiedLink)===link&&parsed.origin===base&&parsed.hash===`#view-trip=${creation.id}.${creation.viewerToken}`);
  const ownPlan=structuredClone(fixture);ownPlan.id='recipient-own-plan';ownPlan.destination.label='Private existing destination';const ownJourney=startJourney(ownPlan),ownRaw=JSON.stringify(ownJourney);
  const recipient=await client(ownJourney);recipient.page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/shares')&&r.method()!=='GET')recipientWrites++;});
  stage='recipient isolated view';await recipient.page.goto(link);await recipient.page.locator('#shared-trip-content h2').waitFor();
  check('Shared plan loads and sensitive fragment is removed',new URL(recipient.page.url()).hash===''&&(await recipient.page.locator('#shared-trip-content').innerText()).includes('Synthetic review destination'));
  check('Recipient has only Refresh trip and no app or journey controls',await recipient.page.locator('button').count()===1&&await recipient.page.locator('#shared-trip-refresh').count()===1&&await recipient.page.locator('.app-nav,#accept-invite,#review-route,#find-routes,#propose-plan,#delete-share').count()===0);
  check('Recipient never starts location or changes own journey',await recipient.page.evaluate(key=>window.__fr4GpsCalls===0&&localStorage.getItem(key),JOURNEY_KEY)===ownRaw);
  check('Viewer session is isolated in sessionStorage',await recipient.page.evaluate(key=>{const session=JSON.parse(sessionStorage.getItem(key));return session?.role==='plan-viewer'&&session.purpose==='plan-view'&&!session.editorToken&&!session.inviteToken&&localStorage.getItem(key)===null;},PAIRING_KEY));
  stage='viewer write authorization';const current=await request(creation.id,creation.editorToken);const state=await current.json();
  for(const [method,path] of [['PATCH',creation.id+'/plan'],['DELETE',creation.id]]){const denied=await request(path,creation.viewerToken,method,{eventId:crypto.randomUUID(),expectedRevision:state.revision,plan:fixture});check(`Viewer ${method} denied by server`,denied.status===404);}
  stage='owner update';const latest=await (await request(creation.id,creation.editorToken)).json(),revised=structuredClone(fixture);revised.destination.label='Updated synthetic destination';revised.route.steps[0].text='Updated synthetic first step';const changed=await request(creation.id+'/plan',creation.editorToken,'PATCH',{eventId:crypto.randomUUID(),expectedRevision:latest.revision,plan:revised});check('Owner update uses fresh revision',changed.ok);
  await recipient.page.locator('#shared-trip-refresh').click();await recipient.page.waitForFunction(()=>document.querySelector('#shared-trip-content').textContent.includes('Updated synthetic destination'));check('Refresh shows owner revised plan', (await recipient.page.locator('#shared-trip-content').innerText()).includes('Updated synthetic first step'));
  stage='recipient reload';await recipient.page.reload();await recipient.page.locator('#shared-trip-content h2').waitFor();check('Reload retains read-only session and own journey',await recipient.page.locator('#shared-trip-refresh').count()===1&&await recipient.page.locator('.app-nav').count()===0&&await recipient.page.evaluate(key=>localStorage.getItem(key),JOURNEY_KEY)===ownRaw&&await recipient.page.evaluate(()=>window.__fr4GpsCalls===0));
  check('Recipient UI sends no mutations and app has no exceptions',recipientWrites===0&&runtimeErrors===0&&creates===1);
}catch{failure=true;console.error('FAIL FR4 read-only sharing at '+stage);}
finally{
  if(creation){try{stage='cleanup';for(let attempt=0;attempt<2;attempt++){const res=await request(creation.id,creation.editorToken);if(res.status===404)break;if(!res.ok)throw Error();const latest=await res.json();const deleted=await request(creation.id,creation.editorToken,'DELETE',{eventId:crypto.randomUUID(),expectedRevision:latest.revision});if(deleted.status===409&&attempt===0)continue;if(!deleted.ok)throw Error();check('Synthetic share deleted with editor capability',(await request(creation.id,creation.editorToken)).status===404);break;}}catch{cleanupFailure=true;console.error('FAIL synthetic share cleanup');}}
  await browser?.close();
}
console.log(JSON.stringify({checks:checks.length,failed:failure,cleanupFailure,runtimeErrors,creates,recipientWrites}));
if(failure||cleanupFailure)process.exitCode=1;
