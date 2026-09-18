import {icon} from './icons.js';

let pickerCount = 0;

// Keep HH:MM civil values in the form; one accessible control owns each time.
export function mountTimePickers(form) {
  const id = `time-picker-${++pickerCount}`;
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'time-dialog';
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.innerHTML = `<form method="dialog"><h2 id="${id}-title">Choose a time</h2><p>Singapore time · scroll a column or use arrow keys.</p><div class="time-wheels"><div><span class="time-wheel-label">Hour</span><div class="time-wheel" role="listbox" aria-label="Hour"></div></div><div><span class="time-wheel-label">Minute</span><div class="time-wheel" role="listbox" aria-label="Minute"></div></div></div><div class="field-pair"><button value="cancel" class="secondary">Cancel</button><button value="apply" class="primary">Use this time</button></div></form>`;
  document.body.append(dialog);
  const wheels = [...dialog.querySelectorAll('.time-wheel')], controls = [];
  let target = null, chosen = [0, 0], opening = false;
  const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const rowHeight = wheel => wheel.children[0].getBoundingClientRect().height;

  function select(index, value, {scroll = false} = {}) {
    chosen[index] = value;
    const wheel = wheels[index];
    [...wheel.children].forEach((button, i) => {button.setAttribute('aria-selected', String(i === value));button.tabIndex = i === value ? 0 : -1;});
    if (scroll) wheel.scrollTop = value * rowHeight(wheel);
  }
  wheels.forEach((wheel, index) => {
    const count = index ? 60 : 24;
    for (let value = 0; value < count; value++) {
      const button = document.createElement('button');
      button.type = 'button';button.role = 'option';button.textContent = String(value).padStart(2, '0');
      button.onclick = () => select(index, value, {scroll: true});
      button.onkeydown = event => {
        if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {event.preventDefault();wheels[1 - index].children[chosen[1 - index]].focus({preventScroll: true});return;}
        if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const delta = ({ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5})[event.key];
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (chosen[index] + delta + count) % count;
        select(index, next, {scroll: true});wheel.children[next].focus({preventScroll: true});
      };
      wheel.append(button);
    }
    let timer;
    wheel.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!opening && dialog.open) select(index, Math.max(0, Math.min(count - 1, Math.round(wheel.scrollTop / rowHeight(wheel)))));
      }, 90);
    });
  });

  function refresh() {
    for (const {input, button, label} of controls) {
      const value = validTime(input.value) ? input.value : 'Choose time';
      button.querySelector('.time-value').textContent = value;
      button.setAttribute('aria-label', `Choose ${label} time${validTime(input.value) ? `, ${value} Singapore time` : ''}`);
    }
  }
  form.querySelectorAll('input[type=time]').forEach(input => {
    const button = document.createElement('button'), label = input.name === 'departureTime' ? 'departure' : 'arrival';
    button.type = 'button';button.className = 'time-picker-button';button.dataset.timeInput = input.name;
    button.setAttribute('aria-haspopup', 'dialog');button.setAttribute('aria-controls', id);
    button.innerHTML = `<span class="time-value"></span>${icon('clock', 22)}`;
    // Hidden input preserves saved route timing and FormData without a second editor.
    input.type = 'hidden';input.after(button);
    const control = {input, button, label};controls.push(control);
    input.addEventListener('change', refresh);
    button.onclick = () => {
      target = control;opening = true;dialog.returnValue = 'cancel';
      dialog.querySelector('h2').textContent = `Choose ${label} time`;
      const parts = (validTime(input.value) ? input.value : '12:00').split(':').map(Number);
      dialog.showModal();
      requestAnimationFrame(() => {parts.forEach((value, index) => select(index, value, {scroll: true}));opening = false;wheels[0].children[parts[0]].focus({preventScroll: true});});
    };
  });
  dialog.addEventListener('cancel', () => {dialog.returnValue = 'cancel';});
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'apply' && target) {
      target.input.value = chosen.map(value => String(value).padStart(2, '0')).join(':');
      target.input.dispatchEvent(new Event('change', {bubbles: true}));
    }
    refresh();target?.button.focus({preventScroll: true});
  });
  refresh();
  return {refresh};
}
