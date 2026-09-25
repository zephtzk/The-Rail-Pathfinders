import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapsWalkingUrl} from '../src/nebula-handoff.js';

test('fixed Google Maps walking URL encodes coordinates and sends nothing else', () => {
  const url = new URL(createMapsWalkingUrl({lat: 1.318, lng: 103.893, label: 'Station & #private-token?url=https://evil.test'}));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/dir/');
  assert.deepEqual([...url.searchParams], [['api', '1'], ['destination', '1.318,103.893'], ['travelmode', 'walking']]);
  assert.match(url.href, /1\.318%2C103\.893/);
  assert.equal(url.hash, '');
  assert.equal(url.username, '');
});
test('missing, coerced, nonfinite and out-of-range coordinates fail closed', () => {
  assert.equal(createMapsWalkingUrl(), null);
  for (const value of [undefined, null, '', '1.3', NaN, Infinity, -Infinity, {}, true]) {
    assert.equal(createMapsWalkingUrl({lat: value, lng: 103}), null);
    assert.equal(createMapsWalkingUrl({lat: 1, lng: value}), null);
  }
  for (const [lat,lng] of [[90.01,0],[-90.01,0],[0,180.01],[0,-180.01]]) assert.equal(createMapsWalkingUrl({lat,lng}), null);
  for (const [lat,lng] of [[90,180],[-90,-180],[0,0]]) assert.ok(createMapsWalkingUrl({lat,lng}));
});
