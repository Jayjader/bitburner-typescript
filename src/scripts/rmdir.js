/** @param {NS} ns */
export async function main(ns) {
  const directory = ns.args[0]
  rmdir(ns, directory)
}

/** @param {NS} ns */
function rmdir(ns, dir) {
  const files = ns.ls(ns.getHostname(), dir)
  ns.printf(`files: ${files}`)
  for (const thing of files) {
    if (!ns.rm(thing)) {
      ns.printf(`couldn't rm ${thing}`)
    }
  }
}

export function autocomplete(data, args) {
  return [...(new Set([...(data.scripts ?? []), ...(data.txts ?? [])].map(path => path.split('/').slice(0, -1).join('/'))))]
}