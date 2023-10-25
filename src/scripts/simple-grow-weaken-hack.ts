import type { AutocompleteData, NS } from "@ns";

type FlagType = Parameters<AutocompleteData["flags"]>[0];
const flags: FlagType = [["delay", 0]];

export function autocomplete(data: AutocompleteData, args: string[]) {
  const parsedFlags = data.flags(flags);
  const suggestions = [];
  if (Object.keys(parsedFlags).length === 0) {
    suggestions.push(`--${flags[0][0]}`);
  }
  switch (args.length) {
    case 0:
      suggestions.push(...data.servers);
      break;
    case 1:
      if (!data.servers.includes(args[0])) {
        suggestions.push(data.servers);
      }
  }
  return suggestions;
}
export async function main(ns: NS) {
  const parsedFlags = ns.flags(flags);
  // Defines the "target server", which is the server
  // that we're going to hack.
  const target = ns.args[0] as string;

  // Defines how much money a server should have before we hack it
  // In this case, it is set to the maximum amount of money.
  const moneyThresh = 0.9 * ns.getServerMaxMoney(target);

  // Defines the maximum security level the target server can
  // have. If the target's security level is higher than this,
  // we'll weaken it before doing anything else
  const securityThresh = 1.1 * ns.getServerMinSecurityLevel(target);

  if (parsedFlags.delay > 0) {
    await ns.sleep(parsedFlags.delay as number);
  }

  // Infinite loop that continously hacks/grows/weakens the target server
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (ns.getServerSecurityLevel(target) > securityThresh) {
      // If the server's security level is above our threshold, weaken it
      await ns.weaken(target);
    } else if (ns.getServerMoneyAvailable(target) < moneyThresh) {
      // If the server's money is less than our threshold, grow it
      await ns.grow(target);
    } else {
      // Otherwise, hack it
      await ns.hack(target);
    }
  }
}
