import { AutocompleteData, NS } from "@ns";
import {
  allocateBatches,
  getAllocatableRam,
  getCrackingTargets,
  getHackingTargets,
  scanServerForRunningWorkers,
  type ServerAttributes,
  type TaskAllocation,
} from "/scripts/scanning";
import { ports } from "/scripts/constants";
import { scripts as batchingScripts } from "/scripts/batching";

const executorScript = "scripts/executor.js";
const scripts = {
  basic: "scripts/simple-grow-weaken-hack.js",
  ...batchingScripts,
};
const flagSchema: Parameters<AutocompleteData["flags"]>[0] = [
  ["crack", false],
  ["allocate", false],
  ["dry-run", false],
  ["forbid-home", false],
  ["share", false],
  ["batch", false],
];

export function autocomplete(data: AutocompleteData, args: string[]) {
  const parsedFlags = data.flags(flagSchema);
  const remainingFlags = flagSchema
    .map(([name]) => name)
    .filter((name) => parsedFlags[name] === undefined);
  if (args.length && args[args.length - 1].startsWith("--")) {
    return remainingFlags;
  }
  return remainingFlags.map((name) => `--${name}`);
}

async function commandList(ns: NS, commands: string[]) {
  console.debug({ message: "writing command list", commands });
  const stringified = JSON.stringify(commands);
  const handle = ns.getPortHandle(ports.commandBus);
  while (!handle.tryWrite(stringified)) {
    await ns.sleep(550);
  }
}

const allocationFuncs = (ns: NS) => {
  const basicRamCost = ns.getScriptRam("scripts/simple-grow-weaken-hack.js");
  const hackThreadsNeeded = (serverName: string) =>
    1 / Math.max(ns.hackAnalyze(serverName), 1);
  const growThreadsNeeded =
    (serverName: string) => (server: { maxMoney: number }) =>
      ns.growthAnalyze(serverName, server.maxMoney); // presume server has 0 available money
  const weakenThreadsNeeded = (hackNeeded: number, growthNeeded: number) =>
    (ns.hackAnalyzeSecurity(hackNeeded) +
      ns.growthAnalyzeSecurity(growthNeeded)) /
    ns.weakenAnalyze(1);
  const minThreadCount = ([targetName, targetAttributes]: [
    string,
    { maxMoney: number },
  ]) => {
    const hackNeeded = hackThreadsNeeded(targetName);
    const growthNeeded = growThreadsNeeded(targetName)(targetAttributes);
    return Math.ceil(
      Math.max(
        hackNeeded,
        growthNeeded,
        weakenThreadsNeeded(hackNeeded, growthNeeded),
      ) / 2,
    );
  };
  return { basicRamCost, minThreadCount };
};
export async function main(ns: NS) {
  const parsedFlags = ns.flags(flagSchema);
  if (
    !(
      parsedFlags.crack ||
      parsedFlags.allocate ||
      parsedFlags.share ||
      parsedFlags.batch
    )
  ) {
    ns.tprintf("Run crack or allocate commands on automated targets");
    ns.tprintf(
      `USAGE: run ${ns.getScriptName()} ${flagSchema
        .map(([flagName]) => `{--${flagName}}`)
        .join(" ")}`,
    );
    ns.tprintf("EXAMPLES:");
    ns.tprintf(
      `> run ${ns.getScriptName()} --${
        flagSchema[0][0]
      } // only crack servers that can be`,
    );
    ns.tprintf(
      `> run ${ns.getScriptName()} --${flagSchema[1][0]} --${
        flagSchema[2][0]
      } // calculate allocation of basic hacking scripts but only print it to the terminal`,
    );
    ns.tprintf(
      `> run ${ns.getScriptName()} --${flagSchema[0][0]} --${
        flagSchema[1][0]
      } --${flagSchema[3][0]} --${
        flagSchema[4][0]
      } // do several things: find servers to crack, allocate usable server RAM for hacking, and allocate remaining RAM for sharing; allocate no RAM from home`,
    );
    return;
  }
  ns.disableLog("sleep");
  ns.disableLog("scan");
  let portBusters = 0;
  const hosts = await mapServers(new Map(), ns);

  if (
    !parsedFlags["dry-run"] &&
    !ns.ps("home").some(({ filename }) => filename === executorScript)
  ) {
    console.debug({ message: "starting executor..." });
    if (ns.exec(executorScript, "home")) {
      console.debug({ message: "executor started." });
    }
  }

  // eslint-disable-next-line no-constant-condition
  portBusters = await countAvailablePortOpeners(ns);
  if (parsedFlags.crack) {
    const crackTargets = [];
    for (const host of getCrackingTargets(hosts, portBusters)) {
      if (!ns.hasRootAccess(host)) {
        crackTargets.push(host);
      }
    }
    if (crackTargets.length) {
      if (parsedFlags["dry-run"]) {
        ns.tprintf(`Crack targets: ${crackTargets.join(", ")}`);
      } else {
        await commandList(
          ns,
          crackTargets.map((target) => `crack:${target}`),
        );
      }
    }
  }
  type ServerAllocation = ServerAttributes & {
    allocated: boolean;
    allocatableRam: number;
  };
  const availableHosts = [...hosts].reduce((accum, [name, attributes]) => {
    if (!parsedFlags["forbid-home"] || name !== "home") {
      const allocation = {
        ...attributes,
        allocated: false,
        allocatableRam: getAllocatableRam(ns, name, attributes.maxRam),
      };
      if (allocation.allocatableRam > 0) {
        accum.push([name, allocation]);
      }
    }
    return accum;
  }, new Array<[string, ServerAllocation]>());
  if (parsedFlags.batch) {
    // TODO: c.f. Communication: Making your first proto-batcher at https://darktechnomancer.github.io/
    // tl;dr: it's time to attempt batches against the same target staggered over time
    const targets = getHackingTargets(
      hosts,
      ns.getHackingLevel(),
      portBusters,
    ).map(([name]) => name);
    const batchAllocations = allocateBatches(
      ns,
      scripts,
      hosts,
      !parsedFlags["forbid-home"],
      targets,
    );

    const ramCosts = Object.fromEntries(
      Object.entries(scripts).map(([key, filename]) => [
        key,
        ns.getScriptRam(filename),
      ]),
    );
    const perServer = new Map();
    const perTarget = new Map();
    for (const [hostname, allocations] of batchAllocations) {
      const stuff = {
        ramAllocated: 0,
        tasks: [],
      };
      for (const { target, command, threads, endAt, runFor } of allocations) {
        if (!perTarget.has(target)) {
          perTarget.set(target, []);
        }
        perTarget
          .get(target)!
          .push({ hostname, command, threads, endAt, runFor });
        stuff.ramAllocated += ramCosts[command] * threads;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        stuff.tasks.push({ target, command, threads });
      }
      perServer.set(hostname, stuff);
    }
    console.debug(perTarget);
    if (perTarget.size > 0) {
      if (parsedFlags["dry-run"]) {
        ns.tprintf(`${JSON.stringify([...perTarget])}`);
      } else {
        await commandList(
          ns,
          [...perTarget].map(
            ([target, batches]) => `batch:${target}:${JSON.stringify(batches)}`,
          ),
        );
      }
    }
  }
  if (parsedFlags.allocate) {
    const allocFuncs = allocationFuncs(ns);

    const targets = getHackingTargets(
      hosts,
      ns.getHackingLevel(),
      portBusters,
    ).sort(
      ([, a], [, b]) =>
        (b.growthFactor * b.maxMoney) / b.minSecurity -
        (a.growthFactor * a.maxMoney) / a.minSecurity,
    );
    const allocatedTasks = new Map<string, TaskAllocation[]>();
    let nextTarget: [string, ServerAttributes] | undefined;
    // eslint-disable-next-line no-cond-assign
    allocateTargets: while ((nextTarget = targets.shift())) {
      const [targetName] = nextTarget;
      const threadsNeeded = allocFuncs.minThreadCount(nextTarget);
      const ramNeeded = threadsNeeded * allocFuncs.basicRamCost;
      console.debug({
        message: "calculated cost to hack target",
        targetName,
        threadsNeeded,
        ramNeeded,
      });
      const smallestAllocatable = availableHosts
        .filter(
          ([serverName, { allocated, allocatableRam }]) =>
            !allocated &&
            allocatableRam +
              scanServerForRunningWorkers(ns, scripts, serverName).reduce(
                (ramUsedByWorkers, { threads }) =>
                  ramUsedByWorkers + threads * allocFuncs.basicRamCost,
                0,
              ) >=
              ramNeeded,
        )
        .sort(([, a], [, b]) => a.allocatableRam - b.allocatableRam)
        .pop();
      if (smallestAllocatable) {
        const [serverName, serverAllocation] = smallestAllocatable;
        const task = { target: targetName, threads: threadsNeeded };
        allocatedTasks.set(serverName, [task]);
        serverAllocation.allocated = true;
        serverAllocation.allocatableRam -=
          threadsNeeded * allocFuncs.basicRamCost;
        console.debug({
          message: "target covered in single allocation",
          server: [serverName, serverAllocation],
          tasks: allocatedTasks.get(serverName),
        });
        continue;
      }
      console.debug({
        message: "unable to cover target in single allocation",
        targetName,
        threadsNeeded,
        ramCost: allocFuncs.basicRamCost,
      });
      // no valid smallest unallocated => look at the allocated
      // no unallocated => look at the allocated
      let threadsLeft = threadsNeeded;
      while (threadsLeft > 0) {
        console.debug({
          message: "attempting to allocate threads",
          threadsLeft,
          available: Object.fromEntries(
            availableHosts.map(([name, { allocatableRam }]) => [
              name,
              Math.floor(allocatableRam * 10) / 10,
            ]),
          ),
        });
        const canAllocateMost = availableHosts
          .filter(
            ([, { allocatableRam }]) =>
              allocatableRam >= allocFuncs.basicRamCost,
          )
          .sort(
            ([, aAllocation], [, bAllocation]) =>
              aAllocation.allocatableRam - bAllocation.allocatableRam,
          )
          .pop();
        if (canAllocateMost === undefined) {
          console.info({
            message: "allocation exhausted",
            targetName,
            threadsLeft,
          });
          break allocateTargets; // no sense continuing to next target if we can't even allocate 1 thread somewhere
        }
        const [serverName, serverAllocation] = canAllocateMost;
        const threadsAvailable = Math.floor(
          serverAllocation.allocatableRam / allocFuncs.basicRamCost,
        );
        const threads = Math.min(threadsAvailable, threadsLeft);
        const taskAllocationRamCost = threads * allocFuncs.basicRamCost;
        const task = { target: targetName, threads };
        console.debug({
          message: "calculated threads to allocate for target on server",
          serverName,
          serverAllocation,
          threadsAvailable,
          task,
          ramCost: allocFuncs.basicRamCost,
          threadsLeft,
        });
        if (!allocatedTasks.has(serverName)) {
          allocatedTasks.set(serverName, []);
        }
        const tasks = allocatedTasks.get(serverName)!;
        tasks.push(task);
        threadsLeft -= threads;
        serverAllocation.allocatableRam -= taskAllocationRamCost;
        console.debug({
          message: "partial allocation",
          serverName,
          task,
          taskAllocationRamCost,
          threadsLeft,
        });
      }
    }
    const commandArray = [];
    for (const [server, tasks] of allocatedTasks) {
      for (const { target, threads } of tasks) {
        commandArray.push(`allocate:${server}:${target}:${threads}`);
      }
    }
    if (commandArray.length > 0) {
      if (parsedFlags["dry-run"]) {
        ns.tprintf(`Commands: ${commandArray.join(", ")}`);
      } else {
        await commandList(ns, commandArray);
      }
    }
  }
  if (parsedFlags.share) {
    const shareScriptRamCost = 4;
    const toShare = availableHosts.filter(
      ([, { allocatableRam }]) => allocatableRam > shareScriptRamCost,
    );
    const shareCommands = [];
    for (const [serverName, allocation] of toShare) {
      if (parsedFlags["forbid-home"] && serverName === "home") {
        continue;
      }
      const threads = Math.floor(
        allocation.allocatableRam / shareScriptRamCost,
      );
      shareCommands.push(`share:${serverName}:${threads}`);
      allocation.allocated = true;
    }
    if (shareCommands.length > 0) {
      if (parsedFlags["dry-run"]) {
        ns.tprintf(`Share: ${shareCommands.join(", ")}`);
      } else {
        await commandList(ns, shareCommands);
      }
    }
  }
}

const staticServerFile = "data/server-static.txt";
async function mapServers(serverMap: Map<string, ServerAttributes>, ns: NS) {
  ns.rm(staticServerFile);
  ns.exec(
    "scripts/map-static-server-attributes.js",
    "home",
    1,
    "--output",
    staticServerFile,
  );
  while (!ns.fileExists(staticServerFile)) {
    await ns.sleep(100);
  }
  const serverMapRaw = JSON.parse(ns.read(staticServerFile));
  for (const [server, attrs] of serverMapRaw) {
    serverMap.set(server, attrs);
  }
  return serverMap;
}

async function countAvailablePortOpeners(ns: NS) {
  ns.exec(
    "scripts/count-port-busters.js",
    "home",
    1,
    "--port",
    ports.portOpenerCount,
  );
  let count;
  while (typeof (count = ns.readPort(ports.portOpenerCount)) !== "number") {
    await ns.sleep(200);
    //comment
  }

  console.debug({ message: `port openers found`, count });
  return count;
}
