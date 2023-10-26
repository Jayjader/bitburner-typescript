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
    if (ns.getServerMaxRam(serverName) < size) {
      const upgradeCost = ns.getPurchasedServerUpgradeCost(serverName, size);
      ns.printf(`${serverName} upgrade cost: ${upgradeCost}`);
      while (!ns.upgradePurchasedServer(serverName, size)) {
        ns.printf(
          `not enough money; need ${upgradeCost}, missing ${
            upgradeCost - ns.getServerMoneyAvailable("home")
          }`,
        );
        await ns.sleep(1_000);
      }
    }
  }
  ns.toast(
    `Finished upgrading all servers to at least ${ns.formatRam(
      size,
      size < 2 ** 10 ? 0 : 2,
    )} (${size})`,
    "success",
    10_000,
  );
}
export function autocomplete(data: AutocompleteData) {
  const parsedFlags = data.flags(flags);
  if (Object.keys(parsedFlags).length === 0) {
    return [flags[0][0]];
  }
  return [];
}
