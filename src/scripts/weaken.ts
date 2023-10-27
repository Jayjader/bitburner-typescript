import { AutocompleteData, NS } from "@ns";
import { autocomplete as batchAutoComplete, prepare } from "/scripts/batching";

export async function main(ns: NS) {
  const { target, delay } = prepare(ns);
  await ns.weaken(target, { additionalMsec: delay });
  const end = performance.now();
  console.log({ message: "weaken finished", target, delay, end });
}
export function autocomplete(data: AutocompleteData) {
  return batchAutoComplete(data);
}
