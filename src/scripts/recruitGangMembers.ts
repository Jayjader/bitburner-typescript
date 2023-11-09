import { NS } from "@ns";

export async function main(ns: NS) {
  while (!ns.gang.inGang()) {
    await ns.sleep(1000);
  }
  while (true) {
    await ns.sleep(1_000);
    if (!ns.gang.canRecruitMember()) {
      continue;
    }
    ns.gang.recruitMember(
      `ganger-${crypto.getRandomValues(new Uint8Array(1))}`,
    );
  }
}