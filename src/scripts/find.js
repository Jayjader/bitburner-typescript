const flags = [['substring', ''], ['showPath', false], ['showEmpty', false]]
/** @param {NS} ns */
export async function main(ns) {
  const flagData = ns.flags(flags)
  // Map<string, {files: string[], pathFromHost: string[]}>
  const seen = new Map([["home", { pathFromHome: [] }]])
  const to_scan = ["home"]
  let scanning
  while (to_scan.length > 0) {
    scanning = to_scan.shift()
    // home has an empty path, so we need to insert home into the path used to generate the neighbors' paths
    const pathToScanning = (pathArray => pathArray.length > 0 ? pathArray : [scanning])(seen.get(scanning).pathFromHome)
    for (const server of ns.scan(scanning)) {
      if (seen.has(server)) {
        continue
      }
      const files = ((files) => files.length > 0 ? files : undefined)(ns.ls(server, flagData.substring))
      seen.set(server, { files, pathFromHome: [...pathToScanning, server] })
      to_scan.push(server)
    }
    // for debugging
    //ns.tprint([...seen.entries()].map(([key, value]) => `${key}: ${value.pathFromHome.join('->')}`).join('\n'))
    //ns.tprintf("to_scan = %s", JSON.stringify(to_scan))
  }
  const outputFileName = 'graph_output.txt'
  for (const [server, { files, pathFromHome }] of seen.entries()) {
    ns.write(outputFileName, `${pathFromHome.slice(-2).map(serverName => `"${serverName}"`).join(' -- ')}\n`, "a")
    if (files || flagData.showEmpty) {
      ns.tprintf([server, ': ', files ? files.join(', ') : '(empty)', '; ', flagData.showPath ? pathFromHome.join('->') : ''].join(''))
    }
  }
}

export function autocomplete(data, args) {
  const substringFlag = `--${flags[0][0]}`
  switch (args.length) {
    case 0:
      return [substringFlag]
    case 1:
      if (args[0] !== substringFlag) {
        return [substringFlag]
      }
  }
  return []
}