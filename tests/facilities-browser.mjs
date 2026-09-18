// Isolated browser integration test, including canonical journey state. This is
// desktop emulation, not evidence of a physical phone or a real station survey.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url);
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;
  if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="test-facilities"></main></body></html>');return;}
  if(!/^\/src\/[a-z0-9-]+\.(js|css)$/.test(pathname)){res.writeHead(404);res.end();return;}
  try{res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(new URL('.'+pathname,root)));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:[]}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async()=>{
    const {mountFacilities}=await import('/src/facility-ui.js'),model=await import('/src/journey-v2.js');
    window.journey=null;window.markers=[];let mounted;
    const commit=value=>{window.journey=value;mounted?.refresh();};
    mounted=mountFacilities({host:document.querySelector('#test-facilities'),getJourney:()=>window.journey,onMarkers:value=>window.markers=value,
      onStartFixture:({checkpoint})=>{
        const plan=model.makePlan({origin:{id:'fixture-origin',label:'Training origin'},destination:{id:'fixture-destination',label:'Original destination'},date:'2026-09-18',departureTime:'10:00',mode:'replay',preferences:{stepFree:true,walkingLimitMinutes:60},route:{id:'fixture',departureSeconds:36000,arrivalSeconds:38000,walkingSeconds:180,accessibility:'fixture',provenance:'Browser test fixture',steps:[{id:'main-step',text:'Continue to original destination',durationSeconds:600}]}});
        commit(model.confirmCheckpoint(model.startJourney(plan),checkpoint));
      },onCheckpoint:cp=>{if(window.journey)commit(model.confirmCheckpoint(window.journey,cp));},onAcceptDetour:preview=>commit(model.acceptDetour(window.journey,preview)),onStopAction:action=>commit(model.stopAction(window.journey,action)),onFacilityChange:event=>{if(window.journey){window.journey.facilityScenario=event.scenario;window.incident=event;}},
    });window.facilities=mounted;
  });
  await page.getByRole('button',{name:'Find a toilet',exact:true}).click();
  assert.match(await page.locator('.facility-results').innerText(),/Unknown suitability/);
  assert.equal(await page.locator('[data-preview]').count(),0);
  assert.equal(await page.evaluate(()=>window.markers.length),1);
  assert.equal(await page.evaluate(()=>window.markers[0].status),'unknown');
  await page.locator('[data-field="station"]').selectOption('fixture-interchange');
  await page.getByText('Labelled incident rehearsal',{exact:true}).click();
  await page.getByRole('button',{name:'Prepare training journey',exact:true}).click();
  await page.getByRole('button',{name:'Find a toilet',exact:true}).click();
  assert.match(await page.locator('.facility-result').first().innerText(),/Toilet A/);
  await page.getByText('Labelled incident rehearsal',{exact:true}).click();
  await page.locator('[data-field="scenario"]').selectOption('lift-outage');
  assert.match(await page.locator('.facility-result').first().innerText(),/Toilet B/);
  assert.match(await page.locator('.facility-result').filter({hasText:'Toilet A · training fixture'}).innerText(),/Excluded from directions/);
  await page.locator('[data-preview="fixture-toilet-b"]').click();
  assert.match(await page.locator('.facility-preview').innerText(),/Original destination/);
  await page.getByRole('button',{name:'Accept toilet detour',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.journey.detour.toiletId),'fixture-toilet-b');
  assert.equal(await page.evaluate(()=>window.journey.plan.destination.id),'fixture-destination');
  assert.equal(await page.evaluate(()=>window.journey.permissions.location),false);
  await page.getByRole('button',{name:'Reached toilet',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.journey.progress.checkpoint.nodeId),'toilet-b');
  await page.getByRole('button',{name:'Resume journey',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.journey.detour.status),'returning');
  assert.match(await page.locator('.facility-stop').innerText(),/Return to your onward checkpoint/);
  await page.getByRole('button',{name:'Station layout',exact:true}).click();
  await page.locator('[data-field="checkpoint"]').selectOption('platform');
  await page.getByRole('button',{name:'I am here',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.journey.detour.status),'resumed');
  assert.equal(await page.evaluate(()=>window.journey.status),'started');
  await page.evaluate(()=>{window.journey={...window.journey,id:'restored-shared-plan',detour:null,plan:{...window.journey.plan,origin:{...window.journey.plan.origin,stationId:'fixture-interchange'},stops:[{type:'toilet',facilityId:'fixture-toilet-b'}]},progress:{...window.journey.progress,checkpoint:null,confirmedAt:null}};window.facilities.refresh();});
  await page.locator('[data-planned="fixture-toilet-b"]').click();
  assert.equal(await page.locator('.facility-preview').count(),0);
  assert.match(await page.locator('.facility-message').innerText(),/Confirm a manual checkpoint first/);
  await page.getByRole('button',{name:'Station layout',exact:true}).click();
  await page.locator('[data-field="checkpoint"]').selectOption('platform');
  await page.getByRole('button',{name:'I am here',exact:true}).click();
  await page.locator('[data-planned="fixture-toilet-b"]').click();
  assert.match(await page.locator('.facility-preview').innerText(),/Toilet B/);
  assert.equal(await page.evaluate(()=>window.journey.detour),null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.deepEqual(errors,[]);
  if(process.env.FACILITY_CAPTURE){await page.setViewportSize({width:820,height:900});await page.getByRole('button',{name:'Station layout',exact:true}).click();await page.locator('[data-field="floor"]').selectOption('B1');await page.locator('.facility-diagram').screenshot({path:process.env.FACILITY_CAPTURE});}
  console.log('Facility mobile-emulation browser flow passed: unknown real data, explicit checkpoint, blocked closest toilet, independent alternative, accepted detour, reach/return/resume; original destination and consent preserved.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
