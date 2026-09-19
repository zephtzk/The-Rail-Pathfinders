// Native range interaction drives the entire matrix. The separately labelled
// root-text case supplements it; it is not evidence of a physical browser setting.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {choosePlannerDate,choosePlannerTime} from './planner-browser-helpers.mjs';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4254';
const out=process.env.CAPTURE_DIR??'test-results/fr3-text-size';
const presentationKey='commute-copilot-presentation-v1';
const views=['plan','current','saved','facilities','caregiver','spending','preferences','staff'];
const sizes=[{name:'320',width:320,height:844},{name:'390',width:390,height:844},{name:'landscape',width:640,height:360},{name:'desktop',width:1440,height:960}];
const percentages=[80,100,140,200];
const checks=[],failures=[],errors=[],measurements=[],screenshots=[],contexts=[],browserFontPreferences=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
function check(name,ok,detail){
  if(ok)checks.push(name);
  else{failures.push({name,detail});console.error('FAIL '+name+' '+JSON.stringify(detail??''));}
}
async function scenario(name,run){
  if(process.env.FR3_TEXT_SIZE_SCENARIO&&!name.includes(process.env.FR3_TEXT_SIZE_SCENARIO))return;
  try{await run();console.log('CHECKED '+name);}
  catch(error){failures.push({name,error:error.stack??String(error)});console.error('FAIL '+name+'\n'+error.stack);}
}
async function setup({seed,blockedStorage=false,addressFixture=false}={}){
  const context=await browser.newContext({viewport:sizes[1],isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Singapore',serviceWorkers:'block'});
  contexts.push(context);
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  if(seed!==undefined)await context.addInitScript(({key,value})=>{
    // Seed once so reload tests exercise the application's persisted value.
    if(!sessionStorage.getItem('fr3-text-seeded')){localStorage.setItem(key,value);sessionStorage.setItem('fr3-text-seeded','yes');}
  },{key:presentationKey,value:seed});
  if(blockedStorage)await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage blocked','SecurityError');}}));
  if(addressFixture)await mockAddresses(context);
  const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await ready(page);
  return {context,page};
}
async function ready(page){await page.locator('#find-routes:not([disabled])').waitFor();}
const nav=(page,view)=>page.locator(`.app-nav [data-view="${view}"]`).click();
async function expand(page){const handle=page.locator('#journey-sheet-handle');if(await handle.isVisible())await handle.press('Home');}
async function settle(page){
  await page.waitForFunction(()=>Math.abs(parseFloat(document.body.style.getPropertyValue('--nav-height'))-document.querySelector('.app-nav').getBoundingClientRect().height)<1,{},{timeout:2500});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function setSize(page,percent){
  await nav(page,'preferences');const slider=page.locator('#text-size-slider');
  await slider.scrollIntoViewIfNeeded();await slider.focus();
  await slider.press(percent===200?'End':'Home');
  if(percent!==200)for(let value=80;value<percent;value+=10)await slider.press('ArrowRight');
  await page.waitForFunction(value=>document.querySelector('#text-size-slider').value===String(value),percent);
  check(`slider reports ${percent}% after native keyboard input`,(await page.locator('#text-size-value').innerText()).includes(String(percent)));
  check(`native ${percent}% setting scales the root text`,await page.locator('html').evaluate((e,value)=>Math.abs(parseFloat(getComputedStyle(e).fontSize)-16*value/100)<.05,percent));
  await settle(page);
}
async function capture(page,name,selector){
  if(selector)await page.locator(selector).first().evaluate(e=>e.scrollIntoView({block:'start'}));
  // Let transient application notices expire naturally; screenshots retain the UI.
  await page.locator('#app-message.is-visible').waitFor({state:'detached'});
  const path=`${out}/${name}.png`;await page.screenshot({path,animations:'disabled'});screenshots.push(path);
}
async function openDisclosures(page,view){
  const selectors={plan:['.review-details','#route-plan-details'],current:['.guidance-more-actions','#trip-details','#station-tools'],facilities:['#nearby-manual','.nf-coverage'],spending:['#spending-companion details'],caregiver:['#caregiver-companion details']}[view]??[];
  for(const selector of selectors){
    const disclosure=page.locator(selector).first();
    if(await disclosure.isVisible()&&await disclosure.getAttribute('open')===null)await disclosure.locator(':scope > summary').click();
  }
}
async function measure(page,label,view){
  await settle(page);
  const result=await page.evaluate(()=>{
    const content=document.querySelector('.panel-scroll');
    // Short landscape deliberately gives the whole panel a single scrollport,
    // so its map tabs can scroll away with the content.
    const panel=/^(auto|scroll)$/.test(getComputedStyle(content).overflowY)?content:content.closest('.app-panel'),p=panel.getBoundingClientRect();
    const nav=document.querySelector('.app-nav'),n=nav.getBoundingClientRect();
    const active=document.querySelector('.view:not([hidden])');
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const name=e=>e.id?'#'+e.id:e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\s+/).join('.'):'');
    const navButtons=[...nav.querySelectorAll('button')].map(e=>{
      const r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e.querySelector('span'));
      return {view:e.dataset.view,...rect(e),labelFits:[...range.getClientRects()].every(t=>t.left>=r.left-1&&t.right<=r.right+1&&t.top>=r.top-1&&t.bottom<=r.bottom+1),reachable:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
    });
    const overflow=[...active.querySelectorAll('*')].filter(e=>{
      // Native editable fields scroll their own text. Leaflet intentionally owns
      // off-screen world surfaces. Neither is an application reflow failure.
      if(!(e instanceof HTMLElement)||!e.checkVisibility()||e.closest('.leaflet-container')||e.matches('input,select,textarea,.sr-only,.location-sr-only'))return false;
      const css=getComputedStyle(e),r=e.getBoundingClientRect();
      return r.width>0&&css.display!=='inline'&&(e.scrollWidth>e.clientWidth+2||r.left<p.left-2||r.right>p.right+2);
    }).slice(0,15).map(e=>({selector:name(e),width:e.clientWidth,scrollWidth:e.scrollWidth,...rect(e),text:e.innerText?.slice(0,100)}));
    const cards=[...active.querySelectorAll('.route-card,.saved-route-card,.style-card,.staff-assistance-card,[data-instruction-card]')].filter(e=>e.checkVisibility()).map(e=>({selector:name(e),width:e.clientWidth,scrollWidth:e.scrollWidth,...rect(e)}));
    const dismissalOverlaps=[...active.querySelectorAll('[data-instruction-card]')].filter(e=>e.checkVisibility()).flatMap(e=>{
      const button=e.querySelector('[data-dismiss-instruction]'),heading=e.querySelector('h2,h3,strong');if(!button||!heading)return [];
      const b=button.getBoundingClientRect(),h=heading.getBoundingClientRect();
      return b.width<44||b.height<44||(Math.min(b.right,h.right)-Math.max(b.left,h.left)>1&&Math.min(b.bottom,h.bottom)-Math.max(b.top,h.top)>1)?[{card:name(e),button:rect(button),heading:rect(heading)}]:[];
    });
    const map=document.querySelector('#commute-map');
    return {view:active.id,rootFont:getComputedStyle(document.documentElement).fontSize,bodyFont:getComputedStyle(document.body).fontSize,documentWidth:document.documentElement.scrollWidth,viewport:{width:innerWidth,height:innerHeight},panel:{selector:name(panel),...rect(panel),clientHeight:panel.clientHeight,scrollHeight:panel.scrollHeight,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth},nav:{...rect(nav),cssHeight:parseFloat(document.body.style.getPropertyValue('--nav-height'))},navButtons,overflow,cards,dismissalOverlaps,map:rect(map)};
  });
  measurements.push({label,...result});
  check(`${label}: the requested view is rendered`,result.view===`view-${view}`,result.view);
  check(`${label}: document, panel and card content reflow horizontally`,result.documentWidth<=result.viewport.width+1&&result.panel.scrollWidth<=result.panel.clientWidth+2&&result.overflow.length===0,result.overflow.length?result.overflow:result);
  check(`${label}: content stays scrollable above navigation`,result.panel.clientHeight>0&&result.panel.scrollHeight>=result.panel.clientHeight&&result.panel.bottom<=result.nav.y+1,result.panel);
  check(`${label}: instruction dismissal controls do not cover card headings`,result.dismissalOverlaps.length===0,result.dismissalOverlaps);
  check(`${label}: all eight labelled navigation targets remain reachable`,result.navButtons.length===8&&result.navButtons.every(b=>b.width>=44&&b.height>=44&&b.x>=-1&&b.right<=result.viewport.width+1&&b.y>=-1&&b.bottom<=result.viewport.height+1&&b.labelFits&&b.reachable),result.navButtons);
  check(`${label}: panel and navigation measurements update promptly`,Math.abs(result.nav.cssHeight-result.nav.height)<1&&(!['plan','current'].includes(view)||(result.map.width>0&&result.map.height>0)),{nav:result.nav,map:result.map});
  return result;
}
async function reachable(page,selector,label){
  const control=page.locator(selector).first();if(!await control.isVisible())return;
  await control.scrollIntoViewIfNeeded();await control.focus();
  const result=await control.evaluate(e=>{
    const r=e.getBoundingClientRect(),main=e.closest('.app-panel'),content=document.querySelector('.panel-scroll');
    const scroller=/^(auto|scroll)$/.test(getComputedStyle(content).overflowY)?content:main;
    const p=scroller?.getBoundingClientRect(),shortPanel=!!main&&innerWidth<=680&&innerHeight<=540;
    return {focused:document.activeElement===e,width:r.width,height:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),top:r.top,bottom:r.bottom,shortPanel,fullActionVisible:!shortPanel||r.top>=p.top-1&&r.bottom<=p.bottom+1,headerScrolls:!shortPanel||document.querySelector('.journey-sheet-header').getBoundingClientRect().bottom<=p.top+1};
  });
  check(`${label}: ${selector} can be reached and focused`,result.focused&&result.hit&&result.width>=44&&result.height>=44,result);
  if(result.shortPanel)check(`${label}: the whole action fits in the landscape scrollport`,result.fullActionVisible,result);
  if(result.shortPanel&&selector==='#journey-cancel')check(`${label}: landscape map tabs scroll away to preserve reading space`,result.headerScrolls,result);
}
async function popover(page,label){
  await page.locator('#location-toggle').click();const pop=page.locator('#location-popover');await pop.waitFor();
  const bounds=await pop.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,client:e.clientWidth,scroll:e.scrollWidth};});
  check(`${label}: location popover reflows inside the viewport`,bounds.left>=0&&bounds.right<=bounds.width+1&&bounds.top>=0&&bounds.bottom<=bounds.height+1&&bounds.scroll<=bounds.client+1,bounds);
  await reachable(page,'#location-popover-enable',label);
  if(label==='active 320 200%')await capture(page,'location-320-200');
  await page.keyboard.press('Escape');
  check(`${label}: Escape closes location details and restores focus`,!await pop.isVisible()&&await page.locator('#location-toggle').evaluate(e=>document.activeElement===e));
}
async function selectStation(page,role,query){await page.locator('#'+role).fill(query);await page.locator(`#${role}-suggestions [data-index="0"]`).click();}
async function plan(page,{addresses=false}={}){
  await nav(page,'plan');
  for(const role of ['origin','destination']){
    if(addresses){await page.locator('#'+role).fill(role+' public long address');await page.locator(`#${role}-address-search`).click();await page.locator(`#${role}-suggestions [data-address-index="0"]`).click();}
    else await selectStation(page,role,role==='origin'?'EW8':'EW12');
  }
  await page.locator('[data-time="depart-later"]').click();
  await choosePlannerDate(page,'date','2026-09-21');await choosePlannerTime(page,'departureTime','10:00');
  await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();await expand(page);
  check(`${addresses?'address':'EW8 to EW12'} plan remains a preview until Start journey`,await page.evaluate(()=>localStorage.getItem('commute-copilot-journey-v2')===null));
  await page.locator('#save-route').click();await page.locator('#save-route-form [name=label]').fill('Public community centre entrance and interchange assistance meeting point');
  await page.locator('#save-route-form button').click();
}
async function matrix(page,phase){
  for(const size of sizes){
    await page.setViewportSize({width:size.width,height:size.height});
    for(const percent of percentages){
      await setSize(page,percent);
      for(const view of views){
        await nav(page,view);await expand(page);await openDisclosures(page,view);
        const label=`${phase} ${size.name} ${percent}% ${view}`;
        await measure(page,label,view);
        const controls={plan:'#review-route',current:'#journey-cancel',saved:'.saved-route-card [data-open]',facilities:'#nearby-refresh',preferences:'#text-size-reset',staff:'.staff-request-picker select'};
        if(controls[view])await reachable(page,controls[view],label);
        if((size.name==='320'&&percent===200&&['plan','current','preferences','staff'].includes(view))||(size.name==='390'&&percent===100&&view==='preferences')||(size.name==='landscape'&&percent===200&&view==='current')||(size.name==='desktop'&&percent===100&&view==='plan'))await capture(page,`${phase}-${view}-${size.name}-${percent}`,view==='current'?(phase==='active'&&size.name==='landscape'?'#journey-pause':'#current-summary h2'):view==='plan'?'.route-card':view==='preferences'?'.text-size-setting':undefined);
      }
      if(percent===80||percent===200)await popover(page,`${phase} ${size.name} ${percent}%`);
    }
  }
}
async function mockAddresses(context){
  const points={origin:{id:'onemap:1.300000,103.800000',label:'Synthetic public community centre accessible entrance beside the long covered pedestrian walkway, 123 Example Avenue Singapore 123456',lat:1.3,lng:103.8},destination:{id:'onemap:1.321000,103.800000',label:'Synthetic public neighbourhood interchange visitor assistance reception at the sheltered east entrance, 987 Example Crescent Singapore 654321',lat:1.321,lng:103.8}};
  for(const point of Object.values(points))Object.assign(point,{sourceId:point.id,address:point.label,routingId:null,stationId:null,entranceId:null,coverage:'unknown',accessibility:'unknown'});
  await context.route('**/api/address/search',route=>route.fulfill({json:{provider:'onemap',status:'ok',results:[route.request().postDataJSON().query.includes('origin')?points.origin:points.destination]}}));
  await context.route('**/api/address/route',route=>{
    const body=route.request().postDataJSON(),start=Date.parse(`${body.date}T${body.departureTime}:00+08:00`);
    const p=point=>({name:point.label,lat:point.lat,lng:point.lng});
    return route.fulfill({json:{provider:'onemap',status:'ok',retrievedAt:Date.now(),itineraries:[{startTime:start,endTime:start+1500000,walkTime:300,legs:[{mode:'WALK',startTime:start,endTime:start+300000,duration:300,distance:300,from:p(points.origin),to:{name:'Synthetic long covered walkway bus boarding area',lat:1.301,lng:103.8},route:'',headsign:'',geometry:null},{mode:'BUS',startTime:start+420000,endTime:start+1500000,duration:1080,distance:3000,from:{name:'Synthetic long covered walkway bus boarding area',lat:1.301,lng:103.8},to:p(points.destination),route:'23A',headsign:'Synthetic public neighbourhood interchange',geometry:null}]}]}});
  });
}

try{
  await scenario('native slider, migration, persistence and independent preferences',async()=>{
    const {context,page}=await setup({seed:JSON.stringify({schemaVersion:1,simpleGuidance:false})});await nav(page,'preferences');
    const slider=page.locator('#text-size-slider');
    check('legacy presentation keeps guidance choice and defaults text to 100%',await slider.inputValue()==='100'&&!await page.locator('#simple-guidance-toggle').isChecked());
    check('text-size input is a labelled native range with the documented interval',await slider.evaluate(e=>e.type==='range'&&e.min==='80'&&e.max==='200'&&e.step==='10'&&e.labels.length>0));
    await page.locator('#preferences-form [name=walkingLimitMinutes]').fill('20');
    await page.locator('#preferences-form [name=preference]').selectOption('fewer-transfers');
    await page.locator('#preferences-form').getByRole('button',{name:'Save preferences',exact:true}).click();
    const routeBefore=await page.evaluate(()=>localStorage.getItem('commute-copilot-preferences-v1'));
    await setSize(page,140);const selectedFont=await page.locator('html').evaluate(e=>getComputedStyle(e).fontSize);
    await slider.press('ArrowLeft');check('Left arrow reduces the value by one increment',await slider.inputValue()==='130');await slider.press('ArrowRight');
    await slider.press('Tab');check('keyboard can leave the slider',await slider.evaluate(e=>document.activeElement!==e));
    await page.reload();await ready(page);await nav(page,'preferences');
    check('slider value, text scaling and guidance preference survive reload',await slider.inputValue()==='140'&&!await page.locator('#simple-guidance-toggle').isChecked()&&await page.locator('html').evaluate(e=>getComputedStyle(e).fontSize)===selectedFont);
    await page.locator('#simple-guidance-toggle').check();
    check('changing simple guidance preserves text size',await slider.inputValue()==='140');
    const beforeClass=await page.evaluate(()=>({root:getComputedStyle(document.documentElement).fontSize,body:getComputedStyle(document.body).fontSize,nav:getComputedStyle(document.querySelector('.app-nav [data-view=current]')).fontSize}));
    await page.evaluate(()=>{document.body.classList.add('large-text');document.body.dataset.largeText='true';});
    check('legacy large-text selectors cannot override the slider',JSON.stringify(await page.evaluate(()=>({root:getComputedStyle(document.documentElement).fontSize,body:getComputedStyle(document.body).fontSize,nav:getComputedStyle(document.querySelector('.app-nav [data-view=current]')).fontSize})))===JSON.stringify(beforeClass));
    await page.evaluate(()=>{document.body.classList.remove('large-text');delete document.body.dataset.largeText;});
    await page.locator('#text-size-reset').focus();await page.locator('#text-size-reset').press('Enter');
    check('Reset restores only text size to 100%',await slider.inputValue()==='100'&&await page.locator('#simple-guidance-toggle').isChecked()&&await page.evaluate(()=>localStorage.getItem('commute-copilot-preferences-v1'))===routeBefore);
    await page.reload();await ready(page);await nav(page,'preferences');check('Reset persists across reload',await slider.inputValue()==='100');await context.close();
  });
  await scenario('all views, viewports and slider values with planned and active rail journeys',async()=>{
    const {context,page}=await setup();await plan(page);await matrix(page,'planned');
    await page.setViewportSize({width:390,height:844});await setSize(page,100);await nav(page,'plan');await page.locator('#review-route').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2'))?.status==='started');
    const activeBefore=await page.evaluate(()=>localStorage.getItem('commute-copilot-journey-v2'));
    await matrix(page,'active');
    check('display-only size changes preserve the accepted journey',await page.evaluate(()=>localStorage.getItem('commute-copilot-journey-v2'))===activeBefore);
    await page.setViewportSize({width:320,height:844});await setSize(page,100);
    // Chromium has no general CDP default-font-size setting. This supplemental
    // explicit root override represents browser-enlarged text, not slider input.
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    for(const view of ['preferences','plan','current','staff']){await nav(page,view);await expand(page);await openDisclosures(page,view);await measure(page,`browser-text-emulation 320 200% ${view}`,view);}
    await popover(page,'browser-text-emulation 320 200%');await nav(page,'current');await expand(page);await capture(page,'browser-text-emulation-current-320-200','#current-summary');
    await page.evaluate(()=>document.documentElement.style.fontSize='');await context.close();
  });
  await scenario('long public addresses, expanded details and saved cards',async()=>{
    const {context,page}=await setup({addressFixture:true});await plan(page,{addresses:true});
    for(const phase of ['planned','active']){
      if(phase==='active'){await nav(page,'plan');await page.locator('#review-route').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2'))?.status==='started');}
      for(const size of [sizes[0],sizes[2]]){
        await page.setViewportSize({width:size.width,height:size.height});await setSize(page,200);
        for(const view of ['plan','current','saved','staff']){await nav(page,view);await expand(page);await openDisclosures(page,view);await measure(page,`long-address ${phase} ${size.name} 200% ${view}`,view);}
      }
      await page.setViewportSize({width:320,height:844});await nav(page,phase==='planned'?'saved':'current');await expand(page);await capture(page,`long-address-${phase}-320-200`,phase==='planned'?'.saved-route-card':'#current-summary');
    }
    await context.close();
  });
  await scenario('station guide remains readable in short landscape and after rotation',async()=>{
    const {context,page}=await setup();await plan(page);await page.locator('#review-route').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2'))?.status==='started');
    await page.setViewportSize({width:640,height:360});await setSize(page,200);await nav(page,'current');await expand(page);
    await page.getByRole('tab',{name:'Station guide',exact:true}).click();
    const guide=page.locator('#map-station-page');
    await page.waitForFunction(()=>document.querySelector('#main').contains(document.querySelector('#map-station-page')));
    check('short landscape station guide shares the full panel scrollport',await guide.isVisible()&&await guide.evaluate(e=>e.closest('#main')?.classList.contains('inline-station-guide')));
    const summary=page.locator('#map-station-page .station-coverage-details > summary');await summary.click();
    await reachable(page,'#map-station-page .station-coverage-details > summary','station guide landscape 200%');
    check('expanded station facts wrap without horizontal clipping',await guide.evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1));
    const geometry=await page.evaluate(()=>{const p=document.querySelector('#main').getBoundingClientRect(),n=document.querySelector('.app-nav').getBoundingClientRect();return {panelHeight:p.height,panelBottom:p.bottom,navTop:n.top,scrollHeight:document.querySelector('#main').scrollHeight};});
    check('station guide has a reading area and remains above navigation',geometry.panelHeight>=100&&geometry.panelBottom<=geometry.navTop+1&&geometry.scrollHeight>geometry.panelHeight,geometry);
    await capture(page,'station-guide-landscape-200','#map-station-page .station-coverage-details > summary');
    for(const viewport of [{width:390,height:844},{width:1440,height:960}]){
      await page.setViewportSize(viewport);
      await page.waitForFunction(()=>document.querySelector('#map-pages').contains(document.querySelector('#map-station-page')));
      check(`${viewport.width}px rotation restores the station map surface`,await guide.isVisible()&&await guide.evaluate(e=>!e.closest('#main')&&e.clientHeight>0&&e.scrollWidth<=e.clientWidth+1));
      await page.getByRole('tab',{name:'Map',exact:true}).focus();await page.getByRole('tab',{name:'Map',exact:true}).press('Enter');
      check(`${viewport.width}px Map tab remains keyboard-operable after rotation`,await page.locator('#commute-map').isVisible()&&!await guide.isVisible());
      await page.getByRole('tab',{name:'Station guide',exact:true}).click();
    }
    await page.setViewportSize({width:640,height:360});
    await page.waitForFunction(()=>document.querySelector('#main').contains(document.querySelector('#map-station-page')));
    await nav(page,'preferences');await nav(page,'current');await expand(page);
    check('leaving the inline station guide restores current trip and map access',await page.locator('#current-summary').isVisible()&&await page.locator('#commute-map').isVisible()&&!await guide.isVisible());
    await page.setViewportSize({width:390,height:844});await nav(page,'current');await expand(page);
    await page.getByRole('tab',{name:'Station guide',exact:true}).click();
    check('portrait station guide is selected before the utility-tab rotation regression',await guide.isVisible()&&await page.getByRole('tab',{name:'Station guide',exact:true}).getAttribute('aria-selected')==='true');
    await nav(page,'preferences');await page.setViewportSize({width:640,height:360});await settle(page);
    check('portrait Station guide to Settings then landscape keeps Settings visible',await page.locator('.app-nav [data-view="preferences"]').getAttribute('aria-current')==='page'&&await page.locator('#view-preferences').isVisible()&&await page.locator('#text-size-slider').isVisible()&&!await guide.isVisible()&&await page.locator('#main').evaluate(e=>!e.classList.contains('inline-station-guide')));
    await context.close();
  });
  await scenario('browser font preference scales the native slider and all views',async()=>{
    // A fresh, disposable Edge profile exercises its real default-font setting;
    // no application stylesheet or document font-size override is injected.
    const profileDir=await mkdtemp(`${out}/edge-font-profile-`);
    const profilePreferences={webkit:{webprefs:{default_font_size:32,default_fixed_font_size:26}}};
    await mkdir(`${profileDir}/Default`,{recursive:true});
    await writeFile(`${profileDir}/Default/Preferences`,JSON.stringify(profilePreferences));
    const context=await chromium.launchPersistentContext(profileDir,{headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',viewport:{width:320,height:844},reducedMotion:'reduce',timezoneId:'Asia/Singapore',serviceWorkers:'block'});
    contexts.push(context);await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
    const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await ready(page);await nav(page,'preferences');
    const slider=page.locator('#text-size-slider');
    const fonts=()=>page.evaluate(()=>({root:parseFloat(getComputedStyle(document.documentElement).fontSize),body:parseFloat(getComputedStyle(document.body).fontSize),inlineRootFont:document.documentElement.style.fontSize}));
    const initial=await fonts();
    check('actual Edge 32px default font applies at slider 100% without injected CSS',await slider.inputValue()==='100'&&initial.root===32&&initial.body===32&&initial.inlineRootFont==='',initial);
    await slider.scrollIntoViewIfNeeded();await slider.focus();await slider.press('Home');await settle(page);
    const minimum=await fonts();
    check('native Home scales actual 32px browser font to 25.6px at 80%',await slider.inputValue()==='80'&&Math.abs(minimum.root-25.6)<.01&&Math.abs(minimum.body-25.6)<.01,minimum);
    await page.locator('#text-size-reset').focus();await page.locator('#text-size-reset').press('Enter');await settle(page);
    const reset=await fonts();
    check('Reset returns to the enlarged browser baseline of 32px',await slider.inputValue()==='100'&&reset.root===32&&reset.body===32,reset);
    browserFontPreferences.push({profileDir,profilePreferences,viewport:{width:320,height:844},initial,minimum,reset});
    for(const view of views){await nav(page,view);await expand(page);await openDisclosures(page,view);await measure(page,`actual-browser-font 32px 320 100% ${view}`,view);}
    await nav(page,'preferences');await capture(page,'actual-browser-font-settings-320-100','.text-size-setting');
    await context.close();
  });
  await scenario('corrupt presentation data recovers without affecting routing',async()=>{
    const {context,page}=await setup({seed:'{broken-json'});await nav(page,'preferences');
    check('corrupt presentation data renders the default slider',await page.locator('#text-size-slider').inputValue()==='100');
    await setSize(page,140);await page.reload();await ready(page);await nav(page,'preferences');
    check('an explicit valid text size repairs corrupted presentation data',await page.locator('#text-size-slider').inputValue()==='140');await context.close();
  });
  await scenario('blocked browser storage remains usable',async()=>{
    const {context,page}=await setup({blockedStorage:true});await nav(page,'preferences');
    check('blocked storage renders a usable default slider',await page.locator('#text-size-slider').inputValue()==='100');
    await setSize(page,140);await nav(page,'plan');await nav(page,'preferences');
    check('blocked storage retains the explicit text size in this session',await page.locator('#text-size-slider').inputValue()==='140');
    await page.locator('#text-size-reset').click();check('Reset works when storage is blocked',await page.locator('#text-size-slider').inputValue()==='100');await context.close();
  });
  check('no uncaught application exceptions',errors.length===0,errors);
}finally{
  await writeFile(`${out}/results.json`,JSON.stringify({base,passed:checks.length,checks,failures,errors,measurements,screenshots,browserFontPreferences,environment:'Installed Microsoft Edge, headless Playwright with CSS viewport and mobile/touch emulation. Full matrix uses keyboard-operated native range controls. Supplemental 200% root-text override is explicitly browser-text emulation. The separate browser-font-preference scenario uses an actual fresh Edge profile with a 32px default font and no injected font CSS. Rail plan uses EW8 to EW12 on 2026-09-21 10:00 SGT; long-address provider data are labelled synthetic. Street tiles blocked. No physical-device, live-provider or OS text scaling claim.'},null,2)+'\n');
  for(const context of contexts)await context.close().catch(()=>{});await browser.close();
}
console.log(`${checks.length} checks passed; ${failures.length} failures; ${measurements.length} rendered layout measurements.`);
assert.equal(failures.length,0,'all FR3 text-size browser checks pass (see test-results/fr3-text-size/results.json)');
