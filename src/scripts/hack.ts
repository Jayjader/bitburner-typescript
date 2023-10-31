import type { AutocompleteData, NS } from "@ns";
import { autocomplete as batchAutoComplete, prepare } from "/scripts/batching";
import { ports } from "/scripts/constants";

export async function main(ns: NS) {
  const { target, delay, controllerPid } = await prepare(ns);
  await ns.hack(target, { additionalMsec: delay });
  ns.writePort(ports.batchCommandOffset + controllerPid, 1);
  const end = performance.now();
  console.debug({ message: "hack finished", target, delay, end });
}
export function autocomplete(data: AutocompleteData) {
  return batchAutoComplete(data);
}
