import type { NS } from "@ns";

async function nextCycle(ns: NS, log = false) {
  const startState = "START";
  let currentState = startState;
  do {
    while (ns.corporation.getCorporation().state === currentState) {
      await ns.sleep(150);
    }
    currentState = ns.corporation.getCorporation().state;
    if (log) {
      ns.printf("new state: %s", currentState);
    }
  } while (currentState !== startState);
}
export async function main(ns: NS) {
  if (!ns.corporation) {
    ns.tprintf("Corporation api not available");
  }
  while (!ns.corporation.hasCorporation()) {
    await ns.sleep(1_000);
  }
  ns.disableLog("sleep");
  while (true) {
    await nextCycle(ns);
    for (const division of ns.corporation.getCorporation().divisions) {
      const divisionInfo = ns.corporation.getDivision(division);
      for (const city of divisionInfo.cities) {
        const office = ns.corporation.getOffice(division, city);
        if (office.avgEnergy < 90) {
          ns.corporation.buyTea(division, city);
        }
        if (office.avgMorale < 90) {
          ns.corporation.throwParty(division, city, 1_500_000);
        }
      }
    }
  }
}
