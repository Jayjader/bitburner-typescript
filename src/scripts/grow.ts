import { AutocompleteData, NS } from "@ns";
import { autocomplete as batchAutoComplete, prepare } from "/scripts/batching";

export async function main(ns: NS) {
  const { target, delay } = prepare(ns);
  await ns.grow(target, { additionalMsec: delay });
  const end = performance.now();
  console.log({ message: "grow finished", target, delay, end });
}

export function autocomplete(data: AutocompleteData) {
  return batchAutoComplete(data);
}
