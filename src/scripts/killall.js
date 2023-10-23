/** @param {NS} ns */
export async function main(ns) {
  const killed = []
  const to_kill = ns.scan('home')
  let next
  while ((next = to_kill.shift())) {
    if (killed.includes(next)) {
      continue
    }
    if (ns.ps(next).length > 0) {
      ns.killall(next)
    }
    killed.push(next)
    to_kill.push(...ns.scan(next))
  }
}