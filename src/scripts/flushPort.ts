import type { NS } from "@ns";
import { ports } from "/scripts/constants";

export async function main(ns: NS) {
  const port = (ns.args.at(0) as number | undefined) ?? ports.commandBus;
  const handle = ns.getPortHandle(port);
  while (!handle.empty()) {
    ns.tprintf(`${handle.read()}`);
  }
}
