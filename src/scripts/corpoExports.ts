import { NS } from "@ns";

const agriDivName = "The Growers";
const plants = "Plants";
const hasAgriDiv = (ns: NS) =>
  ns.corporation.getCorporation().divisions.includes(agriDivName);

const chemicalDivName = "Chemical Fascination";
const chemicals = "Chemicals";
const hasChemDiv = (ns: NS) =>
  ns.corporation.getCorporation().divisions.includes(chemicalDivName);
const CityNames = [
  "Aevum",
  "Ishima",
  "Chongqing",
  "New Tokyo",
  "Sector-12",
  "Volhaven",
];
export async function main(ns: NS) {
  if (hasAgriDiv(ns) && hasChemDiv(ns)) {
    // 0.5 Water + 0.2 Chemicals => 1 Plants + 1 Food
    // 1 Plants + 0.5 Water => 1 Chemicals

    // if we have 1 of each:
    // ==> 1 Plants + 1 Water + 0.2 Chemicals => 1 Plants + 1 Chemicals + 1 Food
    // ==> 1 Water => 0.8 Chemicals + 1 Food (==> 5 Water => 4 Chemicals + 5 Food)

    // if we are being chemical-neutral (5 agri per chem):
    // ==> 2.5+0.5 Water + 1 Chemicals + 1 Plants => 5 Plants + 5 Food + 1 Chemicals
    // ==> 3 Water => 4 Plants + 5 Food

    // 1 Plants => 1 Tobacco Products
    /*
        
        totalFarmConsumption -> 
        
         */
    for (const city of ns.corporation.getDivision(chemicalDivName).cities) {
      const material = ns.corporation.getMaterial(
        chemicalDivName,
        city,
        chemicals,
      );
      if (
        !material.exports.find((exportInfo) => {
          return (
            exportInfo.division === agriDivName && exportInfo.city === city
          );
        })
      ) {
        ns.corporation.exportMaterial(
          chemicalDivName,
          city,
          agriDivName,
          city,
          chemicals,
          "EINV/10",
        );
      }
    }
    for (const city of ns.corporation.getDivision(agriDivName).cities) {
      const material = ns.corporation.getMaterial(agriDivName, city, plants);
      if (
        !material.exports.find((exportInfo) => {
          return (
            exportInfo.division === chemicalDivName && exportInfo.city === city
          );
        })
      ) {
        ns.corporation.exportMaterial(
          agriDivName,
          city,
          chemicalDivName,
          city,
          plants,
          "EINV/(10*0.2)",
        );
      }
    }
  }
}
