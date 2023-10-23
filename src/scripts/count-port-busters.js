const busters = ["BruteSSH.exe","FTPCrack.exe","relaySMTP.exe","HTTPWorm.exe","SQLInject.exe",]
const flags = [['port', -1]]
/** @param {NS} ns */
export async function main(ns) {
  const {port} = ns.flags(flags)
  if (port === -1) {
    return Promise.reject('no port specified')
  }
  const count = busters.reduce((sum, name)=> sum + Number(ns.fileExists(name, 'home')), 0)
  ns.writePort(port, count)
}