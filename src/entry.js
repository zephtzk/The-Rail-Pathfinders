// Historical planners remain reachable for regression evidence; public entry points use one product.
if(new URLSearchParams(location.search).get('legacy')==='1') {
  const multimodal=location.pathname.includes('multimodal');
  await import(multimodal?'./multimodal-ui.js':'./rail-ui.js');
} else {
  document.querySelector('link[href="/src/rail.css"]')?.remove();
  const style=document.createElement('link');style.rel='stylesheet';style.href='/src/commute.css';document.head.append(style);
  const timeStyle=document.createElement('link');timeStyle.rel='stylesheet';timeStyle.href='/src/time-picker.css';document.head.append(timeStyle);
  const r5Style=document.createElement('link');r5Style.rel='stylesheet';r5Style.href='/src/r5.css';document.head.append(r5Style);
  const leaflet=document.createElement('link');leaflet.rel='stylesheet';leaflet.href='/vendor/leaflet.css';document.head.append(leaflet);
  await new Promise(resolve=>{const script=document.createElement('script');script.src='/vendor/leaflet.js';script.onload=resolve;script.onerror=resolve;document.head.append(script);});
  await import('./commute-ui.js');
}
