import { AutocompleteData, NS } from "@ns";
import {
  autocomplete as batchAutoComplete,
  flagSchema,
} from "/scripts/batching";

export async function main(ns: NS) {
  const flags = ns.flags(flagSchema);
  const delay = parseInt(flags.delay as string, 10);
  const target = flags.target as string;
  // ns.tail();
  await ns.weaken(target, { additionalMsec: delay });
  console.log({ message: "weaken finished", target, delay });
}
export function autocomplete(data: AutocompleteData) {
  return batchAutoComplete(data);
}
