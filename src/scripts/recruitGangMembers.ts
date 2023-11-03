import { NS } from "@ns";

export async function main(ns: NS) {
  while (true) {
    await ns.sleep(1_000);
    if (!ns.gang.canRecruitMember()) {
      continue;
    }
    ns.gang.recruitMember(
      `ganger-${crypto.getRandomValues(new Uint8Array(2))}`,
    );
  }
}
