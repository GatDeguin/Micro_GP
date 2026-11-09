import { strict as assert } from "node:assert";
import { test } from "node:test";
import { steeringAxis } from "../src/controller/controls.ts";

test("the stick has a symmetric 12 percent dead zone", () => {
  for (const displacement of [-12, -5, 0, 5, 12]) {
    assert.equal(steeringAxis(displacement, 100), 0);
  }
  assert.ok(Math.abs(steeringAxis(-56, 100) + 0.5) < 1e-12);
  assert.ok(Math.abs(steeringAxis(56, 100) - 0.5) < 1e-12);
});

test("steering saturates at full thumb travel", () => {
  assert.equal(steeringAxis(50, 50), 1);
  assert.equal(steeringAxis(-90, 50), -1);
});
