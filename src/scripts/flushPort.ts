import type { NS } from "@ns";
import { ports } from "/scripts/constants";

export async function main(ns: NS) {
  const handle = ns.getPortHandle(ports.commandBus);
  while (handle.peek() !== "NULL PORT DATA") {
    ns.tprintf(`${handle.read()}`);
  }
}
