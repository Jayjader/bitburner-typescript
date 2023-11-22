import type { NS } from "@ns";
import { scripts as batchingScripts } from "scripts/batching";
import { ports } from "/scripts/constants";
import { AutocompleteData } from "@ns";

const startDelay = 500;
const delay = 5;

const flagSchema: Parameters<AutocompleteData["flags"]>[0] = [
  ["moneyRatio", 0.2],
];
export async function main(ns: NS) {
  const scriptStartTime = performance.now();
  ns.disableLog("scan");
  ns.disableLog("exec");
  ns.disableLog("sleep");
  const flags = ns.flags(flagSchema);
  let target;
  if (ns.args.length === 3) {
    target = ns.args[0] as string;
  } else {
    const targets = [];
    const toScanFrom = ["home"];
    const seen: string[] = [];
    while (toScanFrom.length > 0) {
      const scanning = toScanFrom.pop();
      for (const host of ns.scan(scanning)) {
        if (!seen.includes(host)) {
          seen.push(host);
          toScanFrom.push(host);
          const server = ns.getServer(host);
          if (
            server.hasAdminRights &&
            (server.moneyMax ?? 0) > 0 &&
            (server.minDifficulty ?? 0) > 0
          ) {
            targets.push({
              name: host,
              minDifficulty: server.minDifficulty!,
              maxMoney: server.moneyMax!,
            });
          }
        }
      }
    }
    targets.sort((a, b) => {
      return a.maxMoney / a.minDifficulty - b.maxMoney / b.minDifficulty;
    });
    const choice = (await ns.prompt("Target for batches:", {
      type: "select",
      choices: targets.map(
        ({ name, minDifficulty, maxMoney }) =>
          `${name} (minSec: ${minDifficulty}, maxMon: ${maxMoney})`,
      ),
    })) as string;
    if (choice === "") {
      return;
    }
    target = choice.split(" ")[0];
  }
  const moneyToHackRatio = flags.moneyRatio as number;

  const activeBatchQueue: { adjustedEarliestEnd: number; taskCount: number }[] =
    [];
  const finishedHandle = ns.getPortHandle(ports.batchCommandOffset + ns.pid);
  ns.tail();
  while (true) {
    console.debug({
      message: "main loop entered",
      target,
      moneyToHackRatio,
      activeBatchQueue,
    });
    // batch calculations
    const growDuration = ns.getGrowTime(target);
    const weakenDuration = ns.getWeakenTime(target);
    const hackDuration = ns.getHackTime(target);
    const targetServer = ns.getServer(target);
    // don't hack if server not prepped
    const moneyRatioPerHackThread = ns.hackAnalyze(target);
    const hackThreadsWanted =
      targetServer.hackDifficulty! > targetServer.minDifficulty! ||
      targetServer.moneyAvailable! < targetServer.moneyMax! // target is hackable so these always exist (external invariant, is the caller's responsibility)
        ? 0
        : Math.min(
            Number.MAX_SAFE_INTEGER,
            Math.max(1, Math.floor(moneyToHackRatio / moneyRatioPerHackThread)),
          );
    const growThreadsNeeded = Math.max(
      1,
      Math.ceil(ns.growthAnalyze(target, 1 / (1 - moneyToHackRatio))),
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

    const startTime = Math.max(
      scriptStartTime + startDelay,
      Math.floor(performance.now()) + 5 * delay,
    );
    const endTime = startTime + weakenDuration + 2 * delay;
    const batchDuration = endTime - startTime;
    const firstWeakenTask = {
      command: "weaken",
      endAt: endTime - 2 * delay,
      runFor: weakenDuration,
      threads: weaken1ThreadsNeeded,
    } as const;
    const secondWeakenTask = {
      command: "weaken",
      endAt: endTime,
      runFor: weakenDuration,
      threads: weaken2ThreadsNeeded,
    } as const;
    const growTask = {
      command: "grow",
      endAt: endTime - delay,
      runFor: growDuration,
      threads: growThreadsNeeded,
    } as const;
    const hackTask = {
      command: "hack",
      endAt: endTime - 3 * delay,
      runFor: hackDuration,
      threads: hackThreadsWanted,
    } as const;

    const hosts = [];
    const toScanFrom = ["home"];
    const seen: string[] = [];
    while (toScanFrom.length > 0) {
      const scanning = toScanFrom.pop();
      for (const host of ns.scan(scanning)) {
        if (!seen.includes(host)) {
          seen.push(host);
          toScanFrom.push(host);
          const server = ns.getServer(host);
          if (server.hasAdminRights) {
            hosts.push({
              name: host,
              freeRam: server.maxRam - server.ramUsed,
              cores: server.cpuCores,
            });
          }
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
    let batchCount = 0;
    do {
      // find RAM for batch
      const batchHosts = new Map<
        typeof firstWeakenTask | typeof growTask | typeof hackTask,
        string
      >();
      // prefer multiple cores for grow and weaken
      for (const host of hosts.slice().sort((a, b) => b.cores - a.cores)) {
        if (!batchHosts.has(firstWeakenTask) && host.freeRam >= batchCosts.w1) {
          batchHosts.set(firstWeakenTask, host.name);
          host.freeRam -= batchCosts.w1;
        }
        if (!batchHosts.has(growTask) && host.freeRam >= batchCosts.g) {
          batchHosts.set(growTask, host.name);
          host.freeRam -= batchCosts.g;
        }
        if (
          !batchHosts.has(secondWeakenTask) &&
          host.freeRam >= batchCosts.w2
        ) {
          batchHosts.set(secondWeakenTask, host.name);
          host.freeRam -= batchCosts.w2;
        }
        if (
          [firstWeakenTask, secondWeakenTask, growTask].every((task) =>
            batchHosts.has(task),
          )
        ) {
          break;
        }
      }
      let allocated = true;
      if (batchHosts.size < 3) {
        ns.printf(
          `not enough ram for non-hacking tasks in batch: ${JSON.stringify(
            batchCosts,
          )}`,
        );
        allocated = false;
      }
      if (allocated && batchCosts.h) {
        // avoid multiple core machines for hack
        for (const host of hosts.slice().sort((a, b) => a.cores - b.cores)) {
          if (host.freeRam >= batchCosts.h) {
            batchHosts.set(hackTask, host.name);
            host.freeRam -= batchCosts.h;
            break;
          }
        }
        if (batchHosts.size < 4) {
          ns.printf(
            `not enough ram for entire batch (with hack): ${JSON.stringify(
              batchCosts,
            )}`,
          );
          allocated = false;
        }
      }
      if (!allocated) {
        const w1Host = batchHosts.get(firstWeakenTask);
        if (w1Host) {
          hosts.find(({ name }) => w1Host === name)!.freeRam += batchCosts.w1;
          batchHosts.delete(firstWeakenTask);
        }
        const w2Host = batchHosts.get(secondWeakenTask);
        if (w2Host) {
          hosts.find(({ name }) => w2Host === name)!.freeRam += batchCosts.w2;
          batchHosts.delete(secondWeakenTask);
        }
        const gHost = batchHosts.get(growTask);
        if (gHost) {
          hosts.find(({ name }) => gHost === name)!.freeRam += batchCosts.g;
          batchHosts.delete(growTask);
        }
        break;
      }
      console.debug({ message: "allocated batch", batchHosts });
      // spawn & sync
      let spawned = 0;
      let adjustedEarliestEnd = Infinity;
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
          adjustedEarliestEnd = Math.min(
            endAt + accumulatedDelay,
            adjustedEarliestEnd,
          );
          const handle = ns.getPortHandle(ports.batchCommandOffset + taskPid);
          handle.write(ns.pid);
          await handle.nextWrite();
          accumulatedDelay += handle.read() as number;
        } else {
          ns.printf("failed exec, skipping remaining tasks for batch");
          break;
        }
      }
      if (spawned > 0) {
        activeBatchQueue.push({ adjustedEarliestEnd, taskCount: spawned });
        batchCount += 1;
      }
      // insert padding between batches
      accumulatedDelay += 4 * delay;
    } while (
      // keep allocating and spawning batches until we need to be listening for an impending batch end
      // or allocated batches will occupy the target for 2 entire seconds
      performance.now() + delay < activeBatchQueue[0].adjustedEarliestEnd &&
      // activeBatchQueue.length < 2_000 / (4 * delay) &&
      startTime + accumulatedDelay < activeBatchQueue[0].adjustedEarliestEnd
    );
    if (batchCount > 0) {
      ns.printf(
        `batch count: ${batchCount} of duration ${batchDuration} with ${delay} padding`,
      );
      batchCount = 0;
    }

    activeBatchQueue.sort(
      (a, b) => a.adjustedEarliestEnd - b.adjustedEarliestEnd,
    );
    // wait on earliest batch finish
    const earliestFinishingBatch = activeBatchQueue.shift();
    if (!earliestFinishingBatch) {
      ns.printf("no batches to wait on");
      await ns.sleep(1_000);
      continue;
    }
    ns.printf(
      `waiting on batch to end at ${earliestFinishingBatch.adjustedEarliestEnd} (${activeBatchQueue.length} other active batches)`,
    );
    let finishedCount = 0;
    while (finishedCount < earliestFinishingBatch.taskCount) {
      while (finishedHandle.empty()) {
        await finishedHandle.nextWrite();
      }
      finishedHandle.read();
      finishedCount += 1;
    }
    // give the task scripts some "time" to die and free up their ram
    await ns.sleep(1.5 * delay);
  }
}
export function autocomplete(data: AutocompleteData, args: string[]) {
  const flags = data.flags(flagSchema);
  if (flags[flagSchema[0][0]]) {
    return data.servers;
  }
  if (args.length === 2 && args[1].startsWith("--")) {
    return [`--${flagSchema[0][0]}`];
  }
  return [...flagSchema.map(([name]) => `--${name}`), ...data.servers];
}
