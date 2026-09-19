/** Original rounded, decorative UI icons. Give the containing control its accessible name. */
const paths = {
  wallet: '<rect x="3" y="5" width="18" height="15" rx="4"/><path d="M17 5V3H7a4 4 0 0 0-4 4m18 4h-5a3 3 0 0 0 0 6h5"/><circle cx="16" cy="14" r=".8" fill="currentColor" stroke="none"/>',
  plan: '<path d="M4 8.5 9 6l6 2.5L20 6v12l-5 2.5L9 18l-5 2.5z"/><path d="M9 6v12m6-9.5v12"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/>',
  route: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6h7a4 4 0 0 1 0 8h-7a4 4 0 0 0 0 8h3"/>',
  trip: '<rect x="5" y="3" width="14" height="16" rx="5"/><path d="M5 11h14M9 19l-2 3m8-3 2 3M10 6h4"/><circle cx="8.5" cy="15" r=".7" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15" r=".7" fill="currentColor" stroke="none"/>',
  bus: '<rect x="4" y="2" width="16" height="18" rx="3"/><rect x="6" y="6" width="12" height="6" rx="1"/><path d="M9 4h6M4 7H2v5m18-5h2v5M6 20v2h3v-2m6 0v2h3v-2"/><circle cx="7.5" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="16.5" cy="16" r="1" fill="currentColor" stroke="none"/>',
  saved: '<path d="M7 3.5h10A1.5 1.5 0 0 1 18.5 5v15L12 16l-6.5 4V5A1.5 1.5 0 0 1 7 3.5Z"/><path d="M9 8h6"/>',
  preferences: '<path d="M4 7h7m6 0h3M4 17h3m6 0h7"/><circle cx="14" cy="7" r="3"/><circle cx="10" cy="17" r="3"/>',
  location: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="var(--icon-fill,none)"/><path d="M12 2v3m10 7h-3m-7 10v-3M2 12h3"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  'arrow-right': '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  'arrow-left': '<path d="M20 12H5m6-6-6 6 6 6"/>',
  'arrow-up-right': '<path d="m6 18 12-12M7 6h11v11"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  'chevron-down': '<path d="m5 9 7 7 7-7"/>',
  'chevron-up': '<path d="m5 15 7-7 7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="4"/><path d="M8 3v4m8-4v4M4 11h16m-12 4h2m4 0h2"/>',
  walk: '<circle cx="14" cy="4" r="2"/><path d="m9 22 3-7-3-4 3-4 3 4 4 1m-13 2 2-5 4-2m0 8 4 3 1 4"/>',
  accessibility: '<circle cx="12" cy="4" r="2"/><path d="m4 8 8 2 8-2m-8 2v5m0 0-4 7m4-7 4 7"/>',
  toilet: '<path d="M7 10h13a7 7 0 0 1-7 7h-1a5 5 0 0 1-5-5V4H3v8m8 5-1 4h7l-2-4M7 4h3v6"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 7.5 9 7.5 9s7.5-4.5 7.5-9V6Z"/><path d="m8.5 11.5 2.5 2.5 4.5-4.5"/>',
  offline: '<path d="M3 3 21 21M6 6a11 11 0 0 1 15 2M3 8l1.2-.8M8 12a6 6 0 0 1 4-1.5m4 1.5 1 1M9 16a4 4 0 0 1 5 .1"/><circle cx="12" cy="20" r=".8" fill="currentColor" stroke="none"/>',
  online: '<path d="M3 8a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 16a4.5 4.5 0 0 1 6 0"/><circle cx="12" cy="20" r=".8" fill="currentColor" stroke="none"/>',
  alert: '<path d="m10.1 4.6-8 13.8A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-2.6l-8-13.8a2.2 2.2 0 0 0-3.8 0Z"/><path d="M12 9v5m0 3v.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  home: '<path d="m3 10 9-7 9 7M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M9 21v-7h6v7"/>',
  work: '<rect x="3" y="7" width="18" height="14" rx="4"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a24 24 0 0 0 18 0m-9 0v3"/>',
  heart: '<path d="M20.3 5.3a5 5 0 0 0-7 0L12 6.6l-1.3-1.3a5 5 0 0 0-7 7L12 21l8.3-8.7a5 5 0 0 0 0-7Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  swap: '<path d="M8 3v17m-4-4 4 4 4-4m4 5V4m-4 4 4-4 4 4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.5 10.5 7-4m-7 7 7 4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9.5 21h5"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-9 10 9 4.5 9-4.5m-18 5 9 4.5 9-4.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2 5.6-5.6 2 2-5.6Z"/>',
  star: '<path d="m12 3 2.9 5.8 6.4.9-4.6 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4-4.6-4.6 6.4-.9Z"/>',
  demo: '<rect x="3" y="4" width="18" height="16" rx="5"/><path d="m10 8 6 4-6 4Z"/>',
  leaf: '<path d="M20 3c-9-1-16 3-16 9a7 7 0 0 0 7 7c6 0 9-7 9-16Zm-15 17L16 9"/>',
  sparkles: '<path d="m14 3 2.5 6.5L23 12l-6.5 2.5L14 21l-2.5-6.5L5 12l6.5-2.5ZM4 3v4M2 5h4M3 17v4m-2-2h4"/>',
  calm: '<path d="M3 9c2-3 4-3 6 0s4 3 6 0 4-3 6 0M3 16c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>',
  fast: '<path d="M5 7h5M3 12h5m-3 5h5m4-14-3 10h6l-3 8 8-13h-6l2-5Z"/>',
  transfer: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 15.2A8.6 8.6 0 0 1 8.8 4 8.6 8.6 0 1 0 20 15.2Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8.5a3 3 0 0 1 6 0c0 2-3 2-3 4.5m0 4v.1"/>',
  volume: '<path d="M10 5 5 9H2v6h3l5 4Zm5 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  text: '<path d="M3 20 8 5l5 15M5 14h6m5 6 3-10 3 10m-5-4h4"/>',
  refresh: '<path d="M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5m-4 6a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/>',
};
const aliases = { train: 'trip', settings: 'preferences', bookmark: 'saved', navigation: 'compass', 'wifi-off': 'offline', wifi: 'online', comfortable: 'calm', destination: 'pin', edit: 'preferences', arrow: 'arrow-right' };

export function icon(name, size = 24) {
  const resolved = aliases[name] ?? name;
  const key = Object.hasOwn(paths, resolved) ? resolved : 'route';
  const dimension = Number.isFinite(Number(size)) ? Math.max(12, Math.min(96, Number(size))) : 24;
  return `<svg class="icon icon-${key}" width="${dimension}" height="${dimension}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[key]}</svg>`;
}

export const iconNames = Object.freeze(Object.keys(paths));
