import type { NS } from "@ns";
import { scripts as batchingScripts } from "scripts/batching";
import { ports } from "/scripts/constants";
import { AutocompleteData } from "@ns";

const startDelay = 1_000;
const delay = 5;
export async function main(ns: NS) {
  ns.disableLog("scan");
  const target = ns.args[0] as string;

  while (true) {
    // batch calculations
    const growDuration = ns.getGrowTime(target);
    const weakenDuration = ns.getWeakenTime(target);
    const hackDuration = ns.getHackTime(target);
    const moneyToHackRatio = 0.2;
    const targetServer = ns.getServer(target);
    // don't hack if server not prepped
    const hackThreadsWanted =
      targetServer.hackDifficulty! > targetServer.minDifficulty! // target is hackable so these always exist (external invariant, is the caller's responsibility)
        ? 0
        : Math.max(1, Math.floor(moneyToHackRatio / ns.hackAnalyze(target)));
    const growThreadsNeeded = Math.max(
      1,
      Math.ceil(ns.growthAnalyze(target, 1 / moneyToHackRatio)),
    );
    const weaken1ThreadsNeeded = Math.max(
      1,
      Math.ceil(
        ns.hackAnalyzeSecurity(hackThreadsWanted, target) / ns.weakenAnalyze(1),
      ),
    );
    const weaken2ThreadsNeeded = Math.max(
      1,
      Math.ceil(
        ns.growthAnalyzeSecurity(growThreadsNeeded, target) /
          ns.weakenAnalyze(1),
      ),
    );

    const startTime = Math.floor(performance.now()) + startDelay;
    const endTime = startTime + weakenDuration + 2 * delay;
    const firstWeakenTask = {
      command: "weaken",
      endAt: endTime - 2 * delay,
      runFor: weakenDuration,
      threads: weaken1ThreadsNeeded,
    } as const; //,
    const secondWeakenTask = {
      command: "weaken",
      endAt: endTime,
      runFor: weakenDuration,
      threads: weaken2ThreadsNeeded,
    } as const; //,
    const growTask = {
      command: "grow",
      endAt: endTime - delay,
      runFor: growDuration,
      threads: growThreadsNeeded,
    } as const; //,
    const hackTask = {
      command: "hack",
      endAt: endTime - 3 * delay,
      runFor: hackDuration,
      threads: hackThreadsWanted,
    } as const; //,
    const earliestEnd = Math.min(
      firstWeakenTask.endAt,
      secondWeakenTask.endAt,
      growTask.endAt,
      hackTask.endAt,
    );
    const latestEnd = Math.max(
      firstWeakenTask.endAt,
      secondWeakenTask.endAt,
      growTask.endAt,
      hackTask.endAt,
    );

    const hosts: string[] = [];
    const toScan = ["home"];
    while (toScan.length > 0) {
      const scanning = toScan.pop();
      for (const host of ns.scan(scanning)) {
        if (!hosts.includes(host)) {
          hosts.push(host);
          toScan.push(host);
        }
      }
    }
    const ramCosts = Object.fromEntries(
      Object.entries(batchingScripts).map(([command, script]) => [
        command,
        ns.getScriptRam(script),
      ]),
    );
    const batchCosts = {
      w1: ramCosts.weaken * firstWeakenTask.threads,
      w2: ramCosts.weaken * secondWeakenTask.threads,
      g: ramCosts.grow * growTask.threads,
      h: ramCosts.hack * hackTask.threads,
    };
    let accumulatedDelay = 0;
    let spawned = 0;
    do {
      // find RAM for batch
      const batchHosts = new Map<
        typeof firstWeakenTask | typeof growTask | typeof hackTask,
        string
      >();
      // prefer multiple cores for grow and weaken
      for (const host of hosts
        .slice()
        .sort((a, b) => ns.getServer(b).cpuCores - ns.getServer(a).cpuCores)) {
        const server = ns.getServer(host);
        let availableRam = server.maxRam - server.ramUsed;
        if (!batchHosts.has(firstWeakenTask) && availableRam >= batchCosts.w1) {
          batchHosts.set(firstWeakenTask, host);
          availableRam -= batchCosts.w1;
        }
        if (
          !batchHosts.has(secondWeakenTask) &&
          availableRam >= batchCosts.w2
        ) {
          batchHosts.set(secondWeakenTask, host);
          availableRam -= batchCosts.w2;
        }
        if (!batchHosts.has(growTask) && availableRam >= batchCosts.g) {
          batchHosts.set(growTask, host);
        }
        if (
          [firstWeakenTask, secondWeakenTask, growTask].every((task) =>
            batchHosts.has(task),
          )
        ) {
          break;
        }
      }
      if (batchHosts.size < 3) {
        ns.printf("not enough ram for non-hacking tasks in batch");
        break;
      }
      if (batchCosts.h) {
        // avoid multiple core machines for hack
        for (const host of hosts
          .slice()
          .sort(
            (a, b) => ns.getServer(a).cpuCores - ns.getServer(b).cpuCores,
          )) {
          const server = ns.getServer(host);
          if (
            !batchHosts.has(hackTask) &&
            server.maxRam - server.ramUsed >= batchCosts.h
          ) {
            batchHosts.set(hackTask, host);
            break;
          }
        }
        if (batchHosts.size < 4) {
          ns.printf("not enough ram for entire batch (with hack)");
          break;
        }
      }
      // spawn & sync
      for (const [{ command, runFor, threads, endAt }, host] of batchHosts) {
        for (const file of [
          "scripts/constants.js",
          "scripts/batching.js",
          batchingScripts[command],
        ]) {
          if (!ns.fileExists(file, host)) {
            ns.scp(file, host, "home");
          }
        }
        const taskPid = ns.exec(
          batchingScripts[command],
          host,
          { threads, temporary: true },
          "--target",
          target,
          "--runFor",
          runFor,
          "--endAt",
          endAt + accumulatedDelay,
        );
        if (taskPid > 0) {
          spawned += 1;
          const handle = ns.getPortHandle(ports.batchCommandOffset + taskPid);
          handle.write(ns.pid);
          await handle.nextWrite();
          accumulatedDelay += handle.read() as number;
        }
      }
      // insert padding between batches
      accumulatedDelay += 2 * delay;
      // if (startTime + accumulatedDelay >= earliestEnd) {
      //   break;
      // }
    } while (startTime + accumulatedDelay < earliestEnd);

    // wait on finish
    let finishedCount = 0;
    const finishedHandle = ns.getPortHandle(ports.batchCommandOffset + ns.pid);
    while (finishedCount < spawned) {
      while (finishedHandle.empty()) {
        await finishedHandle.nextWrite();
      }
      finishedHandle.read();
      finishedCount += 1;
    }
    // give the task scripts some "time" to die and free up their ram
    await ns.sleep(5 * 200);
    // todo: try waiting only for next batch to end instead of all batches to end
  }
}
export function autocomplete(data: AutocompleteData) {
  return data.servers;
}
