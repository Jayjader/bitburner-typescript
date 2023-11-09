import type { CityName as CityNameType, NS } from "@ns";

const agriDivName = "The Growers";
const plants = "Plants";
const hasAgriDiv = (ns: NS) =>
  ns.corporation.getCorporation().divisions.includes(agriDivName);

const chemicalDivName = "Chemical Fascination";
const chemicals = "Chemicals";
const hasChemDiv = (ns: NS) =>
  ns.corporation.getCorporation().divisions.includes(chemicalDivName);

const expandToCity = (ns: NS, division: string, city: CityNameType) => {
  ns.corporation.expandCity(division, city);
  const office = ns.corporation.getOffice(division, city);
  while (office.size < 3) {
    ns.corporation.upgradeOfficeSize(division, city, 1);
  }
  for (const position of ["Operations", "Engineer", "Business"] as const) {
    ns.corporation.hireEmployee(division, city, position);
  }
};

const CityNames = [
  "Aevum",
  "Ishima",
  "Chongqing",
  "New Tokyo",
  "Sector-12",
  "Volhaven",
];
export async function main(ns: NS) {
  if (hasAgriDiv(ns)) {
    const agriDiv = ns.corporation.getDivision(agriDivName);
    for (const city of CityNames) {
      const typedCity = city as CityNameType;
      if (!agriDiv.cities.includes(typedCity)) {
        expandToCity(ns, agriDivName, typedCity);
      }
      if (!ns.corporation.hasWarehouse(agriDivName, typedCity)) {
        ns.corporation.purchaseWarehouse(agriDivName, typedCity);
      }
    }
  }
  if (hasChemDiv(ns)) {
    ns.tprintf("has chem div");
    const chemDiv = ns.corporation.getDivision(chemicalDivName);
    for (const city of CityNames) {
      const typedCity = city as CityNameType;
      if (!chemDiv.cities.includes(typedCity)) {
        ns.tprintf("chem div doesn't have office in %s", typedCity);
        expandToCity(ns, chemicalDivName, typedCity);
      }
      if (!ns.corporation.hasWarehouse(chemicalDivName, typedCity)) {
        ns.corporation.purchaseWarehouse(chemicalDivName, typedCity);
      }
    }
  }
}
