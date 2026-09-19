// Isolated UI integration: synthetic provider itinerary and neutral map tiles.
// Run against an already built server; no live provider or physical-device claim.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4197';
const out='test-results/route-map';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[],errors=[],consoleErrors=[],captures=[],states={};
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
const points={
  origin:{id:'onemap:1.305000,103.802000',sourceId:'onemap:1.305000,103.802000',label:'Synthetic public origin',address:'Synthetic public start address',lat:1.305,lng:103.802,routingId:null,stationId:null,entranceId:null,coverage:'unknown',accessibility:'unknown'},
  destination:{id:'onemap:1.307000,103.854000',sourceId:'onemap:1.307000,103.854000',label:'Synthetic public destination',address:'Synthetic public destination address',lat:1.307,lng:103.854,routingId:null,stationId:null,entranceId:null,coverage:'unknown',accessibility:'unknown'},
};
function encodePolyline(points){
  let previous=[0,0],encoded='';
  for(const point of points)for(let axis=0;axis<2;axis++){
    const current=Math.round(point[axis]*1e5),delta=current-previous[axis];previous[axis]=current;
    let value=delta<0?~(delta<<1):delta<<1;
    while(value>=32){encoded+=String.fromCharCode((32|(value&31))+63);value>>=5;}
    encoded+=String.fromCharCode(value+63);
  }
  return encoded;
}
function fixture(body){
  const start=Date.parse(`${body.date}T${body.departureTime}:00+08:00`);
  const leg=(mode,a,b,path,fromName,toName,route='')=>({mode,startTime:start+a*1000,endTime:start+b*1000,duration:b-a,distance:mode==='WALK'?300:2100,from:{name:fromName,lat:path[0][0],lng:path[0][1]},to:{name:toName,lat:path.at(-1)[0],lng:path.at(-1)[1]},route,headsign:'',geometry:encodePolyline(path)});
  return {provider:'onemap',status:'ok',retrievedAt:Date.now(),itineraries:[{startTime:start,endTime:start+2400000,walkTime:600,legs:[
    leg('WALK',0,300,[[1.305,103.802],[1.306,103.804],[1.305,103.806]],'Synthetic public start address','Example EW station'),
    leg('SUBWAY',420,900,[[1.305,103.806],[1.301,103.811],[1.298,103.817],[1.294,103.821]],'Example EW station','Example transfer stop','EWL'),
    leg('BUS',1020,1500,[[1.294,103.821],[1.291,103.825],[1.292,103.831],[1.286,103.841]],'Example transfer stop','Example DT station','23A'),
    leg('SUBWAY',1620,2100,[[1.286,103.841],[1.289,103.846],[1.295,103.847],[1.301,103.851]],'Example DT station','Example arrival station','DTL'),
    leg('WALK',2100,2400,[[1.301,103.851],[1.303,103.853],[1.307,103.854]],'Example arrival station','Synthetic public destination address'),
  ]}]};
}
const tile='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf0e8"/><path d="M0 64H256M0 192H256M64 0V256M192 0V256" stroke="#d8decf" stroke-width="20"/><path d="M0 64H256M0 192H256M64 0V256M192 0V256" stroke="#fff" stroke-width="10"/></svg>';
let context;
try{
  context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Singapore',serviceWorkers:'block'});
  await context.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:tile}));
  await context.route('**/api/address/search',route=>route.fulfill({json:{provider:'onemap',status:'ok',results:[route.request().postDataJSON().query.includes('origin')?points.origin:points.destination]}}));
  await context.route('**/api/address/route',route=>route.fulfill({json:fixture(route.request().postDataJSON())}));
  const page=await context.newPage();
  page.setDefaultTimeout(18000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  const ready=()=>page.locator('#find-routes:not([disabled])').waitFor();
  const active=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
  const nav=name=>page.locator(`.app-nav [data-view=${name}]`).click();
  const snapshot=()=>page.locator('#commute-map').evaluate(map=>({
    lines:[...map.querySelectorAll('.journey-route-line')].map(line=>({mode:line.classList.contains('mode-walk')?'walk':line.classList.contains('mode-bus')?'bus':'rail',color:line.getAttribute('stroke').toUpperCase(),dash:line.getAttribute('stroke-dasharray'),width:line.getAttribute('stroke-width'),cap:line.getAttribute('stroke-linecap')})),
    busDetails:[...map.querySelectorAll('.journey-bus-detail')].map(line=>({color:line.getAttribute('stroke').toUpperCase(),dash:line.getAttribute('stroke-dasharray')})),
    halos:map.querySelectorAll('.journey-route-halo').length,
    badges:[...map.querySelectorAll('.map-service-badge')].map(badge=>badge.textContent.trim()),
    stops:map.querySelectorAll('.journey-transfer-stop').length,
  }));
  async function styles(label){
    await page.waitForFunction(()=>document.querySelectorAll('#commute-map .journey-route-line').length===5);
    const value=await snapshot();states[label]=value;
    assert.deepEqual(value.lines.map(line=>line.mode),['walk','rail','bus','rail','walk']);
    check(`${label}: waits do not shift the geometry-to-mode association`,true);
    check(`${label}: walking is dotted gray with round caps`,value.lines.filter(line=>line.mode==='walk').every(line=>line.color==='#5F6368'&&line.dash==='1 9'&&line.cap==='round'));
    check(`${label}: trains are solid in East West and Downtown service colors`,value.lines[1].color==='#189E4A'&&!value.lines[1].dash&&value.lines[3].color==='#0354A6'&&!value.lines[3].dash);
    check(`${label}: buses retain a distinct blue line and white center pattern`,value.lines[2].color==='#1A73E8'&&!value.lines[2].dash&&value.busDetails.length===1&&value.busDetails[0].color==='#FFFFFF'&&value.busDetails[0].dash==='7 12');
    check(`${label}: all route segments have casings and transfer stops are marked`,value.halos===5&&value.stops===4);
    check(`${label}: map badges identify all transit services`,['EW','Bus 23A','DT'].every(label=>value.badges.includes(label)));
    check(`${label}: removed route legend and details stay absent`,!await page.locator('#map-caption').isVisible()&&await page.locator('#map-caption').innerText()===''&&await page.locator('#route-map-details,.map-route-legend,.map-route-key').count()===0);
    check(`${label}: provider attribution and approximate indoor guidance label remain on the map`,await page.locator('#commute-map .leaflet-control-attribution a[href="https://www.onemap.gov.sg/"]').innerText()==='OneMap / SLA'&&await page.locator('#commute-map').getAttribute('aria-label')==='Approximate journey map; indoor guidance unverified');
    return value;
  }
  async function capture(name){
    await page.waitForFunction(()=>[...document.querySelectorAll('#commute-map img.leaflet-tile')].every(tile=>tile.complete&&tile.naturalWidth>0));
    const path=`${out}/${name}.png`;await page.screenshot({path});captures.push(path);
  }
  await page.goto(base);await ready();
  for(const role of ['origin','destination']){
    await page.locator(`#${role}`).fill(`${role} synthetic map test`);
    await page.locator(`#${role}-address-search`).click();
    await page.locator(`#${role}-suggestions [data-address-index="0"]`).click();
  }
  await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();
  check('finding the mixed route leaves accepted guidance empty',await active()===null);
  const preview=await styles('preview');
  await page.locator('#journey-sheet-handle').press('End');
  check('mobile map stays clear without the removed route key and has no horizontal overflow',await page.locator('.map-route-legend').count()===0&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await capture('mixed-route-preview-mobile');
  await page.locator('#journey-sheet-handle').press('Escape');
  await page.locator('#review-route').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2'))?.status==='started');
  const accepted=await active();
  check('accepted route preserves all geometry with original step indices around waits',accepted.route.steps.length===8&&accepted.route.steps.filter(step=>step.type==='wait').length===3&&accepted.route.geometry.map(segment=>segment.stepIndex).join(',')==='0,2,4,6,7');
  await nav('current');
  assert.deepEqual(await styles('started'),preview);
  check('starting the journey preserves every preview map style',true);
  await page.locator('#journey-sheet-handle').press('End');
  await capture('mixed-route-started-mobile');
  await page.setViewportSize({width:1440,height:960});
  await page.waitForFunction(()=>document.querySelector('#journey-sheet-handle').hidden);
  await capture('mixed-route-started-desktop');
  await page.reload();await ready();await nav('current');
  assert.deepEqual(await styles('restored'),preview);
  check('reload restores the accepted geometry and the same map styles',JSON.stringify((await active()).route)===JSON.stringify(accepted.route));
  await capture('mixed-route-restored-desktop');
  check('browser reports no application exceptions or console errors',errors.length===0&&consoleErrors.length===0);
}finally{
  await writeFile(`${out}/results.json`,JSON.stringify({kind:'synthetic-browser-integration',checks,errors,consoleErrors,states,captures,physicalDevice:false,liveProvider:false,mapTiles:'neutral deterministic fixture'},null,2));
  await context?.close();await browser.close();
}
