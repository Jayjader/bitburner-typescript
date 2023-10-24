import type { AutocompleteData, NS } from "@ns";

type FlagType = Parameters<AutocompleteData["flags"]>[0];
const flags: FlagType = [["powerOfTwo", 0]];

export async function main(ns: NS) {
  const parsedFlags = ns.flags(flags);
  const size = Math.min(
    ns.getPurchasedServerMaxRam(),
    2 ** Math.max(Number(parsedFlags.powerOfTwo), 0),
  );
  if (size === 2) {
    return;
  }
  for (const serverName of ns.getPurchasedServers()) {
    ns.printf(
      `server upgrade cost: ${ns.getPurchasedServerUpgradeCost(
        serverName,
        size,
      )}`,
    );
    while (!ns.upgradePurchasedServer(serverName, size)) {
      await ns.sleep(1_000);
    }
  }
}