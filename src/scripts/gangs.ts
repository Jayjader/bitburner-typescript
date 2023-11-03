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
  const sleepTime = 250;
  // let loopCount = -1;
  while (true) {
    await ns.sleep(sleepTime / (ns.gang.getBonusTime() || 1));
    // loopCount += 1;
    const gang = ns.gang.getGangInformation();
    const members = ns.gang.getMemberNames();
    /*
    // every 60 irl seconds we clear *all* the members' tasks
    // combined with the shuffling below, this should prevent members from getting stuck on the same task forever
    if (loopCount % Math.floor(60 * (1_000 / sleepTime)) === 0) {
      for (const m of members) {
        ns.gang.setMemberTask(m, "Unassigned");
      }
    }
     */
    const unassigned = members.filter(
      (name) => ns.gang.getMemberInformation(name).task === "Unassigned",
    );
    shuffleArray(unassigned);
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
      } else {
        for (const member of hasTask) {
          const memberInfo = ns.gang.getMemberInformation(member);
          const neededTask = taskForMember(memberInfo);
          if (
            memberInfo.task !== neededTask &&
            memberInfo.task !== "Territory Warfare"
          ) {
            ns.gang.setMemberTask(member, neededTask);
          }
        }
      }
    } else if (wantedGainRate <= 0) {
      if (wantedPenalty > 0.9) {
        if (unassigned.length > 0) {
          ns.gang.setMemberTask(
            unassigned[0],
            taskForMember(ns.gang.getMemberInformation(unassigned[0])),
          );
          continue;
        }
        const memberToPutToTask = hasTask.find(
          (name) =>
            ns.gang.getMemberInformation(name).task === "Vigilante Justice",
        );
        if (memberToPutToTask) {
          ns.gang.setMemberTask(
            memberToPutToTask,
            taskForMember(ns.gang.getMemberInformation(memberToPutToTask)),
          );
        } else {
          for (const member of hasTask) {
            const memberInfo = ns.gang.getMemberInformation(member);
            const neededTask = taskForMember(memberInfo);
            if (
              memberInfo.task !== neededTask &&
              memberInfo.task !== "Territory Warfare"
            ) {
              ns.gang.setMemberTask(member, neededTask);
            }
          }
        }
      }
    }

    let clash = true;
    for (const [, info] of Object.entries(ns.gang.getOtherGangInformation())) {
      if (info.power > 0.9 * gang.power) {
        clash = false;
      }
    }
    if (gang.territoryWarfareEngaged !== clash) {
      ns.gang.setTerritoryWarfare(clash);
    }
    if (gang.respectGainRate > 0) {
      const mostExp = hasTask
        .slice()
        .sort(
          (a, b) =>
            sumExp(ns.gang.getMemberInformation(a)) -
            sumExp(ns.gang.getMemberInformation(b)),
        )
        .pop();

      if (
        mostExp &&
        ns.gang.getMemberInformation(mostExp).task !== "Territory Warfare"
      ) {
        ns.gang.setMemberTask(mostExp, "Territory Warfare");
      }
    } else {
      const toChange = hasTask.find(
        (name) =>
          ns.gang.getMemberInformation(name).task === "Territory Warfare",
      );
      if (toChange) {
        ns.gang.setMemberTask(
          toChange,
          taskForMember(ns.gang.getMemberInformation(toChange)),
        );
      }
    }
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
function sumExp(info: GangMemberInfo) {
  return (
    info.hack_exp +
    info.str_exp +
    info.def_exp +
    info.dex_exp +
    info.agi_exp +
    info.cha_exp
  );
}
function taskForMember(info: GangMemberInfo) {
  if (canLowLevelTerror(info)) {
    return "Terrorism";
  }
  if (sumCombatSkills(info) < 500) {
    return "Train Combat";
  }
  if (sumCombatSkills(info) < 750) {
    return "Mug People";
  }
  if (sumCombatSkills(info) < 1000) {
    return "Strongarm Civilians";
  }
  // if (sumCombatSkills(info) > 1000) {
  //   return "Territory Warfare";
  // }
  return "Traffick Illegal Arms";
}
