import type { AutocompleteData, NS } from "@ns";
import { scripts } from "/scripts/batching";

type FlagSchema = Parameters<AutocompleteData["flags"]>[0];
const flagSchema: FlagSchema = [
  ["delay", 50],
  ["prep", false],
  ["startDelay", 200],
];

export async function main(ns: NS) {
  const flags = ns.flags(flagSchema);
  const delay = parseInt(flags.delay as string, 10);
  const host = ns.args[0] as string;
  const target = ns.args[1] as string;
  for (const filename of Object.values(scripts)) {
    if (!ns.fileExists(filename, host)) {
      ns.scp(filename, host);
    }
  }
  // ns.tail();
  const growTime = ns.getGrowTime(target);
  const weakenTime = ns.getWeakenTime(target);
  const hackTime = ns.getHackTime(target);
  const moneyToHackRatio = 0.2;
  const hackThreadsWanted = Math.max(
    1,
    Math.ceil(moneyToHackRatio / ns.hackAnalyze(target)),
  );
  const growThreadsNeeded = Math.max(
    1,
    Math.ceil(ns.growthAnalyze(target, 1 / moneyToHackRatio)),
  );
  const weaken1ThreadsNeeded = Math.max(1, Math.ceil(hackThreadsWanted / 25));
  const weaken2ThreadsNeeded = Math.max(1, Math.ceil(growThreadsNeeded / 12.5));

  const startTime =
    Math.floor(performance.now()) + parseInt(flags.startDelay as string, 10);
  const endTime = startTime + weakenTime + 2 * delay;
  // taskDelays
  const [w1, w2, g, h] = [
    weakenTime + 2 * delay,
    weakenTime,
    growTime + delay,
    hackTime + 3 * delay,
  ].map((time) => endTime - time - startTime);

  console.debug({
    w1,
    w2,
    g,
    h,
    weakenTime,
    growTime,
    hackTime,
    delay,
    startTime,
    endTime,
    dateEndTime: new Date(performance.timeOrigin + endTime),
  });
  ns.exec(
    scripts.weaken,
    host,
    weaken1ThreadsNeeded,
    "--delay",
    w1,
    "--target",
    target,
  );
  ns.exec(
    scripts.grow,
    host,
    growThreadsNeeded,
    "--delay",
    g,
    "--target",
    target,
  );
  ns.exec(
    scripts.weaken,
    host,
    weaken2ThreadsNeeded,
    "--delay",
    w2,
    "--target",
    target,
  );
  if (!flags.prep) {
    ns.exec(
      scripts.hack,
      host,
      hackThreadsWanted,
      "--delay",
      h,
      "--target",
      target,
    );
  }
}
