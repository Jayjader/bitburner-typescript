const stock_price_on_day_i = [7, 7, 14, 183, 170, 144, 45, 150]
/** @param {NS} ns */
export async function main(ns) {
  /*
  Determine the maximum possible profit you can earn using at most one transaction (i.e. you can only buy and sell the stock once). If no profit can be made then the answer should be 0. Note that you have to buy the stock before you can sell it
  */
  let maxProfit = 0
  for (const [buyPrice, day] of stock_price_on_day_i.slice(0, -1).map((p, i) => ([p, i]))) {
    ns.tprintf("##If bought on day %d:", day)
    maxProfit = Math.max(maxProfit, stock_price_on_day_i.slice(day).reduce(
      (accu, sellPrice, nextI) => {
        const profit = sellPrice - buyPrice
        ns.tprintf("Profit if sold on day %d: %d", day + nextI, profit)
        return (profit > accu) ? profit : accu
      }
      , 0))
    ns.tprintf("Max profit for day %d: %d", day, maxProfit)
  }
  ns.tprintf("Max profit possible: %d", maxProfit)
}