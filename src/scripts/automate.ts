import { AutocompleteData, NS } from "@ns";
import {
  type ServerAttributes,
  type TaskAllocation,
  getTargets,
  getFreeHosts,
  scanServerForRunningWorkers,
  getAllocatableRam,
} from "/scripts/scanning";
import { ports } from "scripts/constants";
import { createLogger } from "scripts/logging";
const executorScript = "scripts/executor.js";
const logFile = `logs/automate__${new Date().toISOString()}.txt`;
let log: ReturnType<typeof createLogger>;
const scripts = { basic: "scripts/simple-grow-weaken-hack.js" };
async function command(ns: NS, commandString: string) {
  log(commandString);
  while (!ns.tryWritePort(ports.commandBus, commandString)) {
    await ns.sleep(550);
  }
}
async function commandList(ns: NS, commands: string[]) {
  log({ message: "writing command list", commands });
  const stringified = JSON.stringify(commands);
  const handle = ns.getPortHandle(ports.commandBus);
  while (!handle.tryWrite(stringified)) {
    await ns.sleep(550);
  }
}
const flags: Parameters<AutocompleteData["flags"]>[0] = [
  ["crack", false],
  ["allocate", false],
  ["dry-run", false],
  ["allow-home", false],
  ["allow-share", false],
];

export function autocomplete(data: AutocompleteData, args: string[]) {
  const parsedFlags = data.flags(flags);
  const remainingFlags = flags
    .map(([name]) => name)
    .filter((name) => parsedFlags[name] === undefined);
  if (args.length && args[args.length - 1].startsWith("--")) {
    return remainingFlags;
  }
  return remainingFlags.map((name) => `--${name}`);
}
export async function main(ns: NS) {
  const parsedFlags = ns.flags(flags);
  if (
    !(parsedFlags.crack || parsedFlags.allocate || parsedFlags["allow-share"])
  ) {
    ns.tprintf("Run crack or allocate commands on automated targets");
    ns.tprintf(
      `USAGE: run ${ns.getScriptName()} --${flags[0][0]} <true|false> --${
        flags[1][0]
      } <true|false> {--${flags[2][0]}}`,
    );
    ns.tprintf("Example:");
    ns.tprintf(`> run ${ns.getScriptName()} --${flags[0][0]} true`);
    return;
  }
  ns.disableLog("sleep");
  ns.disableLog("scan");
  log = createLogger(ns, logFile);
  const getAllocatableRamForServer = (
    serverName: string,
    maxRam: number,
    ramCostPerThread: number,
  ) =>
    getAllocatableRam(ns, log, scripts, serverName, maxRam, ramCostPerThread);
  let portBusters = 0;
  const hosts = await mapServers(new Map(), ns);

  /*bbbbb
  if (!ns.ps("home").some(({ filename }) => filename === executorScript)) {
    log("starting executor...");
    if (ns.exec(executorScript, "home")) {
      log("executor started");
    }
  }
*/

  const debug = () => command(ns, "debug");
  const crack = (target: string) => command(ns, `crack:${target}`);
  const target = (from_: string) => (to_: string) =>
    command(ns, `target:${from_}:${to_}`);
  const basic = (from_: string) => command(ns, `basic:${from_}`);
  const allocate = (from_: string) => (to_: string) => (threads: number) =>
    command(ns, `allocate:${from_}:${to_}:${threads}`);
  const commands = { debug, crack, target, basic, allocate };

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
      ),
    );
  };

  // eslint-disable-next-line no-constant-condition
  portBusters = await countAvailablePortOpeners(ns);
  const targets = getTargets(hosts, ns.getHackingLevel(), portBusters);
  if (parsedFlags.crack) {
    const crackCommands = [];
    for (const [host] of getFreeHosts(hosts, portBusters)) {
      if (!ns.hasRootAccess(host)) {
        crackCommands.push(`crack:${host}`);
      }
    }
    for (const [host] of targets) {
      if (!ns.hasRootAccess(host)) {
        crackCommands.push(`crack:${host}`);
      }
    }
    if (crackCommands.length) {
      if (parsedFlags["dry-run"]) {
        log({ crackCommands });
      } else {
        await commandList(ns, crackCommands);
      }
    }
  }
  type ServerAllocation = ServerAttributes & {
    allocated: boolean;
    allocatableRam: number;
  };
  const availableHosts = [...hosts]
    .filter(
      ([name]) =>
        (parsedFlags["allow-home"] || name !== "home") &&
        ns.hasRootAccess(name),
    )
    .map(
      ([name, attributes]) =>
        [
          name,
          {
            ...attributes,
            allocated: false,
            allocatableRam: getAllocatableRamForServer(
              name,
              attributes.maxRam,
              basicRamCost,
            ),
          },
        ] as [string, ServerAllocation],
    )
    .filter(([, { allocatableRam }]) => allocatableRam > 0);
  if (parsedFlags.allocate) {
    const allocatedTasks = new Map<string, TaskAllocation[]>();
    let nextTarget: [string, ServerAttributes] | undefined;
    // eslint-disable-next-line no-cond-assign
    allocateTargets: while ((nextTarget = targets.shift())) {
      const [targetName] = nextTarget;
      const threadsNeeded = minThreadCount(nextTarget);
      log({ targetName, threadsNeeded });
      const ramNeeded = threadsNeeded * basicRamCost;
      const smallestAllocatable = availableHosts
        .filter(
          ([, { allocated, allocatableRam }]) =>
            !allocated && allocatableRam >= ramNeeded,
        )
        .sort(([, a], [, b]) => a.allocatableRam - b.allocatableRam)
        .pop();
      if (smallestAllocatable) {
        const [serverName, serverAllocation] = smallestAllocatable;
        const task = { target: targetName, threads: threadsNeeded };
        allocatedTasks.set(serverName, [task]);
        serverAllocation.allocated = true;
        serverAllocation.allocatableRam -= threadsNeeded * basicRamCost;
        log({
          message: "target covered in single allocation",
          server: [serverName, serverAllocation],
          tasks: allocatedTasks.get(serverName),
        });
        continue;
      }
      log({
        message: "unable to cover target in single allocation",
        targetName,
        threadsNeeded,
        basicRamCost,
      });
      // no valid smallest unallocated => look at the allocated
      // no unallocated => look at the allocated
      let threadsLeft = threadsNeeded;
      while (threadsLeft > 0) {
        log({
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
          .filter(([, { allocatableRam }]) => allocatableRam >= basicRamCost)
          .sort(
            ([, aAllocation], [, bAllocation]) =>
              aAllocation.allocatableRam - bAllocation.allocatableRam,
          )
          .pop();
        if (canAllocateMost === undefined) {
          log({ message: "allocation exhausted", targetName, threadsLeft });
          break allocateTargets; // no sense continuing to next target if we can't even allocate 1 thread somewhere
        }
        const [serverName, serverAllocation] = canAllocateMost;
        log({
          threadsCalculation: {
            serverName,
            serverAllocation,
            threadsLeft,
            basicRamCost,
          },
        });
        const threadsAvailable = Math.floor(
          serverAllocation.allocatableRam / basicRamCost,
        );
        const threads = Math.min(threadsAvailable, threadsLeft);
        const taskAllocationRamCost = threads * basicRamCost;
        const task = { target: targetName, threads };
        if (!allocatedTasks.has(serverName)) {
          allocatedTasks.set(serverName, []);
        }
        const tasks = allocatedTasks.get(serverName)!;
        tasks.push(task);
        threadsLeft -= threads;
        serverAllocation.allocatableRam -= taskAllocationRamCost;
        log({
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
        // await commands.allocate(server)(target)(threads);
      }
    }
    if (commandArray.length > 0) {
      if (parsedFlags["dry-run"]) {
        log({ commandArray });
      } else {
        await commandList(ns, commandArray);
      }
    }
  }
  if (parsedFlags["allow-share"]) {
    const shareScriptRamCost = 4;
    const toShare = availableHosts.filter(
      ([, { allocatableRam }]) => allocatableRam > shareScriptRamCost,
    );
    const shareCommands = [];
    for (const [serverName, allocation] of toShare) {
      if (!parsedFlags["allow-home"] && serverName === "home") {
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
        log({ shareCommands });
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

  log(`port openers found: ${count}`);
  return count;
}
