import type { NS } from "@ns";

export async function main(ns: NS) {
  ns.disableLog("sleep");
  ns.disableLog("getServerMoneyAvailable");
  while (ns.corporation.getCorporation().issuedShares > 0) {
    const { sharePrice, issuedShares } = ns.corporation.getCorporation();
    const canBuy = Math.min(
      issuedShares,
      Math.floor((0.5 * ns.getServerMoneyAvailable("home")) / sharePrice) - 1,
    );
    if (canBuy > 0) {
      ns.printf(`buying ${canBuy} shares at $${sharePrice}`);
      ns.corporation.buyBackShares(canBuy);
    }
    await ns.sleep(2_500);
  }
}
