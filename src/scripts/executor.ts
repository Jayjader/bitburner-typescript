import { NS } from "@ns";
import { ports } from "/scripts/constants.js";
import {
  type RunningWorker,
  scanForRunningWorkers,
  updateConfigs,
} from "/scripts/scanning";
import { scripts as batchScripts } from "/scripts/batching";

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
  Batch: /batch:((?:\w|-|\.)+):(.+)/,
};
// matches a hostname after a :
const destination_matcher = /\w+:((?:\w|-|\.)+)/;

const scripts = {
  basic: "scripts/simple-grow-weaken-hack.js",
  crack: "scripts/nuke.js",
  killall: "scripts/killall.js",
  share: "scripts/share.js",
  ...batchScripts,
};

export async function main(ns: NS) {
  ns.disableLog("sleep");
  ns.disableLog("scan");
  const commandBus = ns.getPortHandle(ports.commandBus);
  const workers = new Map<string, Array<RunningWorker>>();
  // todo: dump JSON.stringify([...workers]) into file in /data/ on exit
  // eslint-disable-next-line no-constant-condition
  while (true) {
    while (commandBus.empty()) {
      await commandBus.nextWrite();
    }
    const commandRaw = commandBus.read() as string;
    console.debug({ message: "command read", commandRaw });
    updateConfigs(
      workers,
      scanForRunningWorkers(ns, {
        basic: scripts.basic /* ignore crack, etc*/,
      }),
    );

    const commandList = commandRaw.startsWith("[")
      ? (JSON.parse(commandRaw) as string[])
      : [commandRaw];
    console.debug({ message: "commands parsed", commandList });

    const spawned = [];
    for (const commandRead of commandList) {
      if (commandRead.startsWith("debug")) {
        if (commandRead === "debug") ns.tprintf(JSON.stringify([...workers]));
        continue;
      }
      if (!destination_matcher.test(commandRead)) {
        continue;
      }
      const [, destination] = destination_matcher.exec(commandRead)!;

      if (commands.Crack.test(commandRead)) {
        if (ns.exec(scripts.crack, "home", 1, destination)) {
          console.info({ message: "crack launched", destination });
        }
        continue;
      }

      if (!workers.get(destination)) {
        workers.set(destination, []);
      }
      const workersAtDestination = workers.get(destination)!;
      if (commands.Target.test(commandRead)) {
        // todo
      } else if (commands.Basic.test(commandRead)) {
        // todo
      } else if (commands.Batch.test(commandRead)) {
        console.debug({ message: "batch entered" });
        const [, target, tasksRaw] = commands.Batch.exec(commandRead)!;
        console.debug({ message: "batch parsed", target, tasksRaw });
        const tasks = JSON.parse(tasksRaw);
        let accumulatedDelay = 0;
        for (const { hostname, threads, command, endAt, runFor } of tasks) {
          const pid = ns.exec(
            scripts[command as keyof typeof scripts],
            hostname,
            {
              threads,
              temporary: true,
            },
            "--runFor",
            runFor,
            "--endAt",
            endAt + accumulatedDelay,
            "--target",
            target,
          );
          console.debug({
            message: "batch task spawned",
            hostname,
            command,
            threads,
            accumulatedDelay,
            endAt,
            runFor,
          });
          const handle = ns.getPortHandle(ports.batchCommandOffset + pid);
          await handle.nextWrite();
          accumulatedDelay += handle.read() as number;
        }
      } else if (commands.Allocate.test(commandRead)) {
        const [, newTarget, threadCount] = commands.Allocate.exec(commandRead)!;
        const threads = parseInt(threadCount, 10);
        const existingWorker = workersAtDestination.find(
          ({ target }) => target === newTarget,
        );
        if (existingWorker) {
          console.debug({
            message: "found existing worker for task to allocate",
            destination,
            newTarget,
            threads,
            worker: { ...existingWorker },
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
              spawned.push({
                command: "basic",
                destination,
                target: newTarget,
                threads,
                gpid,
              });
            } else {
              console.info({
                message: "spawning updated/replacement worker failed",
                destination,
                newTarget,
                threads,
              });
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
      } else if (commands.Share.test(commandRead)) {
        const [, serverName, threads] = commands.Share.exec(commandRead)!;
        const threadCount = parseInt(threads, 10);
        ns.scp(scripts.share, serverName);
        const gpid = spawnWorker(ns, "share", serverName, "", threadCount);
        if (gpid) {
          spawned.push({
            command: "share",
            destination: serverName,
            target: "",
            threads: threadCount,
            gpid,
          });
          console.debug({
            message: "spawned share worker",
            serverName,
            threadCount,
            gpid,
          });
        } else {
          console.warn({
            message: "spawning share worker failed",
            serverName,
            threadCount,
          });
        }
      } else if (commands.Grow.test(commandRead)) {
        // todo
      } else if (commands.Weaken.test(commandRead)) {
        // todo
      } else if (commands.Hack.test(commandRead)) {
        // todo
      } else if (commands.Stop.test(commandRead)) {
        /*
            killWorker(ns, worker)
            */
      } else if (commands.Purge.test(commandRead)) {
        const [, server] = commands.Purge.exec(commandRead)!;
        ns.killall(server);
      } else if (commands.StopAll.test(commandRead)) {
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
    console.warn({ message: "not enough RAM to spawn worker", destination });
    return 0;
  }
  // const delay = command === "basic" ? Math.ceil(Math.random() * 10_000) : 0;
  const delay = 0;
  console.debug({
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
  console.debug({ message: "killing pid", worker });
  if (ns.kill(worker.gpid)) {
    console.debug({ message: "worker killed", worker });
  }
}
