/** @param {NS} ns */
export async function main(ns) {
  const attackerScript = ns.args[0]
  // Array of all servers that don't need any ports opened
  // to gain root access. These have 16 GB of RAM
  const servers0Port = ["sigma-cosmetics",
    "joesguns",
    "nectar-net",
    "hong-fang-tea",
    "harakiri-sushi"];

  // Array of all servers that only need 1 port opened
  // to gain root access. These have 32 GB of RAM
  const servers1Port = ["neo-net",
    "zer0",
    "max-hardware",
    "iron-gym"];

  // Copy our scripts onto each server that requires 0 ports
  // to gain root access. Then use nuke() to gain admin access and
  // run the scripts.
  for (let i = 0; i < servers0Port.length; ++i) {
    const serv = servers0Port[i];
    ns.printf("Copy attacker script to 0-port server %s", serv)

    ns.scp(attackerScript, serv);
    ns.nuke(serv);
    const scriptRam = ns.getScriptRam(attackerScript)
    const freeRam = (ns.getServerMaxRam(serv) - ns.getServerUsedRam(serv))
    const threads = Math.floor(freeRam / (scriptRam === 0 ? 1 : scriptRam));
    ns.exec(attackerScript, serv, threads, "joesguns");
  }

  // Wait until we acquire the "BruteSSH.exe" program
  ns.print("Wait for BruteSSH.exe to exist...")
  while (!ns.fileExists("BruteSSH.exe")) {
    await ns.sleep(60000);
  }
  ns.print("BruteSSH.exe exists")

  // Copy our scripts onto each server that requires 1 port
  // to gain root access. Then use brutessh() and nuke()
  // to gain admin access and run the scripts.
  for (let i = 0; i < servers1Port.length; ++i) {
    const serv = servers1Port[i];
    ns.printf("Copy attacker script to 1-port server %s", serv)

    ns.scp(attackerScript, serv);
    ns.brutessh(serv);
    ns.nuke(serv);
    const scriptRam = ns.getScriptRam(attackerScript)
    const freeRam = (ns.getServerMaxRam(serv) - ns.getServerUsedRam(serv))
    const threads = Math.floor(freeRam / (scriptRam === 0 ? 1 : scriptRam));
    ns.exec(attackerScript, serv, threads, "joesguns");
  }
}

export function autocomplete(data, args) {
  return data.scripts
}