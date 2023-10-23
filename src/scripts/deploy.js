/** @param {NS} ns */
export async function main(ns) {
  const server = ns.args[0]
  const script = ns.args[1]
  const args = ns.args.slice(2)

  ns.scp(script, server)
  const scriptRam = ns.getScriptRam(script)
  const freeRam = (ns.getServerMaxRam(server) - ns.getServerUsedRam(server))
  const threads = Math.floor(freeRam / (scriptRam === 0 ? 1 : scriptRam));
  ns.tprintf("script ram: %f, free ram: %f, threads: %d", scriptRam, freeRam, threads)
  if (threads > 0) {
    // todo: send pid over port
    ns.exec(script, server, { preventDuplicates: true, threads }, ...args)
  } else {
    ns.tprint("Not enough RAM for even 1 thread")
  }
}

export function autocomplete(data, args) {
  //alert(JSON.stringify(data))
  switch (args.length) {
    case 0:
      return data.servers
    case 1:
      if (!data.servers.includes(args[0])) {
        return data.servers
      }
      return data.scripts
    case 2:
      if (!data.scripts.includes(args[1])) {
        return data.scripts
      }
      return data.servers
    case 3:
      if (!data.servers.includes(args[2])) {
        return data.servers
      }
  }
  return []
}