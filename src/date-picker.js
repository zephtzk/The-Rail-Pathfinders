import {singaporeNow} from './personal.js';
import {icon} from './icons.js';

let sequence=0;
const mounted=new WeakMap();
export const validCivilDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export function shiftCivilDate(value,days){if(!validCivilDate(value))throw Error('Choose a valid Singapore date.');const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export function shiftCivilMonth(value,months){if(!validCivilDate(value))throw Error('Choose a valid Singapore date.');const date=new Date(value+'T12:00:00Z'),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months);const last=new Date(date);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);date.setUTCDate(Math.min(day,last.getUTCDate()));return date.toISOString().slice(0,10);}
export const civilDateLabel=value=>validCivilDate(value)?new Intl.DateTimeFormat('en-SG',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'Choose date';

export function mountDatePickers(form){
 if(mounted.has(form))return mounted.get(form);
 const inputs=[...form.querySelectorAll('input[type=date]')];if(!inputs.length)return {refresh(){},destroy(){}};
 const id=`date-picker-${++sequence}`,dialog=document.createElement('dialog'),controls=[];let target=null,draft=singaporeNow().departureDate,disposed=false;
 dialog.className='date-dialog';dialog.setAttribute('aria-labelledby',id+'-title');dialog.id=id;
 dialog.innerHTML=`<form method="dialog"><h2 id="${id}-title">Choose a date</h2><p>Singapore date · arrow keys move by day, Page Up/Down by month.</p><div class="calendar-heading"><button type="button" data-month="-1" class="secondary" aria-label="Previous month">‹</button><strong aria-live="polite" id="${id}-month"></strong><button type="button" data-month="1" class="secondary" aria-label="Next month">›</button></div><div class="calendar-weekdays" aria-hidden="true">${['M','T','W','T','F','S','S'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid" role="grid" aria-labelledby="${id}-month"></div><p class="calendar-selected" aria-live="polite"></p><div class="field-pair"><button class="secondary" value="cancel">Cancel</button><button class="primary" value="apply">Use this date</button></div></form>`;
 document.body.append(dialog);
 const grid=dialog.querySelector('.calendar-grid');
 function refresh(){for(const c of controls){c.button.querySelector('span').textContent=civilDateLabel(c.input.value);c.button.setAttribute('aria-label',`Choose ${c.label} date, ${civilDateLabel(c.input.value)}`);}}
 function paint(focus=false){
  const date=new Date(draft+'T12:00:00Z'),first=draft.slice(0,8)+'01',offset=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7,start=shiftCivilDate(first,-offset),today=singaporeNow().departureDate;
  dialog.querySelector('.calendar-heading strong').textContent=new Intl.DateTimeFormat('en-SG',{month:'long',year:'numeric',timeZone:'UTC'}).format(date);
  grid.innerHTML=Array.from({length:6},(_,week)=>`<div role="row">${Array.from({length:7},(_,day)=>{const value=shiftCivilDate(start,week*7+day);return `<button type="button" role="gridcell" data-date="${value}" aria-label="${civilDateLabel(value)}" aria-selected="${value===draft}" ${value===today?'aria-current="date"':''} tabindex="${value===draft?0:-1}" class="${value.slice(0,7)!==draft.slice(0,7)?'outside-month':''}">${Number(value.slice(8))}</button>`;}).join('')}</div>`).join('');
  dialog.querySelector('.calendar-selected').textContent=`Selected: ${civilDateLabel(draft)}`;
  for(const b of grid.querySelectorAll('[data-date]')){b.onclick=()=>{draft=b.dataset.date;paint(true);};b.onkeydown=e=>{const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(delta){e.preventDefault();draft=shiftCivilDate(draft,delta);}else if(['PageUp','PageDown'].includes(e.key)){e.preventDefault();draft=shiftCivilMonth(draft,(e.key==='PageUp'?-1:1)*(e.shiftKey?12:1));}else if(['Home','End'].includes(e.key)){e.preventDefault();const weekday=(new Date(draft+'T12:00:00Z').getUTCDay()+6)%7;draft=shiftCivilDate(draft,e.key==='Home'?-weekday:6-weekday);}else return;paint(true);};}
  if(focus)grid.querySelector('[tabindex="0"]').focus({preventScroll:true});
 }
 for(const b of dialog.querySelectorAll('[data-month]'))b.onclick=()=>{draft=shiftCivilMonth(draft,Number(b.dataset.month));paint();};
 for(const input of inputs){const button=document.createElement('button'),label=/deadline|arrival/i.test(input.name)?'arrival':'departure';button.type='button';button.className='date-picker-button time-picker-button';button.dataset.dateInput=input.name;button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',id);button.innerHTML=`<span></span>${icon('plan',22)}`;input.type='hidden';input.after(button);const c={input,button,label};controls.push(c);input.addEventListener('change',refresh);button.onclick=()=>{target=c;draft=validCivilDate(input.value)?input.value:singaporeNow().departureDate;dialog.returnValue='cancel';dialog.querySelector('h2').textContent=`Choose ${label} date`;paint();dialog.showModal();grid.querySelector('[tabindex="0"]').focus({preventScroll:true});};}
 dialog.addEventListener('cancel',()=>{dialog.returnValue='cancel';});dialog.addEventListener('close',()=>{if(disposed)return;if(dialog.returnValue==='apply'&&target){target.input.value=draft;target.input.dispatchEvent(new Event('change',{bubbles:true}));}refresh();if(target?.button.isConnected)target.button.focus({preventScroll:true});});
 function destroy(){if(disposed)return;disposed=true;target=null;if(dialog.open)dialog.close('cancel');dialog.remove();for(const {input,button} of controls){input.removeEventListener('change',refresh);input.type='date';button.remove();}mounted.delete(form);}
 const controller={refresh,destroy};mounted.set(form,controller);refresh();return controller;
}
