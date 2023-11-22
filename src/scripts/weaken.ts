import { AutocompleteData, NS } from "@ns";
import { autocomplete as batchAutoComplete, prepare } from "/scripts/batching";
import { ports } from "/scripts/constants";

export async function main(ns: NS) {
  const { target, delay, controllerPid } = await prepare(ns);
  await ns.weaken(target, { additionalMsec: delay });
  ns.writePort(ports.batchCommandOffset + controllerPid, 1);
  // const end = performance.now();
  // console.debug({ message: "weaken finished", target, delay, end });
}
export function autocomplete(data: AutocompleteData) {
  return batchAutoComplete(data);
}
