import assert from "node:assert/strict";
import test from "node:test";
import { selectOrigin } from "../server/origin.ts";
import { Seats } from "../server/seats.ts";

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
