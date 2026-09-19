// FR2 layout and contrast evidence. Edge emulation, not a physical-device claim.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4242';
const out='test-results/fr2-polish/after';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[],measurements=[],errors=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const [light,dark]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (light+.05)/(dark+.05);};
try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Singapore'});
 await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
 for(const size of [{name:'390',width:390,height:844},{name:'320',width:320,height:844},{name:'desktop',width:1440,height:960},{name:'390-large',width:390,height:1000,text:'200%'},{name:'320-large',width:320,height:1000,text:'200%'}]){
  await page.setViewportSize({width:size.width,height:size.height});
  await page.evaluate(text=>document.documentElement.style.fontSize=text??'',size.text);
  // Use the rendered navigation keys, so a parallel Facilities → Services rename remains compatible.
  const views=await page.locator('.app-nav [data-view]').evaluateAll(es=>es.map(e=>e.dataset.view));
  for(const view of views){
   await page.locator(`.app-nav [data-view=${view}]`).click();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const data=await page.evaluate(view=>{
    const content=document.querySelector('.panel-scroll'),panel=content.getBoundingClientRect(),heading=document.querySelector(`#view-${view} h1`),nav=document.querySelector('.app-nav').getBoundingClientRect(),header=document.querySelector('.journey-sheet-header').getBoundingClientRect();
    return {view,scrollHeight:content.scrollHeight,contentHeight:content.clientHeight,contentTop:panel.top,headingTop:heading.getBoundingClientRect().top,headerHeight:header.height,noOverflow:document.documentElement.scrollWidth<=innerWidth+1&&content.scrollWidth<=content.clientWidth+1,aboveNav:panel.bottom<=nav.top+1,headingFocused:document.activeElement===heading,padding:getComputedStyle(content).paddingInlineStart};
   },view);
   measurements.push({case:size.name,...data});
   check(`${size.name} ${view}: heading focused, content fits width and stays above navigation`,data.headingFocused&&data.noOverflow&&data.aboveNav&&data.contentHeight>100);
   if(['plan','current'].includes(view)&&size.width<=680&&!size.text)check(`${size.name} ${view}: integrated header saves at least 40px over former 97px stack`,data.headerHeight<=57);
   if(view==='caregiver')check(`${size.name}: requested caregiver paragraphs removed; address and acceptance disclosure retained`,await page.locator('#companion-sharing').evaluate(e=>!e.textContent.includes('Latest checkpoint and optional latest position')&&!e.textContent.includes('Ordinary Web Push')&&e.textContent.includes('Addresses included')&&e.textContent.includes('explicitly accept')));
   await page.screenshot({path:`${out}/${view}-${size.name}.png`,animations:'disabled'});
  }
 }
 // A labelled local fixture makes the sharing action available without timetable/network dependence.
 await page.evaluate(async()=>{
  const m=await import('/src/journey-v2.js');
  const p=m.makePlan({origin:{id:'DT14_A',label:'Bugis'},destination:{id:'DT15_A',label:'Promenade'},date:'2026-09-21',departureTime:'10:00',preferences:{stepFree:false},route:{id:'fr2-labelled-layout-fixture',departureSeconds:36000,arrivalSeconds:36600,walkingSeconds:60,steps:[{id:'access',type:'access',text:'FR2 layout fixture: follow signs at Bugis',fromStopId:'DT14_A',toStopId:'DT14_A',durationSeconds:60},{id:'ride',type:'ride',text:'FR2 layout fixture: ride to Promenade',fromStopId:'DT14_A',toStopId:'DT15_A',durationSeconds:540}]}});
  if(!m.saveActive(localStorage,m.startJourney(p)))throw Error('Could not save labelled layout fixture');
 });
 await page.reload();await page.locator('#find-routes:not([disabled])').waitFor();
 for(const size of [{name:'390',width:390,height:844},{name:'320-large',width:320,height:1000,text:'200%'},{name:'desktop',width:1440,height:960}]){
  await page.setViewportSize({width:size.width,height:size.height});await page.evaluate(text=>document.documentElement.style.fontSize=text??'',size.text);
  await page.locator('.app-nav [data-view=caregiver]').click();const button=page.locator('#prepare-link');await button.scrollIntoViewIfNeeded();
  const sample=async state=>{
   const s=await button.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);return {color:s.color,background:s.backgroundColor,outline:s.outlineStyle,outlineWidth:parseFloat(s.outlineWidth),width:r.width,height:r.height,labelFits:[...range.getClientRects()].every(t=>t.left>=r.left&&t.right<=r.right&&t.top>=r.top&&t.bottom<=r.bottom)};});
   s.contrast=contrast(s.color,s.background);measurements.push({case:size.name,state,...s});
   check(`${size.name} recipient link ${state}: WCAG AA text contrast and 44px readable target`,s.contrast>=4.5&&s.height>=44&&s.width>=44&&s.labelFits);
   if(state==='focus')check(`${size.name} recipient link keyboard focus is visible`,s.outline!=='none'&&s.outlineWidth>=3);
  };
  await page.mouse.move(0,0);await sample('default');await button.hover();await sample('hover');await page.keyboard.press('Tab');await button.focus();await sample('focus');
  await page.screenshot({path:`${out}/recipient-link-${size.name}.png`});
  await button.hover();await page.mouse.down();await sample('active');await page.mouse.move(0,0);await page.mouse.up();
  if(size.width<=680){
   await page.locator('.app-nav [data-view=current]').click();const handle=page.locator('#journey-sheet-handle');await handle.press('End');
   check(`${size.name}: compact header fits exactly above nav with content inert`,await page.evaluate(()=>{const h=document.querySelector('.journey-sheet-header').getBoundingClientRect(),n=document.querySelector('.app-nav').getBoundingClientRect(),c=document.querySelector('.panel-scroll');return Math.abs(h.bottom-n.top)<=1&&h.top>=76&&c.inert&&c.hidden;}));
   const mapTab=page.getByRole('tab',{name:'Map',exact:true});await mapTab.focus();await mapTab.press('ArrowRight');
   check(`${size.name}: Station guide retains keyboard selection and focus`,await page.getByRole('tab',{name:'Station guide',exact:true}).evaluate(e=>e===document.activeElement&&e.getAttribute('aria-selected')==='true')&&await page.locator('#map-station-page').isVisible());
   await page.screenshot({path:`${out}/compact-guide-${size.name}.png`});
  }
 }
 check('No browser exceptions',errors.length===0);
}finally{
 await writeFile(`${out}/results.json`,JSON.stringify({checks,measurements,errors,environment:'Desktop Edge; 320/390px and desktop viewports; 200% root text; blocked street tiles; local labelled journey fixture. No physical-device validation.'},null,2)+'\n');
 await browser.close();
}
