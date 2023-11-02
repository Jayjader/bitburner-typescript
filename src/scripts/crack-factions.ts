import { NS } from "@ns";

const servers = ["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z", "The-Cave"];

export async function main(ns: NS) {
  ns.run(
    "scripts/writeCommand.js",
    1,
    ...servers.map((server) => `crack:${server}`),
  );
}
