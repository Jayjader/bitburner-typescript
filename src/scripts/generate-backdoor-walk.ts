import type { AutocompleteData, NS } from "@ns";
export async function main(ns: NS) {
  const target = ns.args[0] as string;
  if (!target) {
    ns.tprintf("needs servername as argument");
    return;
  }
  const seen = new Map<string, string[]>([["home", []]]);
  const to_scan = ["home"];
  let next, pathToNext;
  while ((next = to_scan.shift()) !== undefined && !seen.has(target)) {
    pathToNext = seen.get(next)!;
    for (const scanned of ns.scan(next)) {
      if (seen.has(scanned)) {
        continue;
      }
      seen.set(scanned, [...pathToNext, scanned]);
      to_scan.push(scanned);
    }
  }
  const pathToTarget = seen.get(target);
  if (!pathToTarget) {
    ns.tprintf("path not found");
    return;
  }
  const commandString = `${pathToTarget
    .map((server) => `connect ${server}`)
    .join("; ")}; backdoor`;
  await navigator.clipboard.writeText(commandString);
  ns.tprintf(
    "command string to run (should also already be in clipboard):\n %s",
    commandString,
  );
}

export function autocomplete(data: AutocompleteData) {
  return data.servers;
}
