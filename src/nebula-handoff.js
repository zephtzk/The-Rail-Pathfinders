/** A user-click directions link, never a route acceptance or progress action.
 * label is deliberately display-only: Maps directions accepts coordinates, not
 * an undocumented coordinate-plus-label syntax. No tokens or origin are sent. */
export function createMapsWalkingUrl({lat, lng, label} = {}) {
  if (typeof lat !== 'number' || typeof lng !== 'number' ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const url = new URL('https://www.google.com/maps/dir/');
  url.search = new URLSearchParams({api: '1', destination: `${lat},${lng}`, travelmode: 'walking'}).toString();
  return url.href;
}
