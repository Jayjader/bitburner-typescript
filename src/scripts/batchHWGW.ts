import type { AutocompleteData, NS } from "@ns";
import { scripts } from "/scripts/batching";
import { ports } from "/scripts/constants";

type FlagSchema = Parameters<AutocompleteData["flags"]>[0];
const flagSchema: FlagSchema = [
  ["delay", 5],
  ["prep", false],
  ["startDelay", 1_000],
];

export async function main(ns: NS) {
  const flags = ns.flags(flagSchema);
  const delay = parseInt(flags.delay as string, 10);
  const host = ns.args[0] as string;
  // const target = ns.args[1] as string;
  for (const filename of Object.values(scripts)) {
    if (!ns.fileExists(filename, host)) {
      ns.scp(filename, host);
    }
  }
  // ns.tail();
  const targets = ["n00dles", "phantasy", "joesguns"];
  const batches = [];
  for (const target of targets) {
    const growDuration = ns.getGrowTime(target);
    const weakenDuration = ns.getWeakenTime(target);
    const hackDuration = ns.getHackTime(target);
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
    const weaken2ThreadsNeeded = Math.max(
      1,
      Math.ceil(growThreadsNeeded / 12.5),
    );

    const startTime =
      Math.floor(performance.now()) + (flags.startDelay as number);
    const endTime = startTime + weakenDuration + 2 * delay;
    // task start delays
    const [w1, w2, g, h] = [
      weakenDuration + 2 * delay,
      weakenDuration,
      growDuration + delay,
      hackDuration + 3 * delay,
    ].map((time) => endTime - time - startTime);

    console.debug({
      w1,
      w2,
      g,
      h,
      weakenDuration,
      growDuration,
      hackDuration,
      delay,
      startTime,
      endTime,
    });
    batches.push({
      host,
      target,
      tasks: [
        {
          command: "weaken",
          endAt: endTime - 2 * delay,
          runFor: weakenDuration,
          threads: weaken1ThreadsNeeded,
        } as const,
        {
          command: "weaken",
          endAt: endTime,
          runFor: weakenDuration,
          threads: weaken2ThreadsNeeded,
        } as const,
        {
          command: "grow",
          endAt: endTime - delay,
          runFor: growDuration,
          threads: growThreadsNeeded,
        } as const,
        ...(flags.prep
          ? []
          : [
              {
                command: "hack",
                endAt: endTime - 3 * delay,
                runFor: hackDuration,
                threads: hackThreadsWanted,
              } as const,
            ]),
      ],
    });
  }

  let accumulatedDelay = 0;
  for (const { host, target, tasks } of batches) {
    for (const { command, endAt, runFor, threads } of tasks) {
      const pid = ns.exec(
        scripts[command],
        host,
        {
          threads: threads,
          temporary: true,
        },
        "--runFor",
        runFor,
        "--endAt",
        endAt + accumulatedDelay,
        "--target",
        target,
      );
      const handle = ns.getPortHandle(ports.batchCommandOffset + pid);
      await handle.nextWrite();
      accumulatedDelay += handle.read() as number;
    }
  }
}
