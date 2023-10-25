import { NS } from "@ns";
import { ports } from "scripts/constants.js";
import { createLogger } from "scripts/logging.js";
import {
  type RunningWorker,
  scanForRunningWorkers,
  updateConfigs,
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
  const commandBus = ns.getPortHandle(ports.commandBus);
  const workers = new Map<string, Array<RunningWorker>>();
  // todo: dump JSON.stringify([...workers]) into file in /data/ on exit
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await commandBus.nextWrite();
    const commandRaw = ns.readPort(ports.commandBus) as string;
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

    const spawned = [];
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
            await ns.sleep(300);
            const gpid = spawnWorker(
              ns,
              "basic",
              destination,
              newTarget,
              threads,
            );
            await ns.sleep(250);
            if (gpid) {
              existingWorker.gpid = gpid;
              existingWorker.threads = threads;
              existingWorker.command = "basic";
              spawned.push({
                command: "basic",
                destination,
                target: newTarget,
                threads,
                gpid,
              });
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
          await ns.sleep(250);
          if (gpid) {
            workersAtDestination.push({
              command: "basic",
              target: newTarget,
              gpid,
              threads,
            });
            spawned.push({
              command: "basic",
              destination,
              target: newTarget,
              threads,
              gpid,
            });
          }
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

    if (spawned.length > 0) {
      const spawnStats = spawned.reduce(
        (accum, { command, gpid, destination, target, threads }) => {
          // return `New ${command} worker (${gpid}) on ${destination} targeting ${target} with ${threads} threads.`;
          if (!accum.has(command)) {
            accum.set(command, new Map());
          }
          const commandStats = accum.get(command) as Map<
            string,
            { threads: number; pids: number[]; hosts: string[] }
          >;
          if (!commandStats.has(target)) {
            commandStats.set(target, { threads: 0, pids: [], hosts: [] });
          }
          const targetStats = commandStats.get(target)!;
          targetStats.threads += threads;
          targetStats.pids.push(gpid);
          targetStats.hosts.push(destination);
          return accum;
        },
        new Map<
          string,
          Map<string, { threads: number; pids: number[]; hosts: string[] }>
        >(),
      );
      for (const [command, targets] of spawnStats) {
        for (const [target, { threads, pids, hosts }] of targets) {
          ns.toast(
            `${target}: ${threads} ${command} threads across ${
              hosts.length
            } hosts and ${pids.length} processes. (hosts: ${hosts.join(
              ", ",
            )}; pids: ${pids.join(", ")})`,
            "info",
            25_000,
          );
        }
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
  const delay = command === "basic" ? Math.ceil(Math.random() * 10_000) : 0;
  log({
    message: "spawning worker",
    command,
    destination,
    target,
    threads,
    delay,
  });
  const args = [target, ...(delay > 0 ? ["--delay", delay] : [])];
  // if the script fails post-exec then executor hangs on next debug command
  return ns.exec(scripts[command], destination, threads, ...args);
}

function killWorker(ns: NS, worker: RunningWorker) {
  //log({ message: 'killWorker called', worker })
  log({ message: "killing pid", pid: worker.gpid });
  if (ns.kill(worker.gpid)) {
    log({ message: "worker killed", worker });
    //worker.gpid = undefined
  }
}
