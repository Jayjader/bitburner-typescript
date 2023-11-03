import { GangMemberInfo, NS } from "@ns";

export async function main(ns: NS) {
  ns.disableLog("sleep");
  ns.disableLog("gang.purchaseEquipment");
  ns.disableLog("getServerMoneyAvailable");
  while (true) {
    await ns.sleep(1_000);
    let availableMoney = ns.getServerMoneyAvailable("home");
    const members = ns.gang.getMemberNames();
    const upgrades = ns.gang.getEquipmentNames();
    for (const name of members) {
      for (const upgrade of upgrades) {
        if (ns.gang.getEquipmentCost(upgrade) < 0.5 * availableMoney) {
          if (ns.gang.purchaseEquipment(name, upgrade)) {
            availableMoney -= ns.gang.getEquipmentCost(upgrade);
            ns.printf(`Purchased equipment ${upgrade} for ${name}`);
          }
        }
      }
    }
  }
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
  if ([info.agi, info.dex, info.str, info.def].some((val) => val > 200)) {
    for (const u of ["White Ferrari", "Graphene Plating Armor", "P90C"]) {
      if (!info.upgrades.includes(u)) {
        toBuy.push(u);
      }
    }
  }
  return toBuy;
}
