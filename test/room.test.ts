import assert from "node:assert/strict";
import test from "node:test";
import { selectOrigin } from "../server/origin.ts";
import { Seats } from "../server/seats.ts";
import { Room } from "../server/room.ts";
import type { CarView } from "../src/shared/protocol.ts";

const accelerate = { type: "input", seq: 1, x: 0.4, gas: true, brake: false };

test("selects a private LAN address and refuses loopback for the QR", () => {
  assert.equal(selectOrigin(4173, undefined, ["169.254.1.4", "192.168.1.38"]), "http://192.168.1.38:4173");
  assert.equal(selectOrigin(4173, "https://circuito.example", []), "https://circuito.example");
  assert.throws(() => selectOrigin(4173, "http://127.0.0.2:4173", []), /PUBLIC_ORIGIN/);
  assert.throws(() => selectOrigin(4173, "http://[::ffff:127.0.0.1]:4173", []), /PUBLIC_ORIGIN/);
  assert.throws(() => selectOrigin(4173, "https://circuito.example/mando", []), /PUBLIC_ORIGIN/);
});

test("four controllers get distinct seats and the fifth leaves the race alone", () => {
  const seats = new Seats<string>();
  const joins = ["a", "b", "c", "d"].map((peer) => seats.join(peer, undefined, 100));
  assert.deepEqual(joins.map((join) => join?.slot), [0, 1, 2, 3]);
  assert.equal(new Set(joins.map((join) => join?.key)).size, 4);
  assert.equal(seats.join("e", undefined, 110), null);
});

test("takeover restores the same car and retires the previous socket and inputs", () => {
  const seats = new Seats<string>();
  const first = seats.join("old", undefined, 0)!;
  assert.equal(seats.receive(first.slot, "old", accelerate, 100), true);
  assert.equal(seats.drivers(100)[0]?.input?.gas, true);
  const next = seats.join("new", first.key, 110)!;
  assert.equal(next.slot, first.slot);
  assert.equal(next.previous, "old");
  seats.disconnect(first.slot, "old", 120);
  assert.equal(seats.receive(first.slot, "old", { ...accelerate, seq: 2 }, 120), false);
  assert.equal(seats.drivers(120)[0]?.input?.gas, false);
  assert.equal(seats.receive(first.slot, "new", accelerate, 130), true);
});

test("stale and malformed controls cannot keep a seat accelerating", () => {
  const seats = new Seats<string>();
  seats.join("a", undefined, 0);
  assert.equal(seats.receive(0, "a", accelerate, 50), true);
  assert.equal(seats.receive(0, "a", { ...accelerate, x: 2, seq: 2 }, 80), false);
  assert.equal(seats.receive(0, "a", accelerate, 280), false);
  assert.deepEqual(seats.drivers(300)[0], { input: { x: 0, gas: false, brake: false }, owned: true });
  assert.deepEqual(seats.drivers(1050)[0], { input: null, owned: true });
  assert.equal(seats.drivers(15050)[0], undefined);
});

test("disconnect clears controls and reserves the same car for 15 seconds", () => {
  const seats = new Seats<string>();
  const join = seats.join("a", undefined, 0)!;
  seats.receive(0, "a", accelerate, 10);
  seats.disconnect(0, "a", 15);
  assert.equal(seats.drivers(20)[0]?.input?.gas, false);
  assert.equal(seats.join("b", join.key, 15014)?.slot, join.slot);
  assert.equal(seats.drivers(30014)[0], undefined);
});

test("only the local host can configure or launch a ready grid", () => {
  const room = new Room<string>();
  room.addDisplay("viewer", false);
  room.addDisplay("host", true);
  room.addDisplay("backup", true);
  assert.equal(room.isHost("viewer"), false);
  assert.equal(room.isHost("host"), true);
  assert.equal(room.isHost("backup"), false);
  const config = { laps: 5, bots: 0, difficulty: "pro", mode: "race", night: true };
  assert.ok(room.control("viewer", { type: "configure", config }, 0));
  assert.ok(room.control("host", { type: "configure", config: { ...config, laps: -1 } }, 0));
  assert.equal(room.control("host", { type: "configure", config }, 0), null);
  assert.deepEqual(room.lobby().config, config);
  const first = room.join("a", undefined, 1)!;
  assert.ok(room.control("host", { type: "launch" }, 2));
  assert.equal(room.snapshot().phase, "demo");
  assert.equal(room.ready(first.slot, "a", true, 3), null);
  assert.ok(room.control("viewer", { type: "launch" }, 4));
  room.removeDisplay("host");
  assert.equal(room.control("backup", { type: "launch" }, 5), null);
  room.step(1 / 60, 5);
  assert.equal(room.snapshot().phase, "grid");
  assert.equal(room.snapshot().config?.laps, 5);
  assert.deepEqual(room.snapshot().order, [0]);
  assert.ok(room.control("backup", { type: "configure", config }, 6));
  assert.equal(room.join("new", undefined, 7), null);
});

test("car reservations survive reconnect and lock choices when the host launches", () => {
  const room = new Room<string>();
  room.addDisplay("host", true);
  const first = room.join("a", undefined, 0)!;
  const second = room.join("b", undefined, 0)!;
  assert.ok(room.select(first.slot, "a", 1, "original", 1));
  assert.ok(room.select(first.slot, "a", 3, "clean", 1));
  assert.equal(room.ready(first.slot, "a", true, 2), null);
  assert.equal(room.select(first.slot, "a", 3, "original", 3), null);
  assert.equal(room.lobby().slots[0], null);
  assert.equal(room.lobby().slots[3]?.ready, false);
  room.ready(first.slot, "a", true, 4);
  room.ready(second.slot, "b", true, 4);
  assert.equal(room.lobby().canLaunch, true);
  room.disconnect(first.slot, "a", 5);
  assert.equal(room.lobby().canLaunch, false);
  assert.ok(room.select(second.slot, "b", 3, "original", 6));
  const resumed = room.join("new a", first.key, 7)!;
  assert.equal(resumed.car, 3);
  assert.equal(room.lobby().slots[3]?.ready, true);
  assert.equal(room.control("host", { type: "launch" }, 8), null);
  assert.ok(room.select(first.slot, "new a", 0, "original", 9));
  assert.ok(room.ready(first.slot, "new a", false, 10));
  assert.ok(room.control("host", { type: "return" }, 11));
});

test("a host can end free practice and reuse connected seats for the next heat", () => {
  const room = new Room<string>();
  room.addDisplay("host", true);
  const first = room.join("a", undefined, 0)!;
  room.ready(first.slot, "a", true, 0);
  assert.equal(room.control("host", { type: "configure", config: {
    laps: 2, bots: 1, difficulty: "rookie", mode: "practice", night: false,
  } }, 0), null);
  assert.equal(room.control("host", { type: "launch" }, 0), null);
  room.step(1 / 60, 1);
  assert.equal(room.snapshot().cars[0].pitReady, true);
  assert.equal(room.select(first.slot, "a", 3, "original", 1), null);
  room.step(1 / 60, 2);
  assert.equal(room.snapshot().cars[3].owned, true);
  assert.equal(room.lobby().slots[3]?.connected, true);
  assert.equal(room.control("host", { type: "return" }, 0), null);
  assert.equal(room.lobby().phase, "lobby");
  assert.equal(room.lobby().slots[3]?.ready, false);
  assert.equal(room.lobby().slots[3]?.connected, true);
  assert.equal(room.lobby().canLaunch, false);
});

test("a reservation expiring just after confirmation still starts the locked grid", () => {
  const room = new Room<string>();
  room.addDisplay("host", true);
  const first = room.join("a", undefined, 0)!;
  room.ready(first.slot, "a", true, 0);
  assert.equal(room.control("host", { type: "configure", config: {
    laps: 2, bots: 0, difficulty: "club", mode: "race", night: false,
  } }, 0), null);
  assert.equal(room.control("host", { type: "launch" }, 14_999), null);
  room.step(1 / 60, 15_001);
  assert.equal(room.snapshot().phase, "grid");
  assert.deepEqual(room.snapshot().order, [0]);
});

test("a resumed phone cannot unlock liveries from telemetry the bot already recorded", () => {
  const seats = new Seats<string>();
  const { slot, key } = seats.join("a", undefined, 0)!;
  const car: CarView = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, lap: 0, owned: true, blink: false, braking: false, steer: 0 };
  seats.recordLiveryProgress([car], seats.drivers(0));
  seats.disconnect(slot, "a", 1);
  const botLap = { ...car, lastLap: 34, cleanLap: true, sectorTimes: [7, 9, 9, 9] };
  seats.recordLiveryProgress([botLap], seats.drivers(1_001));
  seats.join("new a", key, 1_002);
  seats.recordLiveryProgress([botLap], seats.drivers(1_002));
  assert.ok(seats.select(slot, "new a", 0, "clean", 1_002));
  seats.recordLiveryProgress([{ ...botLap, lastLap: 32, sectorTimes: [6.8, 9, 9, 9] }], seats.drivers(1_003));
  assert.equal(seats.select(slot, "new a", 0, "clean", 1_003), null);
  assert.ok(seats.select(slot, "new a", 0, "sector", 1_003));
  seats.recordLiveryProgress([{ ...botLap, lastLap: 32, sectorTimes: [6.7, 9, 9, 9] }], seats.drivers(1_004));
  assert.equal(seats.select(slot, "new a", 0, "sector", 1_004), null);
});
