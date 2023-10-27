import { NS } from "@ns";
import { ports } from "/scripts/constants.js";

export async function main(ns: NS) {
  const popped = ns.writePort(ports.commandBus, JSON.stringify(ns.args));
  if (popped !== null) {
    ns.tprintf(`queue full; this was popped from it when writing: ${popped}`);
  }
}
