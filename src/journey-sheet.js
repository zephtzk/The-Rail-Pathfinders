const positions=['expanded','normal','compact'];

/** The handle owns sheet gestures. Content scrolling and map touches never do. */
export function mountJourneySheet({shell,panel,dock,handle,content,mapPanel,nav,header,getView=()=> 'plan',onResize=()=>{}}){
  const mobile=matchMedia('(max-width:680px)');
  let state='normal',enabled=false,gesture=null,suppressClick=false,limits=null,frame=0;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

  function render(){
    if(enabled){shell.dataset.journeySheet=gesture?.dragging?'dragging':state;shell.style.setProperty('--journey-sheet-top',`${gesture?.top??limits[state]}px`);}
    else {delete shell.dataset.journeySheet;shell.style.removeProperty('--journey-sheet-top');}
    panel.dataset.sheetState=state;
    const collapsed=enabled&&state==='compact'&&!gesture?.dragging;
    if(collapsed&&content.contains(document.activeElement))handle.focus({preventScroll:true});
    content.hidden=collapsed;content.inert=collapsed;handle.hidden=!enabled;
    mapPanel.parentElement.inert=enabled&&(state==='expanded'||!!gesture?.dragging);
    handle.setAttribute('aria-expanded',String(!collapsed));
    const label=state==='compact'?'Show journey panel':state==='expanded'?'Collapse journey panel':'Expand journey panel';
    handle.querySelector('span').textContent=label;handle.setAttribute('aria-label',label);
  }
  function layout(){
    if(gesture)return;
    enabled=mobile.matches&&['plan','current'].includes(getView());
    handle.hidden=!enabled;
    if(enabled){
      // Measure the existing responsive layout before applying a sheet position.
      delete shell.dataset.journeySheet;
      const normal=panel.getBoundingClientRect().top,shellBox=shell.getBoundingClientRect();
      const expanded=Math.max(76,header.getBoundingClientRect().bottom+10);
      const compact=Math.max(expanded,shellBox.bottom-nav.getBoundingClientRect().height-handle.getBoundingClientRect().height-dock.getBoundingClientRect().height);
      shell.style.setProperty('--journey-surface-top',`${expanded}px`);
      limits={expanded:Math.min(expanded,compact),normal:clamp(normal,expanded,Math.max(expanded,compact-120)),compact};
    }else state='normal';
    render();onResize();
  }
  const scheduleLayout=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(layout);};
  function setState(next){state=positions.includes(next)?next:'normal';render();onResize();}
  function clearGesture(){
    const previous=gesture;gesture=null;
    if(previous&&handle.hasPointerCapture(previous.id))handle.releasePointerCapture(previous.id);
    return previous;
  }
  function cancel(){if(!gesture)return;suppressClick=true;clearGesture();layout();}
  function down(event){
    if(!enabled||event.isPrimary===false||event.button!==0||gesture)return;
    suppressClick=false;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,initialTop:panel.getBoundingClientRect().top,top:limits[state],initialState:state,dragging:false,moved:false};
    handle.setPointerCapture(event.pointerId);
  }
  function move(event){
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    gesture.moved ||= Math.max(Math.abs(dx),Math.abs(dy))>8;
    if(!gesture.dragging&&Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)*1.25)gesture.dragging=true;
    if(!gesture.dragging)return;
    event.preventDefault();gesture.top=clamp(gesture.initialTop+dy,limits.expanded,limits.compact);render();
  }
  function up(event){
    if(!gesture||gesture.id!==event.pointerId)return;
    const previous=clearGesture(),dy=event.clientY-previous.y;
    suppressClick=previous.moved;
    if(!previous.dragging){render();scheduleLayout();return;}
    const nearest=positions.reduce((best,key)=>Math.abs(limits[key]-previous.top)<Math.abs(limits[best]-previous.top)?key:best,previous.initialState);
    // A deliberate short swipe still advances one stop; a long drag may cross two.
    const next=nearest===previous.initialState&&Math.abs(dy)>=40?positions[clamp(positions.indexOf(state)+(dy>0?1:-1),0,positions.length-1)]:nearest;
    setState(next);scheduleLayout();
  }
  function click(event){if(suppressClick&&event.detail!==0){suppressClick=false;event.preventDefault();return;}if(enabled)setState(state==='expanded'?'compact':'expanded');}
  function keydown(event){
    if(!enabled)return;
    let next;
    if(event.key==='ArrowUp')next=positions[Math.max(0,positions.indexOf(state)-1)];
    else if(event.key==='ArrowDown')next=positions[Math.min(positions.length-1,positions.indexOf(state)+1)];
    else if(event.key==='Home')next='expanded';else if(event.key==='End')next='compact';else if(event.key==='Escape')next='normal';
    if(next){event.preventDefault();cancel();setState(next);}
  }
  function reset(){clearGesture();state='normal';layout();}
  function additionalPointer(event){if(gesture&&event.pointerId!==gesture.id)cancel();}
  const listeners={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:cancel,click,keydown};
  for(const [name,listener] of Object.entries(listeners))handle.addEventListener(name,listener);
  const observer=new ResizeObserver(scheduleLayout);for(const element of [shell,nav,header,handle,dock])observer.observe(element);
  mobile.addEventListener('change',reset);window.addEventListener('resize',scheduleLayout);window.addEventListener('blur',cancel);window.addEventListener('pointerdown',additionalPointer);
  layout();
  return {reset,revealSurface(){if(enabled)setState('compact');},getState:()=>state,destroy(){clearGesture();observer.disconnect();cancelAnimationFrame(frame);mobile.removeEventListener('change',reset);window.removeEventListener('resize',scheduleLayout);window.removeEventListener('blur',cancel);window.removeEventListener('pointerdown',additionalPointer);for(const [name,listener] of Object.entries(listeners))handle.removeEventListener(name,listener);enabled=false;state='normal';render();delete panel.dataset.sheetState;shell.style.removeProperty('--journey-surface-top');}};
}
