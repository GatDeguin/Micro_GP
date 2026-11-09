import { randomBytes } from "node:crypto";
import { CAR_SPECS, NEUTRAL } from "../src/shared/protocol.ts";
import type { DriveInput, Driver } from "../src/shared/protocol.ts";

const NEUTRAL_AFTER = 250;
const BOT_AFTER = 1000;
const RESERVE_FOR = 15000;

interface Seat<Peer> {
  peer?: Peer;
  key: string;
  lastInput: number;
  detachedAt?: number;
  sequence: number;
  input: DriveInput;
}

export class Seats<Peer> {
  private slots: (Seat<Peer> | undefined)[] = CAR_SPECS.map(() => undefined);

  join(peer: Peer, key: string | undefined, now: number) {
    this.expire(now);
    const claimed = key ? this.slots.findIndex((seat) => seat?.key === key) : -1;
    const slot = claimed >= 0 ? claimed : this.slots.indexOf(undefined);
    if (slot < 0) return null;

    const previous = this.slots[slot];
    const resumeKey = previous?.key ?? randomBytes(18).toString("base64url");
    this.slots[slot] = { peer, key: resumeKey, lastInput: now, sequence: -1, input: NEUTRAL };
    return { slot, key: resumeKey, previous: previous?.peer };
  }

  has(slot: number, peer: Peer): boolean {
    return this.slots[slot]?.peer === peer;
  }

  receive(slot: number, peer: Peer, message: Record<string, unknown>, now: number): boolean {
    const seat = this.slots[slot];
    if (!seat || seat.peer !== peer || now - seat.lastInput >= RESERVE_FOR) return false;
    const { x, gas, brake, seq } = message;
    if (
      message.type !== "input" ||
      typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > 1 ||
      typeof gas !== "boolean" || typeof brake !== "boolean" ||
      typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0 || seq <= seat.sequence
    ) return false;
    seat.sequence = seq;
    seat.input = { x, gas, brake };
    seat.lastInput = now;
    return true;
  }

  disconnect(slot: number, peer: Peer, now: number): void {
    const seat = this.slots[slot];
    if (!seat || seat.peer !== peer) return;
    seat.peer = undefined;
    seat.detachedAt = now;
    seat.input = NEUTRAL;
  }

  drivers(now: number): (Driver | undefined)[] {
    this.expire(now);
    return this.slots.map((seat) => {
      if (!seat) return undefined;
      const idle = now - seat.lastInput;
      const input = idle >= BOT_AFTER ? null : idle >= NEUTRAL_AFTER ? NEUTRAL : seat.input;
      return { input, owned: true };
    });
  }

  private expire(now: number): void {
    for (let index = 0; index < this.slots.length; index++) {
      const seat = this.slots[index];
      if (seat && now - (seat.detachedAt ?? seat.lastInput) >= RESERVE_FOR) this.slots[index] = undefined;
    }
  }
}
