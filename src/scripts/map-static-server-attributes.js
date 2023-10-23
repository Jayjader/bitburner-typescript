const staticServerFile = 'data/server-static.txt'
/** @param {NS} ns */
export async function main(ns) {
  /**@type Map<string, { path: string[], attributes: ServerAttributes }> */
  const seen = new Map([['home', { path: [], attributes: mapServer(ns, 'home') }]])
  const to_scan = ['home']
  let next, pathToNext
  while ((next = to_scan.shift()) !== undefined) {
    pathToNext = seen.get(next).path
    for (const scanned of ns.scan(next)) {
      if (seen.has(scanned)) {
        continue
      }
      seen.set(scanned, {
        path: [...pathToNext, scanned],
        attributes: mapServer(ns, scanned)
      })
      to_scan.push(scanned)
    }
  }
  ns.write(
    staticServerFile,
    JSON.stringify(
      [...seen].map(([server, { attributes }]) =>
        ([server, attributes])
      )),
    'w'
  )
}
/**
 * @typedef ServerAttributes
 * @type {object}
 * @property {number} minLevel - minimum hacking level needed to grow/weaken/hack/backdoor.
 * @property {number} minSecurity - server minimum security level.
 * @property {number} minPorts - minimum number of ports to open on server before being able to NUKE.exe it.
 * @property {number} maxRam - total server RAM.
 * @property {number} maxMoney - maximum money server can hold..
 * @property {number} growthFactor - how much server is affected by grow()
 *
/**
 * @param {NS} ns
 * @param {string} hostname
 * @returns {ServerAttributes}
 * */
function mapServer(ns, hostname) {
  return {
    minLevel: ns.getServerRequiredHackingLevel(hostname),
    minSecurity: ns.getServerMinSecurityLevel(hostname),
    minPorts: ns.getServerNumPortsRequired(hostname),
    maxRam: ns.getServerMaxRam(hostname),
    maxMoney: ns.getServerMaxMoney(hostname),
    growthFactor: ns.getServerGrowth(hostname),
  }
}