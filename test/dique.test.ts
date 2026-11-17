import assert from 'node:assert/strict';
import test from 'node:test';
import { DIQUE, diquePlanPoint, diqueRoadDistance, getCourse } from '../src/shared/courses.ts';
import { GRID_LANE_OFFSET } from '../src/shared/car-dimensions.ts';
import { NEUTRAL, defaultRaceConfig, type CarView, type Driver, type RaceImpact, type RaceSnapshot } from '../src/shared/protocol.ts';
import { TRACK, type TrackPoint } from '../src/shared/track.ts';
import { angleDifference } from '../src/sim/bot.ts';
import { LapProgress } from '../src/sim/progress.ts';
import { Race } from '../src/sim/race.ts';

const TICK = 1 / 60;
const parked: Driver = { owned: true, input: NEUTRAL };

function stepUntilResults(race: Race, drivers: readonly Driver[], maxSeconds: number, observe?: (state: RaceSnapshot) => void) {
  for (let frame = 0; frame < 60 * maxSeconds; frame++) {
    race.step(TICK, drivers);
    const state = race.snapshot();
    if (state.phase === 'results') return state;
    observe?.(state);
  }
  assert.fail('the Dique race did not finish');
}

test('the detour extends the Dique at the original scale and preserves both decks, tunnel and passing zones', () => {
  assert.equal(getCourse(), getCourse('taller'));
  assert.equal(getCourse('taller').sampleAt, TRACK.sampleAt);
  assert.equal(getCourse('dique'), DIQUE);
  const originalLength = TRACK.length * 4;
  assert.equal(diqueRoadDistance(143.43), 143.43);
  assert.equal(diqueRoadDistance(originalLength), DIQUE.length);
  const bypassLength = DIQUE.detour.to - DIQUE.detour.from;
  assert.ok(bypassLength > 112 && bypassLength < 125);
  assert.deepEqual(DIQUE.sampleAt(DIQUE.length), DIQUE.sampleAt(0));
  const high = DIQUE.sampleAt(DIQUE.crossing.upper);
  const low = DIQUE.sampleAt(DIQUE.crossing.lower);
  assert.ok(Math.hypot(high.x - low.x, high.z - low.z) < 0.04);
  assert.ok(Math.abs(high.s - diqueRoadDistance(369.45)) < 0.02);
  assert.ok(Math.abs(low.s - diqueRoadDistance(606.46)) < 0.02);
  assert.ok(Math.hypot(high.x - 17.2988, high.z + 80.63285) < 0.005);
  assert.equal(high.y, 4.8);
  assert.equal(low.y, -0.7);
  assert.ok(Math.abs(DIQUE.crossing.clearance - 4.9) < 1e-8);
  assert.equal(DIQUE.tunnel.to - DIQUE.tunnel.from, 52);
  assert.equal(DIQUE.tunnel.clearance, 2.75);
  assert.equal(DIQUE.roadHalfAt(high.s), 3);
  assert.equal(DIQUE.roadHalfAt(low.s), 3.2);
  assert.ok(Math.abs(DIQUE.locate(low.x, low.z, { y: high.y }).s - high.s) < 0.1);
  assert.ok(Math.abs(DIQUE.locate(high.x, high.z, low).s - low.s) < 0.1);
  assert.ok(Math.abs(DIQUE.locate(high.x, high.z, high).s - high.s) < 0.1);
  assert.equal(DIQUE.roadHalfAt(DIQUE.anchors.crane), 4.5);
  assert.equal(DIQUE.roadHalfAt(DIQUE.anchors.chicaneOut), 2.5);
  assert.equal(DIQUE.roadHalfAt(DIQUE.anchors.spillway), 4.4);
  assert.equal(DIQUE.roadHalfAt(DIQUE.anchors.maleconFirst), 4);
  assert.equal(DIQUE.bankAt(DIQUE.crossing.upper), 0);
  assert.equal(DIQUE.bankAt(DIQUE.crossing.lower), 0);
  assert.ok(Math.abs(DIQUE.bankAt(DIQUE.anchors.crane) - Math.tan(8 * Math.PI / 180)) < 1e-8);
  assert.ok(DIQUE.wetAt(DIQUE.anchors.crane, -1.5) > 0.95);
  assert.equal(DIQUE.wetAt(DIQUE.anchors.crane, 2.5), 0);

  const grades = DIQUE.samples.slice(1).map((point, i) => (point.y - DIQUE.samples[i].y) / (point.s - DIQUE.samples[i].s));
  assert.ok(Math.max(...grades) >= 0.112 && Math.max(...grades) <= 0.113);
  assert.ok(Math.min(...grades) >= -0.140 && Math.min(...grades) <= -0.138);
});

test('the longer bypass changes direction before and after the northern turn without folding its lanes', () => {
  const { from, to, apex } = DIQUE.detour;
  const approach = DIQUE.samples.filter(point => point.s > from && point.s < apex);
  const returnLane = DIQUE.samples.filter(point => point.s > apex && point.s < to);
  for (const lane of [approach, returnLane]) {
    const eastward = lane.findIndex(point => point.dx > 0.23);
    assert.ok(eastward > 0);
    assert.ok(lane.slice(0, eastward).some(point => point.dx < -0.23));
    assert.ok(lane.slice(eastward).some(point => point.dx < -0.23));
  }
  const north = diquePlanPoint(198.65, 56.35);
  const tip = DIQUE.sampleAt(apex);
  assert.ok(Math.hypot(tip.x - north.x, tip.z - north.z) < 0.20 && tip.y === 0);

  const path = DIQUE.samples.filter(point => point.s >= from && point.s <= to);
  for (let index = 1; index < path.length - 1; index++) {
    const point = path[index];
    const before = path[index - 1];
    const after = path[index + 1];
    const angle = Math.abs(Math.atan2(before.dx * after.dz - before.dz * after.dx, before.dx * after.dx + before.dz * after.dz));
    const wall = Math.max(DIQUE.wallHalfAt(point.s, -1), DIQUE.wallHalfAt(point.s, 1));
    assert.ok(angle * (wall + 0.54) < after.s - before.s, `inside barrier folds at ${point.s.toFixed(2)}`);
  }
});

test('the replacement joins the original plan and keeps the abandoned connector outside both drivable lanes', () => {
  const { from, to, apex, closedSamples } = DIQUE.detour;
  for (const [distance, rawX, rawZ] of [[from, 224, 112], [to, 180, 101]]) {
    const actual = DIQUE.sampleAt(distance);
    const expected = diquePlanPoint(rawX, rawZ);
    assert.ok(Math.hypot(actual.x - expected.x, actual.z - expected.z) < 0.004);
    assert.ok(actual.dx < -0.999 && Math.abs(actual.dz) < 0.035);
  }
  assert.equal(diqueRoadDistance(closedSamples[0].s), from);
  assert.ok(Math.abs(diqueRoadDistance(closedSamples[closedSamples.length - 1].s) - to) < 1e-9);
  assert.ok(apex > from && apex < to && DIQUE.checkpoints[1] === apex);
  for (const old of closedSamples.filter(point => point.s >= from + 22 && point.s <= from + 28)) {
    for (const hint of [undefined, { s: from, y: 0 }, { s: to, y: 0 }]) {
      const active = DIQUE.locate(old.x, old.z, hint);
      assert.ok(Math.abs(active.offset) > DIQUE.wallHalfAt(active.s, Math.sign(active.offset)) + 3);
    }
  }
});

test('the second bypass starts after the tunnel, follows the river to the outlet and rejoins the malecón', () => {
  const { from, apex, to, closedSamples } = DIQUE.treatmentDetour;
  assert.ok(from > DIQUE.tunnel.to && from < DIQUE.tunnel.to + 2);
  assert.ok(to - from > 165 && to - from < 190);
  assert.ok(apex > from && apex < to && DIQUE.checkpoints[3] === apex);
  assert.ok(Math.abs(diqueRoadDistance(closedSamples[0].s) - from) < 1e-8);
  assert.ok(Math.abs(diqueRoadDistance(closedSamples.at(-1)!.s) - to) < 1e-8);
  for (const [s, x, z] of [[from, 47.923, 53.226], [to, 18, 82]]) {
    const point = DIQUE.sampleAt(s);
    const marker = diquePlanPoint(x, z);
    assert.ok(Math.hypot(point.x - marker.x, point.z - marker.z) < 0.01);
  }
  const outlet = diquePlanPoint(74, 130);
  const pass = DIQUE.sampleAt(apex);
  assert.ok(Math.hypot(pass.x - outlet.x, pass.z - outlet.z) < 6);
  const lane = DIQUE.samples.filter(point => point.s >= from && point.s <= to);
  for (let i = 1; i < lane.length - 1; i++) {
    const { s } = lane[i];
    const a = lane[i - 1], b = lane[i + 1];
    const angle = Math.abs(Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz));
    assert.ok(angle * (DIQUE.wallHalfAt(s, 1) + 0.55) < b.s - a.s, `inside barrier folds at ${s}`);
  }
});

test('driving the closed connector instead of reaching the bypass apex cannot score a lap', () => {
  const { from, to, closedSamples } = DIQUE.detour;
  const progress = new LapProgress(-0.8, DIQUE);
  let previous = DIQUE.sampleAt(-0.8);
  function advance(point: TrackPoint) {
    progress.advance(previous, point, true);
    previous = point;
  }
  function follow(from: number, to: number) {
    const steps = Math.ceil((to - from) / 0.21);
    for (let index = 1; index <= steps; index++) advance(DIQUE.sampleAt(from + (to - from) * index / steps));
  }
  follow(-0.8, from);
  assert.equal(progress.checkpoint, 0);
  for (const old of closedSamples.slice(1)) {
    const active = DIQUE.locate(old.x, old.z, { s: previous.s, y: previous.y });
    advance({ ...old, s: active.s });
  }
  follow(to, DIQUE.length + 0.35);
  assert.equal(progress.checkpoint, 0);
  assert.equal(progress.lap, 0);
});

test('the direct route from the tunnel to the malecón cannot skip the outlet checkpoint', () => {
  const { from, to, closedSamples } = DIQUE.treatmentDetour;
  const progress = new LapProgress(-0.8, DIQUE);
  let previous = DIQUE.sampleAt(-0.8);
  function advance(point: TrackPoint) {
    progress.advance(previous, point, true);
    previous = point;
  }
  for (let s = -0.6; s < from; s += 0.2) advance(DIQUE.sampleAt(s));
  assert.equal(progress.checkpoint, 2);
  const closure = closedSamples.find(p => p.s > 651.4)!;
  const nearest = DIQUE.locate(closure.x, closure.z);
  assert.ok(Math.abs(nearest.offset) - DIQUE.wallHalfAt(nearest.s, Math.sign(nearest.offset)) > 5);
  for (const old of closedSamples) {
    const active = DIQUE.locate(old.x, old.z, { s: previous.s, y: previous.y });
    advance({ ...old, s: active.s });
  }
  for (let s = to; s <= DIQUE.length + 1; s += 0.2) advance(DIQUE.sampleAt(s));
  assert.equal(progress.checkpoint, 2);
  assert.equal(progress.lap, 0);
});

test('full throttle into the closed connector meets the live barrier and the driver can regain speed', () => {
  const race = new Race({ manual: true });
  race.configure({ ...defaultRaceConfig, course: 'dique', laps: 1, bots: 0 });
  race.launch();
  const { from, apex, closedSamples } = DIQUE.detour;
  const oldAim = closedSamples[Math.floor(closedSamples.length / 2)];
  let entry: CarView | undefined;
  for (let frame = 0; frame < 60 * 55; frame++) {
    race.step(TICK, [{ owned: true, input: null }]);
    const state = race.snapshot();
    const car = state.cars[0];
    if (state.phase === 'race' && Math.abs(car.distance! - from) < 1) {
      entry = car;
      break;
    }
  }
  assert.ok(entry && entry.speed > 7);
  assert.ok(Math.abs(angleDifference(entry.yaw - Math.atan2(oldAim.x - entry.x, oldAim.z - entry.z))) < 0.14);

  let barrier: RaceImpact | undefined;
  for (let frame = 0; frame < 60 * 4 && !barrier; frame++) {
    race.step(TICK, [{ owned: true, input: { x: 0, gas: true, brake: false } }]);
    barrier = race.snapshot().impacts?.find(hit => (hit.kind === 'wall' || hit.kind === 'fence') && hit.side === -1 &&
      hit.distance !== undefined && hit.distance >= from && hit.distance < apex);
  }
  assert.ok(barrier && barrier.strength > 0.3);
  const touched = race.snapshot().cars[0];
  assert.ok(touched.distance! < apex && touched.lap === 0 && touched.sectorTimes?.[0] === null);

  for (let frame = 0; frame < 12; frame++) race.step(TICK, [parked]);
  const released = race.snapshot().cars[0];
  let recoveredFrames = 0;
  for (let frame = 0; frame < 150; frame++) {
    const car = race.snapshot().cars[0];
    if (car.distance! > touched.distance! + 8 && car.speed > released.speed + 2) recoveredFrames++;
    const road = DIQUE.locate(car.x, car.z, { s: car.distance, y: car.y });
    assert.ok(Math.abs(road.offset) < DIQUE.wallHalfAt(road.s, Math.sign(road.offset)));
    const aim = DIQUE.sampleAt(road.s + 1.95 + Math.max(0, car.speed) * 0.213);
    const heading = Math.atan2(aim.x - car.x, aim.z - car.z);
    const steer = Math.max(-1, Math.min(1, angleDifference(car.yaw - heading) * 2.2));
    race.step(TICK, [{ owned: true, input: { x: steer, gas: true, brake: false } }]);
  }
  const recovered = race.snapshot().cars[0];
  assert.ok(recoveredFrames >= 12, 'regain speed for at least 0.2 s before the next turn');
  assert.ok(recovered.distance! > touched.distance! + 15 && recovered.distance! < apex);
  assert.equal(recovered.sectorTimes?.[0], null);
});

test('a Dique practice session parks four drivers and can switch back to Taller cleanly', () => {
  const race = new Race({ manual: true });
  assert.equal(race.configure({ ...defaultRaceConfig, course: 'dique', mode: 'practice', bots: 0 }), true);
  assert.equal(race.snapshot().config?.course, 'dique');
  assert.equal(race.launch(), true);
  race.step(TICK, [parked, parked, parked, parked]);
  const practice = race.snapshot();
  assert.equal(practice.phase, 'practice');
  for (const [i, car] of practice.cars.entries()) {
    assert.equal(car.pitReady, true);
    assert.ok(Math.abs(car.distance! - DIQUE.pit.stalls[i]) < 0.05);
  }

  race.returnToDemo();
  assert.equal(race.configure({ ...defaultRaceConfig, course: 'taller' }), true);
  const newCourse = race.snapshot();
  assert.equal(newCourse.config?.course, 'taller');
  assert.equal(newCourse.phase, 'demo');
  assert.equal(newCourse.heat, practice.heat);
  assert.ok(newCourse.cars.every(car => car.distance! < TRACK.length && car.lap === 0 && !car.pitReady));
});

test('a sole Dique driver can change car without leaving the stopped pit position', () => {
  const race = new Race({ manual: true });
  race.configure({ ...defaultRaceConfig, course: 'dique', mode: 'practice', bots: 0 });
  race.launch();
  race.step(TICK, [parked]);
  const before = race.snapshot().cars[0];
  assert.equal(race.swapPracticeCar(0, 1), true);
  race.step(TICK, [undefined, parked]);
  const after = race.snapshot().cars[1];
  assert.equal(after.pitReady, true);
  assert.deepEqual([after.x, after.y, after.z, after.distance], [before.x, before.y, before.z, before.distance]);
});

test('the fourth pit stall connects to the dock straight without losing pit speed protection', () => {
  const race = new Race({ manual: true });
  const drivers = [parked, parked, parked, parked];
  race.configure({ ...defaultRaceConfig, course: 'dique', mode: 'practice', bots: 0 });
  race.launch();
  race.step(TICK, drivers);
  let peakPitSpeed = 0;
  let enteredTrack = false;
  for (let frame = 0; frame < 60 * 14; frame++) {
    const car = race.snapshot().cars[3];
    const current = DIQUE.locate(car.x, car.z, { s: car.distance, y: car.y });
    if (DIQUE.isPitLane(current.s, current.offset)) peakPitSpeed = Math.max(peakPitSpeed, car.speed);
    if (current.s > DIQUE.pit.exit + 3) {
      enteredTrack = Math.abs(current.offset) < DIQUE.roadHalfAt(current.s) && car.speed > DIQUE.pit.speedLimit;
      break;
    }
    const aim = DIQUE.sampleAt(current.s + 4);
    const blend = Math.max(0, Math.min(1, (aim.s - 100) / 16));
    const merge = blend * blend * (3 - 2 * blend);
    const offset = DIQUE.pit.offset + (GRID_LANE_OFFSET - DIQUE.pit.offset) * merge;
    const yaw = Math.atan2(aim.x - aim.dz * offset - car.x, aim.z + aim.dx * offset - car.z);
    const steer = Math.max(-1, Math.min(1, (car.yaw - yaw) * 1.8));
    drivers[3] = { owned: true, input: { x: steer, gas: true, brake: false } };
    race.step(TICK, drivers);
    assert.equal(race.snapshot().impacts, undefined);
  }
  assert.equal(peakPitSpeed, DIQUE.pit.speedLimit);
  assert.ok(enteredTrack);
});

const racePaces = [['rookie', 95, 110], ['club', 80, 94], ['pro', 74, 87]] as const;
for (const [difficulty, fastest, slowest] of racePaces) {
  test(`four ${difficulty} Dique drivers finish through both mandatory bypasses and both decks`, () => {
    const race = new Race({ manual: true });
    const drivers: Driver[] = [{ owned: true, input: null }];
    assert.equal(race.configure({ ...defaultRaceConfig, course: 'dique', laps: 1, difficulty }), true);
    assert.equal(race.launch(), true);
    const passages = Array.from({ length: 4 }, () => new Set<number>());
    const markers = [[DIQUE.detour.from, 0], [DIQUE.detour.apex, 0], [DIQUE.detour.to, 0],
      [DIQUE.crossing.upper, 4.8], [DIQUE.crossing.lower, -0.7],
      ...(['from', 'apex', 'to'] as const).map(key => {
        const station = DIQUE.treatmentDetour[key];
        return [station, DIQUE.sampleAt(station).y];
      })];
    const finish = stepUntilResults(race, drivers, 145, state => {
      if (state.phase !== 'race') return;
      for (const [slot, car] of state.cars.entries()) {
        for (const [distance, height] of markers) {
          if (Math.abs(car.distance! - distance) >= 1) continue;
          assert.ok(Math.abs(car.y - height) < 0.035);
          passages[slot].add(distance);
        }
      }
    });
    assert.deepEqual(finish.cars.map(car => car.lap), [1, 1, 1, 1]);
    assert.deepEqual(passages.map(markers => markers.size), [8, 8, 8, 8]);
    assert.ok(finish.results?.every(entry => entry.time !== null && entry.bestLap! >= fastest && entry.bestLap! <= slowest));
    assert.ok(finish.cars.every(car => car.sectorTimes?.length === 4));
  });
}

test('the wet inside line uses about 82 percent of the dry line’s tire grip', async () => {
  const { CAR_DIMENSIONS } = await import('../src/shared/car-dimensions.ts');
  const { tireLoad } = await import('../src/sim/road-contact.ts');
  const at = DIQUE.sampleAt(DIQUE.anchors.crane);
  const dry = tireLoad({ ...at, offset: GRID_LANE_OFFSET * 2.5 }, CAR_DIMENSIONS[0], 1, 0, DIQUE);
  const wet = tireLoad({ ...at, offset: -GRID_LANE_OFFSET * 1.8 }, CAR_DIMENSIONS[0], 1, 0, DIQUE);
  assert.equal(dry.grip, 1);
  assert.ok(wet.grip >= 0.82 && wet.grip < 0.85);
});
