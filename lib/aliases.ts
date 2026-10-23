import { lookup } from "node:dns/promises";
import { HOST_ALIAS, LIVIO_HOST_ALIAS } from "./origin";
import type { Aliases } from "./apps";

/**
 * Which friendly names resolve on this machine - the server runs here, so it
 * reads the same /etc/hosts as Safari does. Checked once per process (a
 * hosts line added later is picked up on the next start), and quickly: a
 * name that doesn't answer in half a second counts as missing.
 */
let checked: Promise<Aliases> | null = null;

async function resolves(name: string): Promise<boolean> {
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("slow")), 500));
    const { address } = await Promise.race([lookup(name), timeout]);
    return address === "127.0.0.1" || address === "::1";
  } catch {
    return false;
  }
}

export function getAliases(): Promise<Aliases> {
  checked ??= Promise.all([resolves(HOST_ALIAS), resolves(LIVIO_HOST_ALIAS)]).then(([studio, livio]) => ({ studio, livio }));
  return checked;
}
