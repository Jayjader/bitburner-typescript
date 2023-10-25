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
  Share: /share:((?:\w|-|\.)+):(\d+)/,
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
    await ns.sleep(200);
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

    const commandList = commandRaw.startsWith("[")
      ? (JSON.parse(commandRaw) as string[])
      : [commandRaw];
    log({ commandList });

    for (const command of commandList) {
      if (!destination_matcher.test(command)) {
        continue;
      }
      const [, destination] = destination_matcher.exec(command)!;

      if (commands.Crack.test(command)) {
        await ns.sleep(100);
        if (ns.exec(scripts.crack, "home", 1, destination)) {
          log({ message: "crack launched", destination });
        }
        await ns.sleep(100);
        continue;
      }

      if (!workers.get(destination)) {
        workers.set(destination, []);
      }
      const workersAtDestination = workers.get(destination)!;
      if (commands.Target.test(command)) {
        // todo
      } else if (commands.Basic.test(command)) {
        // todo
      } else if (commands.Allocate.test(command)) {
        const [, newTarget, threadCount] = commands.Allocate.exec(command)!;
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
            await ns.sleep(500);
            const gpid = spawnWorker(
              ns,
              "basic",
              destination,
              newTarget,
              threads,
            );
            await ns.sleep(500);
            if (gpid) {
              existingWorker.gpid = gpid;
              existingWorker.threads = threads;
              existingWorker.command = "basic";
            } else {
              log("spawning allocated worker failed");
              return;
            }
          }
        } else {
          const gpid = spawnWorker(
            ns,
            "basic",
            destination,
            newTarget,
            threads,
          );
          await ns.sleep(500);
          workersAtDestination.push({
            command: "basic",
            target: newTarget,
            gpid,
            threads,
          });
        }
      } else if (commands.Share.test(command)) {
        const [, serverName, threads] = commands.Share.exec(command)!;
        const threadCount = parseInt(threads, 10);
        ns.scp(scripts.share, serverName);
        const gpid = ns.exec(scripts.share, serverName, threadCount);
        if (gpid) {
          log({
            message: "spawned share worker",
            serverName,
            threadCount,
            gpid,
          });
        } else {
          log({
            message: "spawning share worker failed",
            serverName,
            threadCount,
          });
        }
        // workersAtDestination.push() <-- needed ? the following command will trigger a scan which might pick up the share scripts
      } else if (commands.Grow.test(command)) {
        // todo
      } else if (commands.Weaken.test(command)) {
        // todo
      } else if (commands.Hack.test(command)) {
        // todo
      } else if (commands.Stop.test(command)) {
        /*
            killWorker(ns, worker)
            */
      } else if (commands.Purge.test(command)) {
        const [, server] = commands.Purge.exec(command)!;
        ns.killall(server);
      } else if (commands.StopAll.test(command)) {
        ns.exec(scripts.killall, "home");
      }
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
  // if the script fails post-exec then executor hangs on next debug command
  const gpid = ns.exec(scripts[command], destination, threads, target);
  if (gpid > 0) {
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
