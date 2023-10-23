import type { AutocompleteData, NS } from "@ns";

type FlagType = Parameters<AutocompleteData["flags"]>[0];
const flags: FlagType = [["size", 2 ** 10]];

const hostname = (i: number) => `swarm-${i}`;
export async function main(ns: NS) {
  const parsedFlags = ns.flags(flags);
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-ignore
  if (parsedFlags._.length || flags.help) {
    ns.tprintf(
      "This script purchases servers of a certain size (default: 1TiB) until the max number of purchased servers is reached.",
    );
    ns.tprintf(`USAGE: run ${ns.getScriptName()} --${flags[0][0]} <size>`);
    ns.tprintf("Example:");
    ns.tprintf(`> run ${ns.getScriptName()} --${flags[0][0]} ${flags[0][1]}`);
    return;
  }
  const size = parsedFlags.size as number;
  while (ns.getPurchasedServers().length < ns.getPurchasedServerLimit()) {
    if (ns.getServerMoneyAvailable("home") >= ns.getPurchasedServerCost(size)) {
      ns.purchaseServer(hostname(ns.getPurchasedServers().length), size);
    }
    await ns.sleep(1_000);
  }
}

export function autocomplete(data: AutocompleteData) {
  const parsedFlags = data.flags(flags);
  if (Object.keys(parsedFlags).length === 0) {
    return [flags[0][0]];
  }
  return [];
}
