/** @param {NS} ns */
export async function main(ns) {
  /**@type string */
  const target = ns.args[0]
  if (!target) {
    ns.tprintf("needs servername as argument")
    return
  }
  /**@type Map<string, string[]> */
  const seen = new Map([['home', []]])
  const to_scan = ['home']
  let next, pathToNext
  while ((next = to_scan.shift()) !== undefined && !seen.has(target)) {
    pathToNext = seen.get(next)
    for (const scanned of ns.scan(next)) {
      if (seen.has(scanned)) {
        continue
      }
      seen.set(scanned, [...pathToNext, scanned])
      to_scan.push(scanned)
    }
  }
  const pathToTarget = seen.get(target)
  if (!pathToTarget) {
    ns.tprintf('path not found')
    return
  }
  ns.tprintf('command string to run: %s; backdoor', pathToTarget.map(server => `connect ${server}`).join('; '))

}

export function autocomplete(data, args) {
  return data.servers
}