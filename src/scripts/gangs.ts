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
  const crimes = [
    "Mug People",
    "Deal Drugs",
    "Strongarm Civilians",
    "Run a Con",
    "Armed Robbery",
    "Traffick Illegal Arms",
    "Threaten & Blackmail",
    "Human Trafficking",
    "Terrorism",
  ];
  // ns.print(ns.gang.getEquipmentNames());
  // ns.gang.getEquipmentStats()
  ns.disableLog("sleep");
  ns.disableLog("getServerMoneyAvailable");
  let loopCount = -1;
  while (true) {
    await ns.sleep(1_000);
    loopCount += 1;
    const gang = ns.gang.getGangInformation();
    const members = ns.gang.getMemberNames();
    if (loopCount % 100 === 0) {
      for (const m of members) {
        ns.gang.setMemberTask(m, "Unassigned");
      }
    }
    const unassigned = members.filter(
      (name) => ns.gang.getMemberInformation(name).task === "Unassigned",
    );
    const hasTask = members.filter(
      (name) => ns.gang.getMemberInformation(name).task !== "Unassigned",
    );
    shuffleArray(hasTask);
    const wantedGainRate = gang.wantedLevelGainRate;
    const wantedPenalty = gang.wantedPenalty;
    if (wantedGainRate >= 0) {
      if (unassigned.length > 0) {
        ns.gang.setMemberTask(unassigned[0], "Vigilante Justice");
        continue;
      }
      if (wantedPenalty < 0.9) {
        const memberIncreasingWantedLevel = hasTask.find((name) =>
          crimes.includes(ns.gang.getMemberInformation(name).task),
        );
        if (memberIncreasingWantedLevel) {
          ns.gang.setMemberTask(
            memberIncreasingWantedLevel,
            "Vigilante Justice",
          );
        }
      } else if (wantedGainRate <= 0) {
        if (unassigned.length > 0) {
          ns.gang.setMemberTask(
            unassigned[0],
            taskForMember(ns.gang.getMemberInformation(unassigned[0])),
          );
          continue;
        }
        if (wantedPenalty > 0.9) {
          const memberToPutToTask = hasTask.find(
            (name) =>
              ns.gang.getMemberInformation(name).task === "Vigilante Justice",
          );
          if (memberToPutToTask) {
            ns.gang.setMemberTask(
              memberToPutToTask,
              taskForMember(ns.gang.getMemberInformation(memberToPutToTask)),
            );
          }
        }
      }
    } else if (wantedGainRate <= 0 && wantedPenalty > 0.9) {
      const memberToPutToTask = [...unassigned, ...hasTask].find(
        (name) =>
          ns.gang.getMemberInformation(name).task === "Vigilante Justice",
      );
      if (memberToPutToTask) {
        ns.gang.setMemberTask(
          memberToPutToTask,
          taskForMember(ns.gang.getMemberInformation(memberToPutToTask)),
        );
      }
    }

    for (const name of members) {
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
      continue;
    }
    const count = members.length;
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

function sumCombatSkills(info: GangMemberInfo) {
  return [info.agi, info.dex, info.str, info.def].reduce(
    (accum, val) => accum + val,
  );
}
function taskForMember(info: GangMemberInfo) {
  if (canLowLevelTerror(info)) {
    return "Terrorism";
  }
  if (sumCombatSkills(info) < 500) {
    return "Mug People";
  }
  if (sumCombatSkills(info) < 1000) {
    return "Strongarm Civilians";
  }
  return "Traffick Illegal Arms";
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
