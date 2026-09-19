import {createOneMapAddressSearch} from './address-search.js';
import {icon} from './icons.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Each endpoint owns its request lifecycle. Typing only searches on-device data;
// the named OneMap option explicitly sends the current query to that provider.
export function mountEndpointSearch({field,box,status,clear,getSuggestions,isSelected,onEdit,onChoose,onMyLocation,search=createOneMapAddressSearch()}){
  const key=field.id;
  let epoch=0,items=[],index=-1,busy=false,locationRequest=null;
  const announce=text=>{status.textContent=text;status.hidden=!text;};
  const cancel=()=>{epoch++;search.cancel();locationRequest?.abort();locationRequest=null;busy=false;field.removeAttribute('aria-busy');};
  function close(){
    if(busy)announce('');
    cancel();box.hidden=true;items=[];index=-1;
    field.setAttribute('aria-expanded','false');field.removeAttribute('aria-activedescendant');
  }
  function refresh(){clear.hidden=!field.value;}
  function reset(){close();announce('');refresh();}
  function select(point){reset();onChoose(point);refresh();}
  function render(points,{allowSearch=true}={}){
    index=-1;field.removeAttribute('aria-activedescendant');
    items=points.map(point=>({point}));
    const query=field.value.trim();
    if(onMyLocation){const action={location:true};if(query&&!/^my location$/i.test(query))items.push(action);else items.unshift(action);}
    if(allowSearch&&query.length>=2&&query.length<=160&&!(onMyLocation&&/^my location$/i.test(query)))items.push({query});
    box.innerHTML=items.map((item,i)=>{
      if(item.location)return `<button type="button" class="suggestion-option my-location-option" id="${key}-my-location" role="option" aria-selected="false" data-index="${i}" tabindex="-1">${icon('location',22)}<span><strong>My location</strong><small>Use device location</small></span></button>`;
      const p=item.point,id=p?`${key}-option-${i}`:`${key}-address-search`;
      return `<button type="button" class="suggestion-option" id="${id}" role="option" aria-selected="false" data-index="${i}" ${p?.kind==='address'?`data-address-index="${i}"`:''} tabindex="-1">${icon(p?(p.kind==='address'?'pin':p.kind??'saved'):'search',22)}<span><strong>${esc(p?.label??`Search addresses for “${query}”`)}</strong><small>${esc(p?.detail??'OneMap · sends this search only')}</small></span></button>`;
    }).join('');
    box.hidden=!items.length;field.setAttribute('aria-expanded',String(!!items.length));
    box.querySelectorAll('[data-index]').forEach(button=>{
      button.onpointerdown=event=>event.preventDefault();
      button.onclick=()=>activate(Number(button.dataset.index));
    });
  }
  async function locate(){
    cancel();const version=epoch;locationRequest=new AbortController();busy=true;field.setAttribute('aria-busy','true');
    box.hidden=true;field.setAttribute('aria-expanded','false');field.removeAttribute('aria-activedescendant');
    announce('Getting a fresh location…');
    try{
      const point=await onMyLocation({signal:locationRequest.signal});
      if(version!==epoch)return;
      select(point);announce(`${point.detail}. Find my route sends selected coordinates to OneMap.`);
    }catch(error){
      if(version!==epoch||error.name==='AbortError')return;
      render(getSuggestions(field.value));announce(error.message);
    }finally{if(version===epoch){busy=false;field.removeAttribute('aria-busy');}}
  }
  function showLocal(){
    const points=getSuggestions(field.value);render(points);
    if(field.value.trim().length>160)announce('Address searches support up to 160 characters. Shorten the address or use its postal code.');
    else if(onMyLocation&&(!field.value.trim()||/^my location$/i.test(field.value.trim())))announce('');
    else if(!points.length)announce(field.value.trim().length>=2?'No matching station or saved place. Choose Search addresses for a OneMap lookup.':'Enter a station, bus stop, address or postal code.');
  }
  async function lookup(){
    if(busy)return;
    cancel();const version=epoch,query=field.value.trim();busy=true;field.setAttribute('aria-busy','true');
    render(getSuggestions(field.value),{allowSearch:false});announce('Searching OneMap…');
    try{
      const results=await search.search(query);
      if(version!==epoch||query!==field.value.trim()||!results)return;
      const addresses=results.map(p=>({...p,kind:'address',detail:`${p.address} · OneMap${p.searchCached?' · cached this session':''} · connection checked when routing`}));
      const ids=new Set(addresses.map(p=>p.id));
      render([...addresses,...getSuggestions(field.value).filter(p=>!ids.has(p.id))],{allowSearch:!addresses.length});
      announce(addresses.length?`${addresses.length} OneMap address${addresses.length===1?'':'es'}${addresses.every(p=>p.searchCached)?' from this session’s cache':''}. Select one to confirm its position.`:'No matching OneMap address. Try a postal code or choose a station.');
    }catch(error){
      if(version!==epoch)return;
      render(getSuggestions(field.value));announce(`${error.message} Choose a station or saved place, or retry Search addresses.`);
    }finally{if(version===epoch){busy=false;field.removeAttribute('aria-busy');}}
  }
  function activate(i){const item=items[i];if(item?.location)void locate();else if(item?.point)select(item.point);else if(item?.query)void lookup();}
  field.oninput=()=>{reset();onEdit();showLocal();};
  field.onfocus=()=>{reset();showLocal();};
  field.onclick=()=>{if(box.hidden&&!busy)showLocal();};
  field.onblur=()=>{close();};
  field.onkeydown=event=>{
    if(event.key==='Escape'){reset();return;}
    if(['ArrowDown','ArrowUp'].includes(event.key)){
      event.preventDefault();if(box.hidden){showLocal();}if(!items.length)return;
      index=index<0?(event.key==='ArrowDown'?0:items.length-1):(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
      const options=box.querySelectorAll('[role=option]');options.forEach((button,i)=>button.setAttribute('aria-selected',String(i===index)));
      field.setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});
    }else if(event.key==='Enter'&&!box.hidden&&index>=0){
      event.preventDefault();activate(index);
    }else if(event.key==='Enter'&&!isSelected()){
      event.preventDefault();if(items.length===1&&items[0].query)void lookup();
      else announce('Choose a suggestion with the arrow keys and Enter, or tap it to confirm.');
    }else if(event.key==='Tab'){close();}
  };
  clear.onpointerdown=event=>event.preventDefault();
  clear.onclick=()=>{field.value='';reset();onEdit();field.focus();showLocal();};
  refresh();return {reset,refresh,close};
}
