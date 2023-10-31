import { NS } from "@ns";

export type ServerAttributes = {
  minLevel: number; // minimum hacking level needed to grow/weaken/hack/backdoor.
  minSecurity: number; // server minimum security level.
  minPorts: number; // minimum number of ports to open on server before being able to NUKE.exe it.
  maxRam: number; // total server RAM.
  maxMoney: number; // maximum money server can hold.
  growthFactor: number; // how much server is affected by grow()
};

export type TaskAllocation = { target: string; threads: number };

export function getFreeHosts(
  hosts: Map<string, ServerAttributes>,
  availableBusters: number,
) {
  return [...hosts]
    .filter(
      ([hostname, { minPorts, maxRam }]) =>
        (hostname === "home" || minPorts <= availableBusters) && maxRam > 0,
    )
    .sort(([, a], [, b]) => b.maxRam - a.maxRam);
}
export function getCrackingTargets(
  hosts: Map<string, ServerAttributes>,
  portOpenerCount: number,
) {
  return [...hosts].reduce((accum, [name, { minPorts }]) => {
    if (minPorts <= portOpenerCount) {
      accum.push(name);
    }
    return accum;
  }, new Array<string>());
}
export function getHackingTargets(
  hosts: Map<string, ServerAttributes>,
  currentLevel: number,
  availableBusters: number,
) {
  return [...hosts].filter(
    ([name, { minPorts, minLevel, maxMoney, growthFactor }]) =>
      name !== "home" &&
      minPorts <= availableBusters &&
      minLevel <= Math.ceil(currentLevel / 2) &&
      maxMoney > 0 &&
      growthFactor > 0,
  );
}

export function getAllocatableRam(ns: NS, serverName: string, maxRam: number) {
  const usedRam = ns.getServerUsedRam(serverName);
  const result = maxRam - usedRam;
  console.debug({
    message: "calculated free ram",
    serverName,
    maxRam,
    usedRam,
    result,
  });
  if (serverName === "home") {
    return Math.max(0, result - 200);
  }
  return result;
}
export function scanServerForRunningWorkers(
  ns: NS,
  scripts: Record<string, string>,
  serverName: string,
) {
  const workers = [];
  for (const { filename, pid, args, threads } of ns.ps(serverName)) {
    for (const [command, scriptFile] of Object.entries(scripts)) {
      if (filename === scriptFile) {
        const [target] = args;
        workers.push({ command, gpid: pid, target: target as string, threads });
      }
    }
  }
  return workers;
}
export function scanForRunningWorkers(ns: NS, scripts: Record<string, string>) {
  const seen = new Map<string, Array<RunningWorker>>();
  const to_scan = ["home"];
  let scanning;
  while ((scanning = to_scan.shift())) {
    if (seen.has(scanning)) {
      continue;
    }
    seen.set(scanning, scanServerForRunningWorkers(ns, scripts, scanning));
    to_scan.push(...ns.scan(scanning));
  }
  return seen;
}

export type RunningWorker = {
  command: string;
  target: string;
  gpid: number;
  threads: number;
};
export type WorkerConfig = Partial<RunningWorker>;

export function updateConfigs(
  configs: Map<string, Array<RunningWorker>>,
  scanResults: Map<string, Array<RunningWorker>>,
) {
  // update and prune existing configs from scan results
  for (const server of configs.keys()) {
    const result = scanResults.get(server);
    if (result) {
      const configured = configs.get(server)!;
      let to_remove;
      while (
        (to_remove = configured.findIndex(
          ({ target }) => !result.some((r) => r.target === target),
        )) >= 0
      ) {
        configured.splice(to_remove, 1);
      }
      let to_replace: RunningWorker;
      while (
        (to_replace = configured.find(({ target, threads }) =>
          result.some((r) => r.target === target && r.threads !== threads),
        )!) !== undefined
      ) {
        console.debug({
          message: "configured worker found changed",
          to_replace,
          result,
        });
        to_replace.threads = result.find(
          ({ target }) => target === to_replace.target,
        )!.threads;
      }
    } else {
      for (const config of configs.get(server)!) {
        console.debug({ message: "configured worker missing", config, result });
      }
      configs.delete(server);
    }
  }
  // create new configs from scan results where needed
  for (const [scanned, result] of scanResults) {
    if (!result) {
      continue;
    }
    if (!configs.has(scanned)) {
      configs.set(scanned, []);
    }
    const configured = configs.get(scanned)!;
    for (const worker of result) {
      if (!configured.some(({ target }) => target === worker.target)) {
        console.debug({
          message: "found unconfigured worker",
          worker,
          scanned,
        });
        configured.push(worker);
      }
    }
  }
}

export type ServerAllocation = ServerAttributes & {
  allocated: boolean;
  allocatableRam: number;
};
export type BatchTask = {
  command: string;
  endAt: number;
  runFor: number;
  threads: number;
};
export type Batch = { target: string; tasks: BatchTask[] };
export type BatchAllocation = { target: string } & BatchTask;
export function allocateBatches(
  ns: NS,
  scripts: Record<string, string>,
  hosts: Map<string, ServerAttributes>,
  allowHome: boolean,
  targets: string[],
  startDelay = 1_000,
  delay = 5,
) {
  const ramCosts: Record<keyof typeof scripts, number> = Object.fromEntries(
    Object.entries(scripts).map(([key, filename]) => [
      key,
      ns.getScriptRam(filename),
    ]),
  );
  // Gather up-to-date host information
  const availableHosts: Array<[string, ServerAllocation]> = [];
  for (const [host, attributes] of hosts) {
    if ((allowHome || host !== "home") && ns.hasRootAccess(host)) {
      const allocatableRam = attributes.maxRam - ns.getServerUsedRam(host);
      if (allocatableRam > 0) {
        availableHosts.push([
          host,
          { ...attributes, allocated: false, allocatableRam },
        ] as [string, ServerAllocation]);
      }
    }
  }

  // Calculate batch sizes for target list
  const batches: Batch[] = [];
  for (const target of targets) {
    const hack =
      ns.getServerSecurityLevel(target) <=
      1 + ns.getServerMinSecurityLevel(target);
    const growDuration = ns.getGrowTime(target);
    const weakenDuration = ns.getWeakenTime(target);
    const hackDuration = ns.getHackTime(target);
    const moneyToHackRatio = 0.2;
    const hackThreadsWanted = Math.max(
      1,
      Math.floor(moneyToHackRatio / ns.hackAnalyze(target)),
    );
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
    batches.push({
      target,
      tasks: [
        {
          command: "weaken",
          endAt: endTime - 2 * delay,
          runFor: weakenDuration,
          threads: weaken1ThreadsNeeded,
        },
        {
          command: "weaken",
          endAt: endTime,
          runFor: weakenDuration,
          threads: weaken2ThreadsNeeded,
        },
        {
          command: "grow",
          endAt: endTime - delay,
          runFor: growDuration,
          threads: growThreadsNeeded,
        },
        ...(hack
          ? [
              {
                command: "hack",
                endAt: endTime - 3 * delay,
                runFor: hackDuration,
                threads: hackThreadsWanted,
              },
            ]
          : []),
      ],
    });
  }

  // allocate batches according to available host ram
  const batchAllocations = new Map<string, BatchAllocation[]>();
  for (const { target, tasks } of batches) {
    const batchAssignments = [];
    // check that we can allocate all tasks for a before _actually_ allocating it
    let couldntFit = false;
    for (const { command, threads, endAt, runFor } of tasks) {
      // find server that can hold entire task
      const bestFit = availableHosts.find(
        ([, allocation]) =>
          allocation.allocatableRam >= ramCosts[command] * threads,
      );
      if (!bestFit) {
        console.debug({
          message: "batch allocation failed to find fit at all",
          target,
          command,
          threads,
          endAt,
          runFor,
        });
        couldntFit = true;
        break;
      }
      // allocate task to server
      const [serverName] = bestFit;
      batchAssignments.push({
        serverName,
        target,
        command,
        threads,
        endAt,
        runFor,
      });
    }
    if (couldntFit) {
      // couldn't allocate entire batch => skip batch
      continue;
    }
    // allocation succeeds => _actually_ store/retain allocation, and update remaining ram counts
    for (const {
      serverName,
      target,
      command,
      threads,
      endAt,
      runFor,
    } of batchAssignments) {
      if (!batchAllocations.has(serverName)) {
        batchAllocations.set(serverName, []);
      }
      batchAllocations
        .get(serverName)!
        .push({ target, command, runFor, endAt, threads });
      const [, allocation] = availableHosts.find(
        ([hostname]) => hostname === serverName,
      )!;
      allocation.allocatableRam -= ramCosts[command] * threads;
    }
  }
  return batchAllocations;
}
