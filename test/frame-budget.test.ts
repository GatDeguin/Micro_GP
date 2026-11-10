import assert from 'node:assert/strict';
import test from 'node:test';
import { frameBudget } from '../src/display/frame-budget.ts';

test('adaptive graphics reduce sustained load and leave enough time before raising quality', () => {
  const budget = frameBudget();
  let now = 10;
  budget.reset(now);
  const frames = (count: number, duration: number) => {
    for (let i = 0; i < count; i++) budget.sample(now += duration, duration);
  };
  frames(37, 1000 / 30);
  assert.equal(budget.scale, 0.86);
  frames(360, 1000 / 60);
  assert.equal(budget.scale, 0.86);
  frames(1500, 1000 / 60);
  assert.equal(budget.scale, 1);
});

test('an isolated frame drop or a background pause does not lower resolution', () => {
  const budget = frameBudget();
  budget.reset(10);
  budget.sample(1200, 1190);
  for (let i = 1; i <= 150; i++) budget.sample(1200 + i * 1000 / 60, i === 4 ? 34 : 1000 / 60);
  assert.equal(budget.scale, 1);
});
