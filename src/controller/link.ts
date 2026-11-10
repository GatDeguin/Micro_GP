import { CAR_SPECS, type DriveInput, type Livery } from "../shared/protocol.ts";
import type { ControllerLobbyPacket } from "../shared/lobby.ts";

export type LinkStatus = "connecting" | "reconnecting" | "connected" | "full" | "in-progress" | "invalid" | "replaced";

export function controllerLink(
  room: string,
  onStatus: (status: LinkStatus, slot?: number) => void,
  onLobby: (state: ControllerLobbyPacket) => void,
  onError: (message: string) => void,
) {
  const url = new URL(`/live/${room}`, location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const storageKey = `microgp:mando:${room}`;
  let key: string | null = null;
  try {
    key = localStorage.getItem(storageKey);
  } catch {
    // Storage can be unavailable in a private session.
  }

  let socket: WebSocket | null = null;
  let seq = 0;
  let retry: number | undefined;
  let deadline: number | undefined;
  let status: LinkStatus = "connecting";

  function setStatus(next: LinkStatus, slot?: number) {
    if (status === next && slot === undefined) return;
    status = next;
    onStatus(next, slot);
  }

  function clearDeadline() {
    window.clearTimeout(deadline);
    deadline = undefined;
  }

  function close() {
    window.clearTimeout(retry);
    clearDeadline();
    const previous = socket;
    socket = null;
    previous?.close();
    if (status !== "invalid" && status !== "replaced") setStatus("reconnecting");
  }

  function retryAfter(delay: number) {
    window.clearTimeout(retry);
    retry = window.setTimeout(connect, delay);
  }

  function startDeadline(delay = 5000) {
    clearDeadline();
    deadline = window.setTimeout(() => {
      close();
      retryAfter(750);
    }, delay);
  }

  function requestSlot(connection: WebSocket) {
    startDeadline();
    connection.send(JSON.stringify(key ? { type: "join", key } : { type: "join" }));
  }

  function connect() {
    window.clearTimeout(retry);
    if (status === "invalid" || status === "replaced" || document.hidden) return;
    if (!navigator.onLine) {
      setStatus("reconnecting");
      return;
    }
    if (socket) {
      if (socket.readyState === WebSocket.OPEN && (status === "full" || status === "in-progress") && deadline === undefined) requestSlot(socket);
      return;
    }

    const connection = new WebSocket(url);
    socket = connection;
    seq = 0;
    startDeadline();
    connection.addEventListener("open", () => {
      if (socket === connection) requestSlot(connection);
    });
    connection.addEventListener("message", ({ data }) => {
      if (socket !== connection || typeof data !== "string") return;
      let message;
      try {
        message = JSON.parse(data);
      } catch {
        return;
      }
      if (message?.type === "assigned" && Number.isInteger(message.slot) && CAR_SPECS[message.slot] && typeof message.key === "string" && message.key) {
        startDeadline(4200);
        key = message.key as string;
        try {
          localStorage.setItem(storageKey, key);
        } catch {
          // Reconnects still work during this page's lifetime.
        }
        setStatus("connected", message.slot);
      } else if (message?.type === "pulse" && status === "connected") {
        startDeadline(4200);
      } else if (message?.type === "lobby" && status === "connected" && message.lobby && CAR_SPECS[message.car]) {
        onLobby(message as ControllerLobbyPacket);
      } else if (message?.type === "error" && typeof message.message === "string") {
        onError(message.message);
      } else if (message?.type === "full" || message?.type === "in-progress") {
        clearDeadline();
        setStatus(message.type);
        retryAfter(2000);
      } else if (message?.type === "invalid") {
        setStatus("invalid");
        close();
      }
    });
    connection.addEventListener("error", () => {
      if (socket === connection) setStatus("reconnecting");
    });
    connection.addEventListener("close", ({ code }) => {
      if (socket !== connection) return;
      socket = null;
      clearDeadline();
      if (code === 4001) {
        window.clearTimeout(retry);
        setStatus("replaced");
      } else {
        if (status !== "full") setStatus("reconnecting");
        retryAfter(750);
      }
    });
  }

  function sendCommand(command: object) {
    if (status !== "connected" || socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 1024) return;
    socket.send(JSON.stringify(command));
  }

  return {
    connect,
    close,
    send(input: DriveInput) { sendCommand({ type: "input", seq: ++seq, ...input }); },
    heartbeat() { sendCommand({ type: "heartbeat" }); },
    select(car: number, livery: Livery) { sendCommand({ type: "select", car, livery }); },
    ready(ready: boolean) { sendCommand({ type: "ready", ready }); },
  };
}
