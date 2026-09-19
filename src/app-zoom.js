/** Keep page scale fixed while Leaflet handles zoom within each map. */
export function installAppZoomGuard(doc = document) {
  if (doc.documentElement.dataset.zoomGuard === 'on') return;
  doc.documentElement.dataset.zoomGuard = 'on';
  const inMap = target => Boolean(target?.closest?.('.leaflet-container'));
  const cancel = event => { if (event.cancelable) event.preventDefault(); };
  // Trackpad pinch is delivered as Ctrl+wheel. Cancelling browser scale does
  // not stop propagation, so Leaflet still receives and handles map wheels.
  doc.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) cancel(event);
  }, {capture: true, passive: false});
  doc.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) &&
        ['+', '=', '-', '_', '0', 'Add', 'Subtract'].includes(event.key)) cancel(event);
  }, {capture: true});
  doc.addEventListener('touchmove', event => {
    if (event.touches.length > 1 && !inMap(event.target)) cancel(event);
  }, {capture: true, passive: false});
  // Safari's proprietary gesture events scale the page independently of
  // Leaflet's touch handlers. Prevent that default without stopping touches.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    doc.addEventListener(type, cancel, {capture: true, passive: false});
  }
}
if (typeof document !== 'undefined') installAppZoomGuard();
