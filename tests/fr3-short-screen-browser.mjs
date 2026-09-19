// Independent short-screen regression for the text-size extension.
import assert from 'node:assert/strict';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4250';
const out='test-results/fr3-short-screen';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const measurements=[],errors=[];
let page,lastCase;
try{
  const context=await browser.newContext({viewport:{width:320,height:568},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  await page.locator('.app-nav [data-view=preferences]').click();
  const slider=page.locator('#view-preferences input[type=range]');
  await slider.focus();await slider.press('End');
  assert.equal(await slider.inputValue(),await slider.getAttribute('max'),'keyboard selects maximum text size');
  const views=await page.locator('.app-nav [data-view]').evaluateAll(es=>es.map(e=>e.dataset.view));
  assert.equal(views.length,8,'all eight navigation destinations are covered');
  for(const size of [{width:320,height:568},{width:568,height:320}]){
    await page.setViewportSize(size);
    for(const view of views){
      lastCase={...size,view};
      await page.locator(`.app-nav [data-view=${view}]`).click();
      await page.waitForFunction(()=>Math.abs(parseFloat(document.body.style.getPropertyValue('--nav-height'))-document.querySelector('.app-nav').getBoundingClientRect().height)<1);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const data=await page.evaluate(view=>{
        const content=document.querySelector('.panel-scroll'),contentOverflow=getComputedStyle(content).overflowY;
        // Short landscape uses the whole panel as its sole scrollport. The
        // child intentionally extends past navigation and scrolls with its tabs.
        const scroller=/^(auto|scroll)$/.test(contentOverflow)?content:content.closest('.app-panel'),p=scroller.getBoundingClientRect();
        const header=document.querySelector('.app-topbar').getBoundingClientRect(),nav=document.querySelector('.app-nav'),n=nav.getBoundingClientRect();
        const navigation=[...nav.querySelectorAll('button')].map(button=>{
          const r=button.getBoundingClientRect();
          return {view:button.dataset.view,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,reachable:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
        });
        return {view,scroller:scroller.id,contentOverflow,scrollerOverflow:getComputedStyle(scroller).overflowY,headerBottom:header.bottom,contentTop:p.top,contentBottom:p.bottom,contentHeight:p.height,navTop:n.top,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,contentWidth:content.scrollWidth,clientWidth:content.clientWidth,scrollerWidth:scroller.scrollWidth,scrollerClientWidth:scroller.clientWidth,scrollHeight:scroller.scrollHeight,navigation,headingFocused:document.activeElement===document.querySelector(`#view-${view} h1`)};
      },view);
      const measured={...size,...data,controls:[]};measurements.push(measured);
      assert.ok(data.contentTop>=data.headerBottom-1,`${size.width} ${view}: header does not obscure content`);
      assert.ok(data.contentBottom<=data.navTop+1&&data.contentHeight>=44,`${size.width} ${view}: scrollable content remains reachable above navigation`);
      assert.ok(data.documentWidth<=data.viewportWidth+1&&data.contentWidth<=data.clientWidth+1&&data.scrollerWidth<=data.scrollerClientWidth+1,`${size.width} ${view}: content wraps within screen`);
      assert.ok(data.headingFocused,`${size.width} ${view}: navigation focuses the requested heading`);
      assert.ok(data.navigation.every(b=>b.width>=44&&b.height>=44&&b.left>=-1&&b.right<=size.width+1&&b.top>=-1&&b.bottom<=size.height+1&&b.reachable),`${size.width} ${view}: all navigation buttons remain reachable`);
      if(size.height<=540)assert.ok(data.scroller==='main'&&data.contentOverflow==='visible'&&/^(auto|scroll)$/.test(data.scrollerOverflow),`${size.width} ${view}: short landscape has one panel scrollport`);
      const controls=await page.locator(`#view-${view}`).locator('button:visible:not(:disabled), input:visible:not(:disabled), select:visible:not(:disabled), summary:visible, a[href]:visible').elementHandles();
      const count=controls.length;
      for(const index of [...new Set([0,count-1])].filter(i=>i>=0&&i<count)){
        // Focus may expand endpoint suggestions. Scroll the settled control
        // again to test whether it can be reached in that resulting layout.
        const control=controls[index];await control.focus();await control.scrollIntoViewIfNeeded();
        const reachable=await control.evaluate(element=>{
          const content=document.querySelector('.panel-scroll'),scroller=/^(auto|scroll)$/.test(getComputedStyle(content).overflowY)?content:content.closest('.app-panel');
          const r=element.getBoundingClientRect(),p=scroller.getBoundingClientRect();
          return {id:element.id,tag:element.tagName,label:(element.getAttribute('aria-label')||element.innerText||element.getAttribute('name')||'').slice(0,100),focused:document.activeElement===element,hit:element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),visibleHeight:Math.max(0,Math.min(r.bottom,p.bottom)-Math.max(r.top,p.top)),height:r.height,scrollTop:scroller.scrollTop,childScrollTop:content.scrollTop};
        });
        measured.controls.push(reachable);
        assert.ok(reachable.focused&&reachable.hit&&reachable.visibleHeight>=Math.min(24,reachable.height)-1,`${size.width} ${view}: ${reachable.id||reachable.label||reachable.tag} is reachable by scrolling and focus`);
        if(size.height<=540)assert.equal(reachable.childScrollTop,0,`${size.width} ${view}: child content does not trap scrolling`);
      }
      const lastText=page.locator(`#view-${view}`).locator('h1:visible, h2:visible, h3:visible, p:visible, summary:visible, button:visible, label:visible').last();
      await lastText.scrollIntoViewIfNeeded();
      measured.lastText=await lastText.evaluate(element=>{
        const content=document.querySelector('.panel-scroll'),scroller=/^(auto|scroll)$/.test(getComputedStyle(content).overflowY)?content:content.closest('.app-panel');
        const r=element.getBoundingClientRect(),p=scroller.getBoundingClientRect();
        return {text:element.textContent.trim().slice(0,100),height:r.height,visibleHeight:Math.max(0,Math.min(r.bottom,p.bottom)-Math.max(r.top,p.top)),scrollTop:scroller.scrollTop};
      });
      assert.ok(measured.lastText.visibleHeight>=Math.min(24,measured.lastText.height)-1,`${size.width} ${view}: final text is reachable by scrolling`);
      console.log(`PASS ${size.width}x${size.height} ${view}: maximum text remains reachable`);
      await page.screenshot({path:`${out}/${view}-${size.width}.png`});
    }
  }
  assert.deepEqual(errors,[],'no uncaught browser errors');
  await Promise.all(['failure.png','failure.json'].map(file=>rm(`${out}/${file}`,{force:true})));
}catch(error){
  if(page)await page.screenshot({path:`${out}/failure.png`});
  await writeFile(`${out}/failure.json`,JSON.stringify({case:lastCase,error:error.stack},null,2)+'\n');
  throw error;
}finally{
  await writeFile(`${out}/results.json`,JSON.stringify({base,measurements,errors,environment:'Installed Edge, maximum actual slider setting, 320x568 and 568x320 viewports. Actual scrollport bounds, all eight navigation targets and first/last visible controls checked. Desktop mobile emulation, not physical-device evidence.'},null,2)+'\n');
  await browser.close();
}
