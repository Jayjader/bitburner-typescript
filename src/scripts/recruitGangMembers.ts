import { NS } from "@ns";

export async function main(ns: NS) {
  ns.disableLog("sleep");
  while (!ns.gang.inGang()) {
    await ns.sleep(1000);
  }
  while (true) {
    if (!ns.gang.canRecruitMember()) {
      await ns.sleep(1_000);
      continue;
    }
    ns.gang.recruitMember(
      `ganger-${crypto.getRandomValues(new Uint8Array(1))}`,
    );
  }
}
