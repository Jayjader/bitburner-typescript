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
export function getTargets(
  hosts: Map<string, ServerAttributes>,
  currentLevel: number,
  availableBusters: number,
) {
  return [...hosts]
    .filter(
      ([name, { minPorts, minLevel, maxMoney, growthFactor }]) =>
        name !== "home" &&
        minPorts <= availableBusters &&
        minLevel <= Math.ceil(currentLevel / 2) &&
        maxMoney > 0 &&
        growthFactor > 0,
    )
    .sort(
      ([, a], [, b]) =>
        (b.growthFactor * b.maxMoney) / b.minSecurity -
        (a.growthFactor * a.maxMoney) / a.minSecurity,
    );
}

export function getAllocatableRam(
  ns: NS,
  scripts: Record<string, string>,
  serverName: string,
  maxRam: number,
  workerScriptRamCost: number,
) {
  const usedRam = ns.getServerUsedRam(serverName);
  const workerUsedRam = scanServerForRunningWorkers(
    ns,
    scripts,
    serverName,
  ).reduce(
    (ramUsedByWorkers, { threads }) =>
      ramUsedByWorkers + threads * workerScriptRamCost,
    0,
  );
  const result = maxRam - usedRam + workerUsedRam;
  console.debug({
    message: "calculated allocatable ram",
    serverName,
    maxRam,
    usedRam,
    workerUsedRam,
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
