import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lobbyCameraTour } from '../src/display/camera-tour.ts';

test('the lobby visits every camera at four-second boundaries and restarts after manual selection', () => {
  const camera = lobbyCameraTour();
  assert.equal(camera(100, 'demo', 'general', 0, 'dique'), 'general');
  assert.equal(camera(4099, 'demo', 'general', 0, 'dique'), 'general');
  assert.equal(camera(4100, 'demo', 'general', 0, 'dique'), 'chase');
  assert.equal(camera(8100, 'demo', 'general', 0, 'dique'), 'trackside');
  assert.equal(camera(12100, 'demo', 'general', 0, 'dique'), 'broadcast');
  assert.equal(camera(16100, 'demo', 'general', 0, 'dique'), 'general');
  assert.equal(camera(17000, 'demo', 'trackside', 1, 'dique'), 'trackside');
  assert.equal(camera(20999, 'demo', 'trackside', 1, 'dique'), 'trackside');
  assert.equal(camera(21000, 'demo', 'trackside', 1, 'dique'), 'broadcast');
});

test('playing, results and course changes keep the chosen camera and restart the lobby interval', () => {
  const camera = lobbyCameraTour();
  camera(0, 'demo', 'chase', 0, 'dique');
  for (const phase of ['grid', 'race', 'practice', 'results'] as const) {
    assert.equal(camera(12000, phase, 'chase', 0, 'dique'), 'chase');
  }
  assert.equal(camera(15000, 'demo', 'chase', 0, 'dique'), 'chase');
  assert.equal(camera(19000, 'demo', 'chase', 0, 'dique'), 'trackside');
  assert.equal(camera(19500, 'demo', 'chase', 0, 'spaceport'), 'chase');
});
