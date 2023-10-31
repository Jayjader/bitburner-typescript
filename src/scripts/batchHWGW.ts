import type { NS } from "@ns";
import { scripts } from "/scripts/batching";
import { ports } from "/scripts/constants";

type BatchTask = {
  hostname: string;
  command: keyof typeof scripts;
  threads: number;
  endAt: number;
  runFor: number;
};

const libraries = ["scanning", "batching", "constants"].map(
  (filename) => `scripts/${filename}.js`,
);
export async function main(ns: NS) {
  const target = ns.args[0] as string;
  const tasks = JSON.parse(ns.args[1] as string) as BatchTask[];
  for (const { hostname, command } of tasks) {
    for (const path of libraries) {
      if (!ns.fileExists(path, hostname)) {
        ns.scp(path, hostname);
      }
    }
    if (!ns.fileExists(scripts[command], hostname)) {
      ns.scp(scripts[command], hostname);
    }
  }
  const [earliestEnd, latestEnd] = tasks.reduce(
    ([earliest, latest], { endAt }) => [
      Math.min(earliest, endAt),
      Math.max(latest, endAt),
    ],
    [Number.POSITIVE_INFINITY, 0],
  );
  const startTime = performance.now();
  const freeDuration = earliestEnd - startTime - 2 * 10; // hardcoded delay padding
  const occupiedDuration = latestEnd - earliestEnd + 2 * 10; // hardcoded delay padding
  const staggeredBatchCount = Math.floor(freeDuration / occupiedDuration);
  // const totalBatchCount = 1 + staggeredBatchCount;
  const totalBatchCount = 1; // todo: fix ram allocation / decide how to gracefully adjust when not enough ram for staggered tasks
  const batchOffset = freeDuration / totalBatchCount;

  let accumulatedDelay = 0;
  while (true) {
    for (let count = 0; count < totalBatchCount; count++) {
      for (const { command, hostname, threads, endAt, runFor } of tasks) {
        let pid;
        while (
          (pid = ns.exec(
            scripts[command],
            hostname,
            {
              threads,
              temporary: true,
            },
            "--runFor",
            runFor,
            "--endAt",
            endAt + accumulatedDelay + batchOffset * count,
            "--target",
            target,
          )) == 0
        ) {
          console.warn({
            message: "couldn't spawn batch task",
            hostname,
            target,
            command,
            threads,
            accumulatedDelay,
            endAt,
            runFor,
            batchOffset,
            count,
          });
          await ns.sleep(50);
        }
        console.debug({
          message: "batch task spawned",
          hostname,
          target,
          command,
          threads,
          accumulatedDelay,
          batchOffset,
          count,
          endAt,
          runFor,
          pid,
        });
        const handle = ns.getPortHandle(ports.batchCommandOffset + pid);
        handle.write(ns.pid);
        console.debug({
          message: "wrote controller pid to port",
          controllerPid: ns.pid,
          port: ports.batchCommandOffset + pid,
        });
        await handle.nextWrite();
        accumulatedDelay += handle.read() as number;
      }
    }
    let finishedCount = 0;
    const finishHandle = ns.getPortHandle(ports.batchCommandOffset + ns.pid);
    while (finishedCount < tasks.length * totalBatchCount) {
      while (finishHandle.empty()) {
        await finishHandle.nextWrite();
      }
      finishHandle.read();
      finishedCount++;
    }
    // give the task scripts time to cleanup / die and free their ram
    await ns.sleep(25);
    console.debug({ message: "waited until end of batch" });
  }
}
