// Real pointer/touch and keyboard checks in an isolated browser; no physical-phone claim.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4196',out='test-results/r5-journey-sheet';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),checks=[],errors=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Singapore',serviceWorkers:'block'});
 await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
 const page=await context.newPage(),cdp=await context.newCDPSession(page);page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const handle=page.locator('#journey-sheet-handle'),panel=page.locator('#main'),content=page.locator('#journey-panel-content');
 const state=()=>panel.getAttribute('data-sheet-state'),top=async()=>Math.round((await panel.boundingBox()).y);
 const nav=name=>page.locator(`.app-nav [data-view=${name}]`).click();
 const ready=()=>page.locator('#find-routes:not([disabled])').waitFor();
 async function touchDrag(dy,{dx=0,cancel=false}={}){
  const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let step=1;step<=5;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*step/5,y:y+dy*step/5}]});
  await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
 }
 async function capture(name){await page.screenshot({path:`${out}/${name}.png`});}
 await page.goto(base);await ready();
 // Keep the full-guidance trip peek present so its compact-sheet suppression is tested.
 await nav('preferences');await page.locator('#simple-guidance-toggle').uncheck();await nav('plan');
 await page.evaluate(async()=>{
  const m=await import('/src/journey-v2.js');
  const p=m.makePlan({origin:{id:'DT14_A',label:'Bugis'},destination:{id:'DT15_A',label:'Promenade'},date:'2026-09-21',departureTime:'10:00',preferences:{stepFree:false},route:{id:'sheet-test',departureSeconds:36000,arrivalSeconds:36600,walkingSeconds:60,steps:[{id:'access',type:'access',text:'Follow station signs at Bugis',fromStopId:'DT14_A',toStopId:'DT14_A',durationSeconds:60},{id:'ride',type:'ride',text:'Ride to Promenade',fromStopId:'DT14_A',toStopId:'DT15_A',durationSeconds:540}]}});
  if(!m.saveActive(localStorage,m.startJourney(p)))throw Error('Could not save fixture journey');
 });
 await page.reload();await ready();await nav('current');
 const accepted=await page.evaluate(()=>localStorage.getItem('commute-copilot-journey-v2')),normal=await top();
 check('mobile sheet starts at normal height with a 44px handle',await state()==='normal'&&(await handle.boundingBox()).height>=44&&normal>=245);
 check('horizontal grabber sits above map tabs without a visible text tab',await page.locator('.guidance-page-strip').evaluate(e=>{const r=e.getBoundingClientRect(),p=document.querySelector('#main').getBoundingClientRect(),h=document.querySelector('#journey-sheet-handle').getBoundingClientRect(),tabs=[...e.querySelectorAll('button')].map(b=>b.getBoundingClientRect());return e.closest('.journey-sheet-header')&&r.top>=p.top&&r.bottom<=p.top+97&&r.top>=h.bottom&&r.height<=60&&document.querySelector('#journey-sheet-handle span').classList.contains('sr-only')&&tabs[0].top===tabs[1].top&&tabs.every(t=>t.height>=44);})&&await page.locator('.map-page-swipe-hint').count()===0);
 await handle.click();check('tap expands sheet below the header',await state()==='expanded'&&await top()<normal&&await top()>=76);
 check('docked tabs stay visible while covered map controls become inert',await page.getByRole('tab',{name:'Map',exact:true}).isVisible()&&!await page.locator('#recenter-map').isVisible()&&await page.locator('#map-pages').evaluate(e=>e.inert));
 await handle.press('ArrowDown');check('ArrowDown restores normal position',await state()==='normal'&&Math.abs(await top()-normal)<=1);
 await handle.press('ArrowDown');check('compact sheet hides and inerts content',await state()==='compact'&&!await content.isVisible()&&await content.evaluate(e=>e.inert));
 check('compact handle stays above navigation',await handle.evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.app-nav').getBoundingClientRect().top+1));
 await capture('compact-mobile');
 await handle.press('ArrowUp');check('ArrowUp reopens compact sheet to normal',await state()==='normal'&&await content.isVisible());
 await touchDrag(-120);check('touch swipe up expands without a second click toggle',await state()==='expanded');
 await capture('expanded-mobile');
 await touchDrag(120);check('touch swipe down returns expanded sheet to normal',await state()==='normal');
 await touchDrag(240);check('touch swipe down collapses normal sheet',await state()==='compact');
 await touchDrag(-70);check('short deliberate upward swipe reopens compact sheet',await state()==='normal');
 await touchDrag(-80,{cancel:true});check('cancelled touch restores initial height',await state()==='normal'&&Math.abs(await top()-normal)<=1);
 await touchDrag(-10);check('short accidental movement neither resizes nor taps',await state()==='normal');
 await touchDrag(0,{dx:100});check('horizontal handle gesture does not resize or tap',await state()==='normal');
 const start=await handle.boundingBox();await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(start.x+start.width/2,start.y-150,{steps:5});await page.mouse.up();
 check('mouse drag captures release outside the moving handle',await state()==='expanded');
 await handle.press('End');await handle.press('Space');check('Space opens compact sheet',await state()==='expanded');await handle.press('Enter');check('Enter collapses expanded sheet',await state()==='compact');await handle.press('Escape');check('Escape restores normal sheet',await state()==='normal');
 const scroll=await content.boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:scroll.x+8,y:scroll.y+150}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:scroll.x+8,y:scroll.y+30}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 check('content scrolls without moving the sheet',await state()==='normal'&&await content.evaluate(e=>e.scrollTop>0));
 await page.evaluate(()=>document.querySelector('#journey-panel-content').scrollTop=0);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:220,y:245}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:300,y:240}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});check('map touch leaves sheet position unchanged',await state()==='normal');
 await handle.press('End');await nav('preferences');check('navigation reopens content and removes handle from tool pages',await content.isVisible()&&!await handle.isVisible()&&await page.locator('#preferences-heading').evaluate(e=>e===document.activeElement));await nav('plan');
 check('returning to Plan restores normal sheet',await state()==='normal'&&await handle.isVisible()&&await page.locator('#plan-heading').evaluate(e=>e===document.activeElement));
 await handle.press('End');check('active trip peek cannot cover compact handle',!await page.locator('#trip-peek').isVisible());await handle.press('Escape');
 await page.locator('#origin').fill('Bugis');check('planner inputs retain normal interaction',await page.locator('#origin').inputValue()==='Bugis'&&await state()==='normal');await page.locator('#origin').press('Escape');
 await handle.press('Home');await page.getByRole('tab',{name:'Station guide',exact:true}).click();check('Station guide compacts journey sheet and keeps docked controls visible',await state()==='compact'&&await panel.isVisible()&&await handle.isVisible()&&await page.locator('#map-station-page').isVisible()&&await page.locator('#map-station-page').evaluate(e=>e.clientHeight>300));
 await touchDrag(-70);check('journey sheet resizes while Station guide is selected',await state()==='normal'&&await page.getByRole('tab',{name:'Station guide',exact:true}).getAttribute('aria-selected')==='true');await handle.press('End');
 const guide=await page.locator('#map-station-page').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:guide.x+20,y:guide.y+190}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:guide.x+20,y:guide.y+60}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});check('Station guide scrolls without dragging the journey sheet',await state()==='compact'&&await page.locator('#map-station-page').evaluate(e=>e.scrollTop>0));
 await page.getByRole('tab',{name:'Map',exact:true}).click();check('returning to Map retains compact sheet position',await state()==='compact'&&await page.locator('#commute-map').isVisible());await nav('current');check('navigation from guide restores current journey and focus',await panel.isVisible()&&await page.locator('#current-heading').evaluate(e=>e===document.activeElement)&&await state()==='normal');
 await page.setViewportSize({width:320,height:900});await page.evaluate(()=>document.documentElement.style.fontSize='200%');await page.waitForFunction(()=>Math.abs(parseFloat(document.body.style.getPropertyValue('--nav-height'))-document.querySelector('.app-nav').getBoundingClientRect().height)<1);await handle.press('Home');
 check('320px large-text expanded sheet preserves scroll area',await content.evaluate(e=>e.clientHeight>150)&&await page.evaluate(()=>document.documentElement.scrollWidth<=321));await capture('expanded-320-large');
 await handle.press('End');check('320px large-text compact handle stays usable above navigation',await handle.evaluate(e=>{const r=e.getBoundingClientRect(),n=document.querySelector('.app-nav').getBoundingClientRect();return r.height>=44&&r.bottom<=n.top+1&&r.top>=76;}));await capture('compact-320-large');
 await handle.press('Escape');check('reduced-motion sheet adds no CSS transition',await panel.evaluate(e=>getComputedStyle(e).transitionDuration.split(',').every(t=>parseFloat(t)===0)));
 await page.evaluate(()=>document.documentElement.style.fontSize='');await page.setViewportSize({width:1280,height:900});await page.waitForFunction(()=>document.querySelector('#journey-sheet-handle').hidden);
 check('desktop keeps its regular sidebar and visible content',!await handle.isVisible()&&await content.isVisible()&&await panel.evaluate(e=>e.getBoundingClientRect().width<500)&&await page.locator('.app-shell').getAttribute('data-journey-sheet')===null);
 check('desktop map tabs stay attached to sidebar',await page.locator('.guidance-page-strip').evaluate(e=>{const a=e.getBoundingClientRect(),b=document.querySelector('#main').getBoundingClientRect();return Math.abs(a.top-b.top)<=1&&a.left>=b.left&&a.right<=b.right;}));
 await page.setViewportSize({width:390,height:844});await handle.waitFor({state:'visible'});check('return to mobile starts at normal height',await state()==='normal');
 check('sheet gestures and view changes preserve the accepted journey',await page.evaluate(()=>localStorage.getItem('commute-copilot-journey-v2'))===accepted);
 check('main map contains no toilet-location markers',await page.locator('#commute-map .companion-marker').count()===0);
 check('sheet verification reports no browser exceptions',errors.length===0);
 await writeFile(`${out}/results.json`,JSON.stringify({checks,errors,environment:'Desktop Edge touch/mobile emulation, mouse, keyboard, 320px/200% text and desktop; no physical-device claim'},null,2));
}finally{await browser.close();}
