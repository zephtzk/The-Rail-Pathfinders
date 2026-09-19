// Computed-style QA in an isolated browser. Provider responses and tiles are
// deterministic fixtures; this does not claim live-provider or device testing.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4217';
const out='test-results/train-service-colours';
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
    leg('WALK',0,300,[[1.305,103.802],[1.305,103.806]],'Synthetic public start address','Example EW station'),
    leg('SUBWAY',420,900,[[1.305,103.806],[1.294,103.821]],'Example EW station','Example Circle station','EWL'),
    leg('SUBWAY',960,1380,[[1.294,103.821],[1.292,103.831]],'Example Circle station','Example transfer stop','CCL'),
    leg('BUS',1440,1800,[[1.292,103.831],[1.301,103.851]],'Example transfer stop','Example arrival stop','23A'),
    leg('WALK',2100,2400,[[1.301,103.851],[1.307,103.854]],'Example arrival stop','Synthetic public destination address'),
  ]}]};
}
const tile='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf0e8"/><path d="M0 64H256M0 192H256M64 0V256M192 0V256" stroke="#fff" stroke-width="10"/></svg>';
function inspectStyles(root){
  const luminance=colour=>colour.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  return [...root.querySelectorAll('.rail-service-fill')].map(node=>{
    const style=getComputedStyle(node),svg=node.querySelector('svg'),icon=svg?getComputedStyle(svg):null;
    const a=luminance(style.backgroundColor),b=luminance(style.color);
    return {text:node.textContent.trim(),className:node.className,background:style.backgroundColor,foreground:style.color,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),iconColor:icon?.color,iconStroke:icon?.stroke,fillVariable:style.getPropertyValue('--service-fill').trim()};
  });
}
let context;
try{
  context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Singapore',serviceWorkers:'block'});
  await context.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:tile}));
  await context.route('**/api/address/search',route=>route.fulfill({json:{provider:'onemap',status:'ok',results:[route.request().postDataJSON().query.includes('origin')?points.origin:points.destination]}}));
  await context.route('**/api/address/route',route=>route.fulfill({json:fixture(route.request().postDataJSON())}));
  const page=await context.newPage();page.setDefaultTimeout(25000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  const ready=()=>page.locator('#find-routes:not([disabled])').waitFor();
  const capture=async(name,fullPage=false)=>{const path=`${out}/${name}.png`;await page.screenshot({path,fullPage});captures.push(path);};
  const styles=async(selector,label)=>{
    const value=await page.locator(selector).evaluate(inspectStyles);states[label]=value;
    check(`${label}: each train badge or marker meets 4.5:1 contrast`,value.length>0&&value.every(s=>s.contrast>=4.5));
    check(`${label}: train SVG strokes use the readable badge foreground`,value.every(s=>!s.iconColor||(s.iconColor===s.foreground&&s.iconStroke===s.foreground)));
    return value;
  };
  await page.goto(base);await ready();
  for(const role of ['origin','destination']){
    await page.locator(`#${role}`).fill(`${role} synthetic service-colour test`);
    await page.locator(`#${role}-address-search`).click();await page.locator(`#${role}-suggestions [data-address-index="0"]`).click();
  }
  await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();
  const summary=await styles('#route-results','mobile route summary');
  check('summary train fills use East West green and Circle yellow',summary.filter(s=>s.className.includes('line-pill')).map(s=>s.fillVariable.toUpperCase()).join(',')==='#189E4A,#F2AD27');
  check('bus summary keeps its distinct neutral style and bus icon',await page.locator('.line-pill').filter({hasText:'Bus 23A'}).evaluate(node=>!node.classList.contains('rail-service-fill')&&!!node.querySelector('.icon-bus')));
  await page.locator('.route-card').scrollIntoViewIfNeeded();await capture('route-summary-mobile');
  await page.locator('#route-results > .review-details > summary').click();
  await styles('#route-results .transit-timeline','mobile route timeline');
  check('walking and bus markers do not inherit rail fill',await page.locator('#route-results .timeline-leg').evaluateAll(nodes=>nodes.filter(node=>node.classList.contains('timeline-walk')||node.querySelector('.icon-bus')).every(node=>!node.querySelector('.timeline-marker.rail-service-fill'))));
  await page.locator('#route-results .timeline-ride').first().scrollIntoViewIfNeeded();await capture('route-instructions-mobile');
  await page.locator('#review-route').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2'))?.status==='started');
  await page.locator('.app-nav [data-view=current]').click();
  await page.locator('#trip-details > summary').click();
  await styles('#trip-details .transit-timeline','current trip instructions');
  await page.setViewportSize({width:1440,height:960});
  await page.locator('#trip-details .transit-timeline').scrollIntoViewIfNeeded();await capture('current-instructions-desktop');
  await page.reload();await ready();await page.locator('.app-nav [data-view=current]').click();
  await page.locator('#trip-details > summary').click();
  await styles('#trip-details .transit-timeline','restored instructions');

  // Exercise every imported service ID in the real shared timeline renderer.
  // The isolated palette stage uses the application's loaded styles, with only
  // layout bounds added so all nine public lines can be inspected together.
  const palette=await page.evaluate(async()=>{
    const [{renderItineraryTimeline},{routes}]=await Promise.all([import('/src/itinerary-display.js'),fetch('/data/rail-network.json').then(r=>r.json())]);
    const all={legs:routes.map((route,i)=>({type:'ride',mode:'rail',routeId:route.id,fromLabel:'Example boarding station',toLabel:'Example arrival station',startSeconds:36000+i*300,endSeconds:36300+i*300,durationSeconds:300}))};
    const holder=document.createElement('section');holder.id='service-colour-qa';
    holder.innerHTML='<h1>Train service colours</h1><p>All imported service IDs · illustrative instructions</p>'+renderItineraryTimeline(all,{currentStepIndex:0});
    const styles=document.createElement('style');styles.textContent='body.commute-app{height:auto;min-height:100vh;overflow:auto;background:#f5f7fb}#service-colour-qa{max-width:1020px;margin:0 auto;padding:24px;color:#243e50;background:white}#service-colour-qa h1{font-size:24px;margin:0 0 8px}#service-colour-qa>p{margin:0 0 22px;color:#526472}#service-colour-qa .transit-timeline{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 28px}#service-colour-qa .timeline-leg{padding:12px 0;break-inside:avoid}#service-colour-qa .timeline-leg::after{display:none}@media(max-width:600px){#service-colour-qa{padding:20px 18px}#service-colour-qa .transit-timeline{display:block}#service-colour-qa .timeline-leg{padding:10px 0}}';
    document.head.append(styles);document.body.replaceChildren(holder);
    return routes.map(route=>({id:route.id,name:route.name,color:'#'+route.color}));
  });
  const fullPalette=await styles('#service-colour-qa','all imported service variants');
  check('every imported service has matching filled marker and label',palette.length===19&&fullPalette.length===palette.length*2&&palette.every((route,i)=>fullPalette[2*i].fillVariable.toUpperCase()===route.color.toUpperCase()&&fullPalette[2*i+1].fillVariable.toUpperCase()===route.color.toUpperCase()));
  check('current rail marker retains an explicit focus outline',await page.locator('#service-colour-qa .timeline-leg.is-current .timeline-marker').evaluate(node=>{const s=getComputedStyle(node);return parseFloat(s.outlineWidth)>=3&&s.outlineStyle==='solid';}));
  states.importedServices=palette;
  await page.evaluate(()=>{
    const seen=new Set();
    for(const node of document.querySelectorAll('#service-colour-qa .timeline-leg')){
      const name=node.querySelector('.transit-badge').textContent;
      if(seen.has(name))node.remove();else seen.add(name);
    }
    document.querySelector('#service-colour-qa>p').textContent='Nine public MRT/LRT lines · illustrative instructions';
  });
  check('all nine public lines are present for visual review',await page.locator('#service-colour-qa .timeline-leg').count()===9);
  await capture('all-train-lines-desktop',true);
  await page.setViewportSize({width:390,height:844});
  await styles('#service-colour-qa','mobile all public lines');
  check('mobile palette fits without horizontal scrolling',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await capture('all-train-lines-mobile',true);
  check('no browser application exceptions or console errors',errors.length===0&&consoleErrors.length===0);
}finally{
  await writeFile(`${out}/results.json`,JSON.stringify({kind:'synthetic-browser-integration',checks,errors,consoleErrors,states,captures,physicalDevice:false,liveProvider:false},null,2));
  await context?.close();await browser.close();
}
