import { Race } from "../src/sim/race.ts";
import { CAR_SPECS, defaultRaceConfig, normalizeRaceConfig, type RaceConfig, type RaceSnapshot } from "../src/shared/protocol.ts";
import type { ControllerLobbyPacket, LobbyState } from "../src/shared/lobby.ts";
import { Seats } from "./seats.ts";

function validConfig(value: unknown): RaceConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<RaceConfig>;
  const config = normalizeRaceConfig(candidate);
  return candidate.laps === config.laps && candidate.bots === config.bots &&
    candidate.difficulty === config.difficulty && candidate.mode === config.mode && candidate.night === config.night
    ? config : null;
}

export class Room<Peer> {
  private race = new Race({ manual: true });
  private seats = new Seats<Peer>();
  private eligibleHosts = new Set<Peer>();
  private config = { ...defaultRaceConfig };
  private active = false;
  private phase: LobbyState["phase"] = "lobby";
  private drivers = this.seats.drivers(0);
  private starters?: typeof this.drivers;

  addDisplay(peer: Peer, local: boolean) {
    if (local) this.eligibleHosts.add(peer);
  }

  removeDisplay(peer: Peer) {
    this.eligibleHosts.delete(peer);
  }

  isHost(peer: Peer) {
    return this.eligibleHosts.values().next().value === peer;
  }

  control(peer: Peer, command: Record<string, unknown>, now: number): string | null {
    if (!this.isHost(peer)) return "Solo la pantalla anfitriona puede controlar la sala.";
    this.seats.expire(now);
    if (command.type === "return") {
      if (this.phase !== "practice" && this.phase !== "results") return "La carrera todavía está en curso.";
      this.race.returnToDemo();
      this.active = false;
      this.phase = "lobby";
      this.starters = undefined;
      this.seats.resetReady();
      return null;
    }
    if (this.active) return "La salida ya se confirmó.";
    if (command.type === "configure") {
      const config = validConfig(command.config);
      if (!config) return "La configuración de carrera no es válida.";
      this.config = config;
      return null;
    }
    if (command.type !== "launch") return "Comando de sala desconocido.";
    const lobby = this.lobby();
    if (!lobby.canLaunch) return "Todos los mandos de la sala tienen que estar conectados y listos.";
    const empty = lobby.slots.filter((slot) => slot === null).length;
    if (!this.race.configure({ ...this.config, bots: Math.min(this.config.bots, empty) }) || !this.race.launch()) {
      return "No se pudo preparar la salida.";
    }
    this.active = true;
    this.starters = this.seats.drivers(now);
    this.phase = this.config.mode === "practice" ? "practice" : "grid";
    return null;
  }

  join(peer: Peer, key: string | undefined, now: number) {
    return this.seats.join(peer, key, now, !this.active);
  }

  has(slot: number, peer: Peer) {
    return this.seats.has(slot, peer);
  }

  disconnect(slot: number, peer: Peer, now: number) {
    this.seats.disconnect(slot, peer, now);
  }

  select(slot: number, peer: Peer, car: unknown, livery: unknown, now: number) {
    if (this.phase === "practice") {
      return this.seats.select(slot, peer, car, livery, now, (from, to) => from === to
        ? this.race.snapshot().cars[from].pitReady === true
        : this.race.swapPracticeCar(from, to));
    }
    if (this.active) return "La elección se cerró al confirmar la salida.";
    return this.seats.select(slot, peer, car, livery, now);
  }

  ready(slot: number, peer: Peer, ready: unknown, now: number) {
    if (this.active) return "La salida ya se confirmó.";
    return this.seats.ready(slot, peer, ready, now);
  }

  receive(slot: number, peer: Peer, message: Record<string, unknown>, now: number) {
    if (message.type === "heartbeat") this.seats.heartbeat(slot, peer, now);
    if (message.type === "input" && this.active) this.seats.receive(slot, peer, message, now);
  }

  step(dt: number, now: number) {
    this.drivers = this.seats.drivers(now);
    this.race.step(dt, this.active ? this.starters ?? this.drivers : []);
    this.starters = undefined;
  }

  snapshot(): RaceSnapshot {
    const snapshot = this.race.snapshot();
    if (this.active && snapshot.phase !== "demo") this.phase = snapshot.phase;
    return snapshot;
  }

  recordProgress(snapshot: RaceSnapshot) {
    if (this.phase === "race" || this.phase === "practice" || this.phase === "results") {
      this.seats.recordLiveryProgress(snapshot.cars, this.drivers);
    }
  }

  lobby(): LobbyState {
    const slots = this.seats.view();
    const players = slots.filter((slot) => slot !== null);
    return {
      phase: this.phase,
      config: { ...this.config },
      slots,
      canLaunch: !this.active && players.length > 0 && players.every((slot) => slot.ready && slot.connected),
    };
  }

  controllerView(slot: number, lobby: LobbyState, snapshot: RaceSnapshot): ControllerLobbyPacket | null {
    const selection = this.seats.selection(slot);
    return selection ? {
      type: "lobby", lobby, ...selection, pitReady: this.phase === "practice" && snapshot.cars[selection.car]?.pitReady === true,
    } : null;
  }
}
