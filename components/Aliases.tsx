"use client";

import { createContext, useContext } from "react";
import { NO_ALIASES, type Aliases } from "@/lib/apps";

/** Which friendly names resolve on this machine, as the server found them
 *  (lib/aliases.ts) - so cross-app links never point at one that doesn't. */
const AliasContext = createContext<Aliases>(NO_ALIASES);

export function AliasProvider({ aliases, children }: { aliases: Aliases; children: React.ReactNode }) {
  return <AliasContext.Provider value={aliases}>{children}</AliasContext.Provider>;
}

export const useAliases = () => useContext(AliasContext);
