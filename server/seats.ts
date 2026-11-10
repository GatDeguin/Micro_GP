import { randomBytes } from "node:crypto";
import { CAR_SPECS, NEUTRAL } from "../src/shared/protocol.ts";
import type { CarView, DriveInput, Driver, Livery } from "../src/shared/protocol.ts";
import { advanceLiveryProgress, createLiveryProgress, unlockedLiveries, type LiveryProgress } from "../src/shared/liveries.ts";
import type { LobbySlot } from "../src/shared/lobby.ts";

const NEUTRAL_AFTER = 250;
const BOT_AFTER = 1000;
const RESERVE_FOR = 15000;

interface Seat<Peer> {
  peer?: Peer;
  key: string;
  car: number;
  livery: Livery;
  ready: boolean;
  progress: LiveryProgress;
  observed?: { car: number; lastLap: CarView["lastLap"]; sectorTimes: CarView["sectorTimes"] };
  lastContact: number;
  lastInput: number;
  detachedAt?: number;
  sequence: number;
  input: DriveInput;
}

export class Seats<Peer> {
  private slots: (Seat<Peer> | undefined)[] = CAR_SPECS.map(() => undefined);

  join(peer: Peer, key: string | undefined, now: number, allowNew = true) {
    this.expire(now);
    const claimed = key ? this.slots.findIndex((seat) => seat?.key === key) : -1;
    if (claimed < 0 && !allowNew) return null;
    const slot = claimed >= 0 ? claimed : this.slots.indexOf(undefined);
    if (slot < 0) return null;

    const previous = this.slots[slot];
    const resumeKey = previous?.key ?? randomBytes(18).toString("base64url");
    const car = previous?.car ?? CAR_SPECS.findIndex((_, car) => this.isFree(car));
    this.slots[slot] = {
      peer, key: resumeKey, car, livery: previous?.livery ?? "original", ready: previous?.ready ?? false,
      progress: previous?.progress ?? createLiveryProgress(), observed: previous?.observed,
      lastContact: now, lastInput: now, sequence: -1, input: NEUTRAL,
    };
    return { slot, car, key: resumeKey, previous: previous?.peer };
  }

  has(slot: number, peer: Peer): boolean {
    return this.slots[slot]?.peer === peer;
  }

  receive(slot: number, peer: Peer, message: Record<string, unknown>, now: number): boolean {
    const seat = this.current(slot, peer, now);
    if (!seat) return false;
    const { x, gas, brake, seq } = message;
    if (
      message.type !== "input" ||
      typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > 1 ||
      typeof gas !== "boolean" || typeof brake !== "boolean" ||
      typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0 || seq <= seat.sequence
    ) return false;
    seat.sequence = seq;
    seat.input = { x, gas, brake };
    seat.lastContact = now;
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

  heartbeat(slot: number, peer: Peer, now: number) {
    const seat = this.current(slot, peer, now);
    if (seat) seat.lastContact = now;
  }

  select(slot: number, peer: Peer, car: unknown, livery: unknown, now: number, swap?: (from: number, to: number) => boolean) {
    const seat = this.current(slot, peer, now);
    if (!seat) return "El mando ya no tiene una plaza.";
    if (typeof car !== "number" || !Number.isInteger(car) || !CAR_SPECS[car]) return "Elegí un auto de la sala.";
    if (car !== seat.car && !this.isFree(car)) return "Ese auto ya está reservado.";
    const selected = unlockedLiveries(seat.progress).find((option) => option === livery);
    if (!selected) return "Esa librea todavía está bloqueada.";
    if (swap && !swap(seat.car, car)) return "Estacioná en boxes para cambiar de auto.";
    if (car !== seat.car || selected !== seat.livery) seat.ready = false;
    if (car !== seat.car) {
      seat.input = NEUTRAL;
      seat.lastInput = now;
    }
    seat.car = car;
    seat.livery = selected;
    return null;
  }

  ready(slot: number, peer: Peer, ready: unknown, now: number) {
    const seat = this.current(slot, peer, now);
    if (!seat) return "El mando ya no tiene una plaza.";
    if (typeof ready !== "boolean") return "Confirmá si estás listo.";
    seat.ready = ready;
    return null;
  }

  resetReady() {
    for (const seat of this.slots) {
      if (!seat) continue;
      seat.ready = false;
      seat.observed = undefined;
      seat.input = NEUTRAL;
      seat.lastInput = -Infinity;
    }
  }

  view(): (LobbySlot | null)[] {
    const view = CAR_SPECS.map<LobbySlot | null>(() => null);
    for (const seat of this.slots) {
      if (seat) view[seat.car] = { car: seat.car, livery: seat.livery, ready: seat.ready, connected: seat.peer !== undefined };
    }
    return view;
  }

  selection(slot: number) {
    const seat = this.slots[slot];
    return seat ? { car: seat.car, unlocked: unlockedLiveries(seat.progress) } : null;
  }

  recordLiveryProgress(cars: readonly CarView[], drivers: readonly (Driver | undefined)[]) {
    for (const seat of this.slots) {
      if (!seat) continue;
      const car = cars[seat.car];
      const before = seat.observed;
      seat.observed = { car: seat.car, lastLap: car.lastLap, sectorTimes: car.sectorTimes };
      if (seat.peer === undefined || drivers[seat.car]?.input == null || before?.car !== seat.car) continue;
      const sectorTimes = car.sectorTimes?.map((time, index) => time === before.sectorTimes?.[index] ? null : time);
      const cleanLap = car.cleanLap === true && car.lastLap !== before.lastLap;
      seat.progress = advanceLiveryProgress(seat.progress, { ...car, sectorTimes, cleanLap });
    }
  }

  drivers(now: number): (Driver | undefined)[] {
    this.expire(now);
    const drivers = CAR_SPECS.map<Driver | undefined>(() => undefined);
    for (const seat of this.slots) {
      if (!seat) continue;
      const idle = now - seat.lastInput;
      const input = idle >= BOT_AFTER ? null : idle >= NEUTRAL_AFTER ? NEUTRAL : seat.input;
      drivers[seat.car] = seat.livery === "original" ? { input, owned: true } : { input, owned: true, livery: seat.livery };
    }
    return drivers;
  }

  expire(now: number): void {
    for (let index = 0; index < this.slots.length; index++) {
      const seat = this.slots[index];
      if (seat && now - (seat.detachedAt ?? seat.lastContact) >= RESERVE_FOR) this.slots[index] = undefined;
    }
  }

  private isFree(car: number) {
    return !this.slots.some((seat) => seat?.car === car);
  }

  private current(slot: number, peer: Peer, now: number) {
    this.expire(now);
    const seat = this.slots[slot];
    return seat?.peer === peer ? seat : undefined;
  }
}
