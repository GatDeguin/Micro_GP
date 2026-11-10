import type { Livery, RaceConfig, RaceSnapshot } from "./protocol.ts";

export interface LobbySlot {
  car: number;
  livery: Livery;
  ready: boolean;
  connected: boolean;
}

export interface LobbyState {
  phase: "lobby" | Exclude<RaceSnapshot["phase"], "demo">;
  config: RaceConfig;
  slots: (LobbySlot | null)[];
  canLaunch: boolean;
}

export interface DisplayLobbyPacket {
  type: "lobby";
  lobby: LobbyState;
  host: boolean;
}

export interface ControllerLobbyPacket {
  type: "lobby";
  lobby: LobbyState;
  car: number;
  unlocked: Livery[];
  pitReady: boolean;
}

export function readCommand(data: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
