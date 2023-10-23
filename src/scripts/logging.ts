import {NS} from '@ns'
export function createLogger(ns:NS, logFile: string) {
  return function (message:unknown) {
    const messageString = `${Date.now() - ns.getResetInfo().lastAugReset}|${typeof message === 'string' ? message : JSON.stringify(message)}\n`
    ns.tprintf(messageString)
    ns.write(logFile, messageString, 'a')
  }
}