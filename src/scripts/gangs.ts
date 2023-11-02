import type { GangMemberInfo, NS } from "@ns";

export async function main(ns: NS) {
  if (!ns.gang) {
    ns.tprintf("Gang api not available");
    return;
  }
  while (!ns.gang.inGang()) {
    await ns.sleep(1000);
  }
  ns.tail();
  const tasks = [
    "Unassigned",
    "Mug People",
    "Deal Drugs",
    "Strongarm Civilians",
    "Run a Con",
    "Armed Robbery",
    "Traffick Illegal Arms",
    "Threaten & Blackmail",
    "Human Trafficking",
    "Terrorism",
    "Vigilante Justice",
    "Train Combat",
    "Train Hacking",
    "Train Charisma",
    "Territory Warfare",
  ];
  // ns.print(ns.gang.getEquipmentNames());
  // ns.gang.getEquipmentStats()
  let vigilanteHysterisis: "on" | "off" = "on";
  ns.disableLog("sleep");
  ns.disableLog("getServerMoneyAvailable");
  while (true) {
    const gang = ns.gang.getGangInformation();
    if (vigilanteHysterisis === "on") {
      if (gang.wantedLevel === 1 || gang.wantedPenalty >= 0.95) {
        vigilanteHysterisis = "off";
        ns.printf("stopping vigilantism");
        continue;
      }
      for (const name of ns.gang.getMemberNames()) {
        ns.gang.getMemberInformation(name).task === "Vigilante Justice" ||
          ns.gang.setMemberTask(name, "Vigilante Justice");
      }
    } else {
      if (gang.wantedLevel > 1 && gang.wantedPenalty < 0.9) {
        vigilanteHysterisis = "on";
        ns.printf("starting vigilantism");
        continue;
      }
      const maxTerritory = 1;
      let wagingWarfare = 0;
      const members = ns.gang
        .getMemberNames()
        .map((name) => [name, ns.gang.getMemberInformation(name)] as const);
      shuffleArray(members);
      for (const [name, info] of members) {
        if ([info.agi, info.dex, info.str, info.def].some((val) => val < 100)) {
          const task = canLowLevelTerror(info) ? "Terrorism" : "Train Combat";
          if (info.task !== task) {
            ns.gang.setMemberTask(name, task);
          }
          continue;
        }

        if ([info.agi, info.dex, info.str, info.def].some((val) => val < 125)) {
          if (wagingWarfare < maxTerritory) {
            if (info.task !== "Territory Warfare") {
              ns.gang.setMemberTask(name, "Territory Warfare");
            }
            wagingWarfare += 1;
          } else {
            if (Math.random() > 0.25) {
              if (info.task !== "Mug People") {
                ns.gang.setMemberTask(name, "Mug People");
              }
            } else {
              const task = canLowLevelTerror(info)
                ? "Terrorism"
                : "Train Combat";
              if (info.task !== task) {
                ns.gang.setMemberTask(name, task);
              }
            }
          }
          continue;
        }

        if ([info.agi, info.dex, info.str, info.def].some((val) => val < 175)) {
          if (Math.random() > 0.25) {
            if (info.task !== "Strongarm Civilians") {
              ns.gang.setMemberTask(name, "Strongarm Civilians");
            }
          } else {
            const task = canLowLevelTerror(info) ? "Terrorism" : "Train Combat";
            if (info.task !== task) {
              ns.gang.setMemberTask(name, task);
            }
          }
          continue;
        }

        if (Math.random() > 0.25) {
          if (info.task !== "Traffick Illegal Arms") {
            ns.gang.setMemberTask(name, "Traffick Illegal Arms");
          }
        } else {
          const task = canLowLevelTerror(info) ? "Terrorism" : "Train Combat";
          if (info.task !== task) {
            ns.gang.setMemberTask(name, task);
          }
        }
      }
    }
    for (const name of ns.gang.getMemberNames()) {
      for (const upgrade of upgradesToBuy(ns.gang.getMemberInformation(name))) {
        if (
          ns.getServerMoneyAvailable("home") -
            ns.gang.getEquipmentCost(upgrade) >
          30_000_000
        ) {
          console.debug({ message: "buying upgrade", name, upgrade });
          ns.gang.purchaseEquipment(name, upgrade);
        }
      }
    }
    if (gang.respect < gang.respectForNextRecruit) {
      await ns.sleep(5_000);
      continue;
    }
    const count = ns.gang.getMemberNames().length;
    ns.gang.recruitMember(`ganger-${count}`);
  }
}

function shuffleArray<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function canLowLevelTerror(info: GangMemberInfo) {
  return info.hack + info.dex + info.def + info.str + info.cha < 630;
}

function upgradesToBuy(info: GangMemberInfo) {
  const toBuy = [];
  for (const u of [
    "Baseball Bat",
    "Bulletproof Vest",
    "Ford Flex V20",
    "NUKE Rootkit",
  ]) {
    if (!info.upgrades.includes(u)) {
      toBuy.push(u);
    }
  }
  if ([info.agi, info.dex, info.str, info.def].some((val) => val > 50)) {
    for (const u of ["Katana", "Full Body Armor", "ATX1070 Superbike"]) {
      if (!info.upgrades.includes(u)) {
        toBuy.push(u);
      }
    }
  }
  if ([info.agi, info.dex, info.str, info.def].some((val) => val > 100)) {
    for (const u of ["Glock 18C", "Liquid Body Armor", "Mercedes-Benz S9001"]) {
      if (!info.upgrades.includes(u)) {
        toBuy.push(u);
      }
    }
  }
  return toBuy;
}
