// Measures default, unscrolled content as well as the eight direct navigation targets.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4231';
const originalCommit='0a3bfa1264dec93b2f7a5b58f8650c68224f84e9';
const originalCss=execFileSync('git',['show',`${originalCommit}:src/r5.css`],{encoding:'utf8'});
const outputRoot='test-results/pre-fr2-compact-tabs';
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[],measurements=[],errors=[];
const check=(label,pass)=>{assert.ok(pass,label);checks.push(label);console.log('PASS '+label);};
const sizes=[{width:390,height:844,name:'390'},{width:320,height:844,name:'320'},{width:1440,height:960,name:'desktop'},{width:320,height:900,name:'320-large',text:'200%'},{width:390,height:844,name:'390-large',text:'200%'},{width:390,height:844,name:'large-setting',setting:true},{width:640,height:360,name:'landscape'},{width:640,height:360,name:'landscape-large',text:'200%'}];
try{
 for(const phase of ['before','after']){
  const baseline=phase==='before',out=`${outputRoot}/${phase}`;
  await mkdir(out,{recursive:true});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  // Compare against the integrated FR1 CSS in the same application, without
  // rebuilding or changing source files underneath the preview or other suites.
  if(baseline)await context.route('**/src/r5.css',route=>route.fulfill({status:200,contentType:'text/css',body:originalCss}));
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  // Labelled route fixture isolates layout from timetable changes and network providers.
  await page.evaluate(async()=>{
    const m=await import('/src/journey-v2.js');
    const plan=m.makePlan({origin:{id:'DT14_A',label:'Bugis'},destination:{id:'DT15_A',label:'Promenade'},date:'2026-09-21',departureTime:'10:00',preferences:{stepFree:false},route:{id:'compact-nav-layout-fixture',departureSeconds:36000,arrivalSeconds:36600,walkingSeconds:60,steps:[{id:'access',type:'access',text:'Follow station signs at Bugis',fromStopId:'DT14_A',toStopId:'DT14_A',durationSeconds:60},{id:'ride',type:'ride',text:'Ride to Promenade',fromStopId:'DT14_A',toStopId:'DT15_A',durationSeconds:540}]}});
    if(!m.saveActive(localStorage,m.startJourney(plan)))throw Error('Could not save layout fixture');
  });
  await page.reload();await page.locator('#find-routes:not([disabled])').waitFor();
  for(const size of sizes){
    await page.setViewportSize({width:size.width,height:size.height});
    await page.evaluate(({text,setting})=>{document.documentElement.style.fontSize=text??'';document.body.classList.toggle('large-text',!!setting);},size);
    for(const view of ['plan','current','facilities']){
      await page.locator(`.app-nav [data-view=${view}]`).click();
      if(view==='facilities')await page.locator('#nearby-refresh:not([disabled])').waitFor();
      await page.waitForFunction(()=>Math.abs(parseFloat(document.body.style.getPropertyValue('--nav-height'))-document.querySelector('.app-nav').getBoundingClientRect().height)<1);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const measured=await page.evaluate(()=>{
        const nav=document.querySelector('.app-nav'),n=nav.getBoundingClientRect(),panel=document.querySelector('.panel-scroll'),p=panel.getBoundingClientRect();
        const buttons=[...nav.querySelectorAll('button')].map(button=>{
          const b=button.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(button.querySelector('span'));
          return {id:button.dataset.view,x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom,bordered:parseFloat(getComputedStyle(button).borderTopWidth)>=1,labelFits:[...range.getClientRects()].every(r=>r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom)};
        });
        const landmarks=['#origin','#destination','#endpoint-help','.time-options','#time-note','#edit-preferences','#find-routes','#current-summary h2','#current-summary .guidance-next','#current-summary .indoor-guidance-notice strong','#current-summary .indoor-guidance-notice p','#companion-active>p.muted','#location-estimate','#guidance-primary','#nearby-refresh','#nearby-manual>summary','.nf-toolbar','#nearby-center','#nearby-feed','#nearby-count','#nearby-results .nf-empty h2','#nearby-results .nf-empty p'];
        const visibleContent=landmarks.map(selector=>{const e=document.querySelector(selector);if(!e||!e.checkVisibility())return null;const r=e.getBoundingClientRect();const visibleHeight=Math.max(0,Math.min(p.bottom,r.bottom)-Math.max(p.top,r.top));return {selector,text:e.textContent.trim().slice(0,120),visibleHeight,height:r.height,fullyVisible:visibleHeight>=r.height-.5};}).filter(Boolean);
        return {navHeight:n.height,navTop:n.top,navWidth:n.width,navX:n.x,panelHeight:p.height,panelTop:p.top,panelBottom:p.bottom,scrollTop:panel.scrollTop,sheetState:document.querySelector('#main').dataset.sheetState,buttons,visibleContent,noOverflow:nav.scrollWidth<=nav.clientWidth&&document.documentElement.scrollWidth<=innerWidth};
      });
      measurements.push({phase,case:size.name,view,...measured});
      if(!baseline){
        check(`${size.name} ${view}: eight readable direct touch targets fit`,measured.buttons.length===8&&measured.noOverflow&&measured.buttons.every(b=>b.width>=44&&b.height>=44&&b.x>=0&&b.right<=size.width+1&&b.y>=0&&b.bottom<=size.height+1&&b.labelFits));
        const current=measured.buttons.find(b=>b.id==='current'),plan=measured.buttons.find(b=>b.id==='plan');
        check(`${size.name} ${view}: Current trip remains centered and larger`,Math.abs(current.x+current.width/2-(measured.navX+measured.navWidth/2))<1&&current.width/plan.width>1.25&&current.height/plan.height>1.1);
        check(`${size.name} ${view}: every tab has a border and 6px separation`,measured.buttons.every((a,index)=>a.bordered&&measured.buttons.slice(index+1).every(b=>Math.hypot(Math.max(a.x-b.right,b.x-a.right,0),Math.max(a.y-b.bottom,b.y-a.bottom,0))>=5.9)));
        check(`${size.name} ${view}: content starts unscrolled above the dock`,measured.scrollTop===0&&measured.panelHeight>0&&measured.panelBottom<=measured.navTop+1);
        const before=measurements.find(m=>m.phase==='before'&&m.case===size.name&&m.view===view);
        check(`${size.name} ${view}: smaller dock recovers real panel space`,measured.navHeight<before.navHeight&&measured.panelHeight>before.panelHeight);
        if(['390','320','desktop','landscape'].includes(size.name))check(`${size.name} ${view}: compact total dock height`,measured.navHeight<=125);
        if(['390','320','desktop'].includes(size.name)){
          const visibleTotal=m=>m.visibleContent.reduce((sum,item)=>sum+item.visibleHeight,0);
          check(`${size.name} ${view}: default content visibility improves or already fits fully`,visibleTotal(measured)>visibleTotal(before)+10||(before.visibleContent.every(item=>item.fullyVisible)&&measured.visibleContent.every(item=>item.fullyVisible)));
        }
        if(['390','320'].includes(size.name)){
          const required={plan:['#origin','#destination','#endpoint-help'],current:['#current-summary h2'],facilities:['#nearby-refresh','#nearby-manual>summary','.nf-toolbar','#nearby-feed']}[view];
          check(`${size.name} ${view}: key default content is fully readable`,required.every(selector=>measured.visibleContent.some(item=>item.selector===selector&&item.fullyVisible)));
        }
      }
      await page.screenshot({path:`${out}/${view}-${size.name}.png`,animations:'disabled'});
    }
  }
  if(!baseline){
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{document.documentElement.style.fontSize='';document.body.classList.remove('large-text');});
    for(const view of ['plan','current','saved','facilities','caregiver','spending','preferences','staff']){
      await page.locator(`.app-nav [data-view=${view}]`).click();
      check(`${view}: navigation activates one destination and focuses its heading`,await page.locator(`#view-${view}`).isVisible()&&await page.locator(`.app-nav [data-view=${view}]`).getAttribute('aria-current')==='page'&&await page.locator('.app-nav [aria-current=page]').count()===1&&await page.locator(`#view-${view} h1`).evaluate(e=>e===document.activeElement));
    }
  }
  await writeFile(`${out}/results.json`,JSON.stringify({phase,originalCommit,measurements:measurements.filter(m=>m.phase===phase)},null,2)+'\n');
  await context.close();
 }
 check('no browser runtime errors',errors.length===0);
}finally{
  await writeFile(`${outputRoot}/results.json`,JSON.stringify({checks,errors,originalCommit,measurements,environment:'Desktop Edge with mobile/touch, 200% root-text and viewport emulation. Before uses integrated FR1 r5.css intercepted on the same application. Current uses an explicitly labelled layout fixture; Plan and Facilities use real screens. Street tiles blocked, no physical-phone or live-provider claim.'},null,2)+'\n');
  await browser.close();
}
