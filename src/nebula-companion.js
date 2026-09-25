/**
 * Web-only Nebula companion. Import nebula-companion.css once in the app.
 * The caller MUST supply an origin/candidate-specific storageKey. Only the
 * enabled/dock preferences are persisted; no trip or notice data is stored.
 * See docs/companion/UI-HANDOFF.md for the synchronous Settings/context API.
 */
const DESTINATIONS = Object.freeze([
  ['disruptions', 'Disruptions', '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.1"/>'],
  ['facilities', 'Facilities', '<path d="M8 21V3h8v18M5 21h14M10 7h4m-4 4h4m-4 4h4"/>'],
  ['caregiver', 'Caregiver', '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-4 4 1 10 8 15 7-5 12-11 8-15Z"/>'],
  ['spending', 'Spending', '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18m-6 4h6m-5 3h1"/>'],
  ['staff', 'Show to staff', '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M6 16c0-3 6-3 6 0m3-6h3m-3 4h3"/>'],
]);
let nextId = 0;

function preferences(value) {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : true,
    dock: value?.dock === 'left' ? 'left' : 'right',
  };
}

function parsePreferences(value) {
  try { return preferences(JSON.parse(value)); } catch { return preferences(null); }
}

function normalizeNotice(notice) {
  if (!notice || typeof notice.label !== 'string' || !notice.label.trim()
    || !['live', 'demo', 'stale'].includes(notice.source)) return null;
  return {
    label: notice.label.trim(),
    severity: ['warning', 'critical'].includes(notice.severity) ? notice.severity : 'info',
    source: notice.source,
  };
}

/**
 * @param {{host:Element,onNavigate:(destination:string)=>void,storageKey:string}} options
 * @returns {{update:Function,destroy:Function,getState:Function,setEnabled:Function,setDock:Function,subscribe:Function}}
 */
export function mountNebulaCompanion({ host, onNavigate, storageKey } = {}) {
  if (!host?.ownerDocument || typeof host.append !== 'function') throw new TypeError('A companion host element is required.');
  if (typeof onNavigate !== 'function') throw new TypeError('onNavigate must be a function.');
  if (typeof storageKey !== 'string' || !storageKey.trim()) throw new TypeError('An explicit candidate-specific storageKey is required.');
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  let storage = null;
  let persistent = true;
  let state = preferences(null);
  try { storage = win.localStorage; state = parsePreferences(storage.getItem(storageKey)); }
  catch { persistent = false; }
  let expanded = false;
  let destroyed = false;
  let notice = null;
  let dismissedNoticeKey = null;
  let context = { suppressed: false, keyboardOpen: false, dialogOpen: false, bottomInset: 88 };
  const subscribers = new Set();
  const removeListeners = [];
  const actionsId = `nebula-companion-actions-${++nextId}`;
  const root = doc.createElement('aside');
  root.className = 'nebula-companion';
  root.setAttribute('aria-label', 'Nebula web companion');
  // All interpolated markup is static module-owned content. Notices use textContent.
  root.innerHTML = `
    <div class="nebula-companion__shelf" hidden>
      <div class="nebula-companion__notice" hidden>
        <div class="nebula-companion__notice-copy" role="status" aria-live="polite" aria-atomic="true">
          <strong class="nebula-companion__source"></strong><span class="nebula-companion__message"></span>
        </div>
        <button type="button" class="nebula-companion__dismiss" data-nebula-action="dismiss" aria-label="Dismiss this notice">×</button>
      </div>
      <div id="${actionsId}" class="nebula-companion__expanded" hidden>
        <div class="nebula-companion__actions" role="group" aria-label="Companion actions">
          ${DESTINATIONS.map(([id, label, path]) => `<button type="button" class="nebula-companion__action" data-nebula-action="${id}"><span class="nebula-companion__icon"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg></span><span class="nebula-companion__action-label">${label}</span></button>`).join('')}
        </div>
        <div class="nebula-companion__preferences" role="group" aria-label="Companion preferences">
          <button type="button" data-nebula-action="dock">Move left</button>
          <button type="button" data-nebula-action="disable">Turn off Nebula</button>
        </div>
      </div>
    </div>
    <button type="button" class="nebula-companion__toggle" data-nebula-action="toggle" aria-expanded="false" aria-controls="${actionsId}" aria-label="Open Nebula companion"><img src="${new URL('../icon.svg', import.meta.url).href}" width="64" height="64" alt="" draggable="false"><span>Nebula <span class="nebula-companion__chevron" aria-hidden="true">＋</span></span></button>
    <button type="button" class="nebula-companion__enable" data-nebula-action="enable" hidden>Enable Nebula</button>`;
  host.append(root);
  const find = selector => root.querySelector(selector);
  const shelf = find('.nebula-companion__shelf');
  const expandedArea = find('.nebula-companion__expanded');
  const toggle = find('[data-nebula-action="toggle"]');
  const enable = find('[data-nebula-action="enable"]');
  const dock = find('[data-nebula-action="dock"]');
  const noticeElement = find('.nebula-companion__notice');
  const sourceElement = find('.nebula-companion__source');
  const messageElement = find('.nebula-companion__message');

  function getState() { return Object.freeze({ ...state, expanded, persistent }); }
  function emit() { const snapshot = getState(); for (const listener of subscribers) listener(snapshot); }
  function listen(target, event, listener, options) {
    target?.addEventListener(event, listener, options);
    removeListeners.push(() => target?.removeEventListener(event, listener, options));
  }
  function save() {
    try { if (!storage) throw new Error('Storage unavailable'); storage.setItem(storageKey, JSON.stringify({ version: 1, ...state })); persistent = true; }
    catch { persistent = false; }
  }
  function editing() {
    const active = doc.activeElement;
    return active && !root.contains(active) && !!active.closest('textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"])');
  }
  function modalOpen() {
    return [...doc.querySelectorAll('dialog[open],[aria-modal="true"]')].some(el => !root.contains(el) && !el.hidden && el.getClientRects().length > 0 && win.getComputedStyle(el).visibility !== 'hidden');
  }
  function excluded() {
    const viewport = win.visualViewport;
    const keyboard = viewport && viewport.scale <= 1.05 && win.innerHeight - viewport.height > 140;
    return context.suppressed || context.keyboardOpen || context.dialogOpen || editing() || modalOpen() || keyboard;
  }
  function render() {
    if (destroyed) return;
    const hidden = !!excluded();
    const wasExpanded = expanded;
    if (hidden || !state.enabled) expanded = false;
    root.hidden = hidden;
    root.dataset.dock = state.dock;
    root.dataset.expanded = String(expanded);
    root.style.setProperty('--nebula-bottom-inset', `${context.bottomInset}px`);
    toggle.hidden = !state.enabled;
    enable.hidden = state.enabled;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Close Nebula companion' : 'Open Nebula companion');
    find('.nebula-companion__chevron').textContent = expanded ? '−' : '＋';
    dock.textContent = state.dock === 'right' ? 'Move left' : 'Move right';
    expandedArea.hidden = !expanded;
    const visibleNotice = state.enabled && notice && JSON.stringify(notice) !== dismissedNoticeKey;
    noticeElement.hidden = !visibleNotice;
    shelf.hidden = !state.enabled || (!expanded && !visibleNotice);
    // Avoid duplicate polite announcements when unrelated app state changes.
    const source = notice ? { live: 'Live update', demo: 'Demo notice', stale: 'Stale information' }[notice.source] : '';
    if (sourceElement.textContent !== source) sourceElement.textContent = source;
    if (messageElement.textContent !== (notice?.label ?? '')) messageElement.textContent = notice?.label ?? '';
    noticeElement.dataset.source = notice?.source ?? '';
    noticeElement.dataset.severity = notice?.severity ?? '';
    if (wasExpanded !== expanded) emit();
  }
  function focusTrigger() { if (!root.hidden) (state.enabled ? toggle : enable).focus({ preventScroll: true }); }
  function collapse({ returnFocus = false } = {}) {
    if (!expanded || destroyed) return;
    expanded = false;
    render();
    if (returnFocus) focusTrigger();
    emit();
  }
  function setEnabled(value) {
    if (typeof value !== 'boolean') throw new TypeError('enabled must be a boolean.');
    if (destroyed || state.enabled === value) return getState();
    const hadFocus = root.contains(doc.activeElement);
    state.enabled = value;
    expanded = false;
    save(); render();
    if (hadFocus) focusTrigger();
    emit();
    return getState();
  }
  function setDock(value) {
    if (!['left', 'right'].includes(value)) throw new TypeError('dock must be left or right.');
    if (destroyed || state.dock === value) return getState();
    state.dock = value;
    save(); render(); emit();
    return getState();
  }
  function update(next = {}) {
    if (destroyed) return;
    if (Object.hasOwn(next, 'notice')) {
      const nextNotice = normalizeNotice(next.notice);
      if (JSON.stringify(nextNotice) !== JSON.stringify(notice)) dismissedNoticeKey = null;
      notice = nextNotice;
    }
    for (const key of ['suppressed', 'keyboardOpen', 'dialogOpen']) if (Object.hasOwn(next, key)) context[key] = next[key] === true;
    if (Object.hasOwn(next, 'bottomInset') && Number.isFinite(next.bottomInset)) context.bottomInset = Math.max(0, Math.min(400, next.bottomInset));
    render();
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function.');
    if (destroyed) return () => {};
    subscribers.add(listener);
    listener(getState());
    return () => subscribers.delete(listener);
  }

  listen(root, 'click', event => {
    const button = event.target.closest('button[data-nebula-action]');
    if (!button || !root.contains(button) || root.hidden) return;
    const action = button.dataset.nebulaAction;
    if (action === 'toggle') {
      expanded = !expanded;
      render(); emit();
      if (expanded && event.detail === 0) find('[data-nebula-action="disruptions"]').focus({ preventScroll: true });
    } else if (action === 'enable') setEnabled(true);
    else if (action === 'disable') setEnabled(false);
    else if (action === 'dock') setDock(state.dock === 'right' ? 'left' : 'right');
    else if (action === 'dismiss') {
      dismissedNoticeKey = notice ? JSON.stringify(notice) : null;
      render(); focusTrigger();
    } else if (expanded && DESTINATIONS.some(([id]) => id === action)) {
      collapse({ returnFocus: true });
      onNavigate(action);
    }
  });
  listen(root, 'keydown', event => {
    if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); collapse({ returnFocus: true }); }
    // Native Tab order is retained; never trap focus in this non-modal control.
    if (event.target === toggle && event.key === 'ArrowUp' && !expanded) {
      event.preventDefault(); expanded = true; render(); emit();
      find('[data-nebula-action="disruptions"]').focus({ preventScroll: true });
    }
  });
  listen(doc, 'pointerdown', event => { if (!root.contains(event.target)) collapse(); }, { passive: true });
  listen(doc, 'focusin', event => { if (!root.contains(event.target)) collapse(); render(); });
  listen(doc, 'focusout', () => { queueMicrotask(() => { if (!destroyed) render(); }); });
  listen(win.visualViewport, 'resize', render, { passive: true });
  listen(win, 'storage', event => {
    if (event.key !== storageKey || (event.storageArea && event.storageArea !== storage)) return;
    const hadFocus = root.contains(doc.activeElement);
    const wasEnabled = state.enabled;
    state = parsePreferences(event.newValue);
    render();
    if (hadFocus && state.enabled !== wasEnabled) focusTrigger();
    emit();
  });
  // Attribute/child-list observation catches native and app dialogs without a
  // poller. Ignore our own DOM, so render cannot create an observer loop.
  const observer = new win.MutationObserver(records => {
    if (!destroyed && records.some(record => !root.contains(record.target))) render();
  });
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'aria-modal', 'hidden'] });
  render();
  return Object.freeze({
    update, getState, setEnabled, setDock, subscribe,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const remove of removeListeners) remove();
      observer.disconnect(); subscribers.clear(); root.remove();
    },
  });
}
