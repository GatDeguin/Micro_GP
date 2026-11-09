import { networkInterfaces } from "node:os";

export function addresses(): string[] {
  return Object.values(networkInterfaces()).flatMap((interfaces) =>
    (interfaces ?? []).filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address),
  );
}

function privateRank(address: string): number {
  if (address.startsWith("192.168.")) return 0;
  if (address.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(address)) return 2;
  return Infinity;
}

export function selectOrigin(port: number, configured: string | undefined, localAddresses = addresses()): string {
  if (configured) {
    const url = URL.parse(configured);
    if (
      !url || !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      /^127\.\d+\.\d+\.\d+$|^0\.0\.0\.0$|^\[(?:::|::1|::ffff:(?:7f[\da-f]{2}|0):[\da-f]+)\]$|(^|\.)localhost\.?$/i.test(url.hostname)
    ) {
      throw new Error("PUBLIC_ORIGIN debe ser el origen HTTP o HTTPS alcanzable desde el celular, sin ruta.");
    }
    return url.origin;
  }

  const lanAddress = localAddresses.filter((address) => Number.isFinite(privateRank(address)))
    .sort((a, b) => privateRank(a) - privateRank(b))[0];
  if (!lanAddress) {
    throw new Error("No encontré una IPv4 de red local. Conecta la PC a la red o configura PUBLIC_ORIGIN.");
  }
  return `http://${lanAddress}:${port}`;
}
