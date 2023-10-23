import { NS } from "@ns";
import { ports } from "scripts/constants.js";
import { createLogger } from "scripts/logging.js";
import {
  type RunningWorker,
  type WorkerConfig,
  updateConfigs,
  scanForRunningWorkers,
} from "/scripts/scanning";

const commands = {
  Crack: /crack:(?:\w|-|\.)+/,
  Grow: /grow:(?:\w|-|\.)+/,
  Weaken: /weaken:(?:\w|-|\.)+/,
  Hack: /hack:(?:\w|-|\.)+/,
  Target: /target:(?:\w|-|\.)+:((?:\w|-|\.)+)/,
  Basic: /basic:(?:\w|-|\.)+/,
  Stop: /stop:(?:\w|-|\.)+/,
  Purge: /purge:(?:\w|-|\.)+/,
  StopAll: /stopall/,
  Allocate: /allocate:(?:\w|-|\.)+:((?:\w|-|\.)+):(\d+)/,
};
// matches a hostname after a :
const destination_matcher = /\w+:((?:\w|-|\.)+)/;

const scripts = {
  basic: "scripts/simple-grow-weaken-hack.js",
  crack: "scripts/nuke.js",
  killall: "scripts/killall.js",
  share: "scripts/share.js",
};

const logFile = `logs/executor__${new Date().toISOString()}.txt`;
let log: ReturnType<typeof createLogger>;

export async function main(ns: NS) {
  ns.disableLog("sleep");
  ns.disableLog("scan");
  log = createLogger(ns, logFile);
  const workers = new Map<string, Array<RunningWorker>>();
  // todo: dump JSON.stringify([...workers]) into file in /data/ on exit
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const commandRaw = ns.peek(ports.commandBus) as string;
    if (commandRaw === "NULL PORT DATA") {
      await ns.sleep(1_000);
      continue;
    }
    log({ message: "command read", commandRaw });
    updateConfigs(
      log,
      workers,
      scanForRunningWorkers(ns, {
        basic: scripts.basic /* ignore crack, etc*/,
      }),
    ); ///cecebbbb

    // pop command off of queue. it is already stored in commandRaw so we can just drop the return value here
    ns.readPort(ports.commandBus);

    if (commandRaw.startsWith("debug")) {
      if (commandRaw === "debug") ns.tprintf(JSON.stringify([...workers]));
      continue;
    }

    if (!destination_matcher.test(commandRaw)) {
      continue;
    }
    const [, destination] = destination_matcher.exec(commandRaw)!;

    if (commands.Crack.test(commandRaw)) {
      if (ns.exec(scripts.crack, "home", 1, destination)) {
        log({ message: "crack launched", destination });
      }
      continue;
    }

    if (!workers.get(destination)) {
      workers.set(destination, []);
    }
    const workersAtDestination = workers.get(destination)!;
    if (commands.Target.test(commandRaw)) {
      // todo
    } else if (commands.Basic.test(commandRaw)) {
      // todo
    } else if (commands.Allocate.test(commandRaw)) {
      const [, newTarget, threadCount] = commands.Allocate.exec(commandRaw)!;
      const threads = parseInt(threadCount, 10);
      const existingWorker = workersAtDestination.find(
        ({ target }) => target === newTarget,
      );
      if (existingWorker) {
        log({
          message: "found existing worker for task to allocate",
          destination,
          newTarget,
          threads,
          existingWorker,
        });
        if (
          existingWorker.command !== "basic" ||
          existingWorker.threads !== threads
        ) {
          killWorker(ns, existingWorker);
          const gpid = spawnWorker(
            ns,
            "basic",
            destination,
            newTarget,
            threads,
          );
          if (gpid) {
            existingWorker.gpid = gpid;
            existingWorker.threads = threads;
            existingWorker.command = "basic";
          }
        }
      } else {
        const gpid = spawnWorker(ns, "basic", destination, newTarget, threads);
        workersAtDestination.push({
          command: "basic",
          target: newTarget,
          gpid,
          threads,
        });
      }
    } else if (commands.Grow.test(commandRaw)) {
      // todo
    } else if (commands.Weaken.test(commandRaw)) {
      // todo
    } else if (commands.Hack.test(commandRaw)) {
      // todo
    } else if (commands.Stop.test(commandRaw)) {
      /*
            killWorker(ns, worker)
            */
    } else if (commands.Purge.test(commandRaw)) {
      const [, server] = commands.Purge.exec(commandRaw)!;
      ns.killall(server);
    } else if (commands.StopAll.test(commandRaw)) {
      ns.exec(scripts.killall, "home");
    }
  }
}

function spawnWorker(
  ns: NS,
  command: keyof typeof scripts,
  destination: string,
  target: string,
  threads = -1,
) {
  const script = scripts[command];
  if (!ns.fileExists(script, destination)) {
    ns.scp(script, destination, "home");
  }
  if (threads < 0) {
    const scriptRam = ns.getScriptRam(script);
    const freeRam =
      (destination === "home" ? 0.95 : 1) *
      (ns.getServerMaxRam(destination) - ns.getServerUsedRam(destination));
    threads = Math.floor(freeRam / (scriptRam === 0 ? 1 : scriptRam));
  }
  if (threads === 0) {
    log({ message: "not enough RAM to spawn worker", destination });
    return 0;
  }
  log({ message: "spawning worker", command, destination, target });
  const gpid = ns.exec(scripts[command], destination, threads, target);
  if (gpid) {
    ns.toast(
      `New ${command} worker (${gpid}) on ${destination} targeting ${target} with ${threads} threads.`,
      "info",
      5_000,
    );
  }
  return gpid;
}

function killWorker(ns: NS, worker: RunningWorker) {
  //log({ message: 'killWorker called', worker })
  log({ message: "killing pid", pid: worker.gpid });
  if (ns.kill(worker.gpid)) {
    log({ message: "worker killed", worker });
    //worker.gpid = undefined
  }
}
