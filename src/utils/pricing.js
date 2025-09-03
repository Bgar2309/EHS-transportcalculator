// Fonction pour mapper une composition de palettes à la colonne affrètement
export const getColonneAffretement = (composition) => {
  let palettes80x120 = 0;
  let palettes115x115 = 0;
  let palettesAutres = 0;
  
  composition.forEach(([typePalette, nb]) => {
    if (typePalette.includes("80x120")) {
      palettes80x120 += nb;
    } else if (typePalette.includes("115x115") || typePalette.includes("110x110") || typePalette.includes("120x120")) {
      palettes115x115 += nb;
    } else {
      palettesAutres += nb;
    }
  });
  
  // Équivalence volumétrique : 1 palette 115x115 ≈ 2 palettes 80x120
  const equivalent80x120 = palettes80x120 + (palettes115x115 * 2) + palettesAutres;
  
  // Mapping vers les colonnes (index commence à 0)
  if (equivalent80x120 <= 1) return 0;
  else if (equivalent80x120 <= 2) return 1;
  else if (equivalent80x120 <= 3) return 2;
  else if (equivalent80x120 <= 4) return 3;
  else if (equivalent80x120 <= 5) return 4;
  else if (equivalent80x120 <= 6) return 5;
  else if (equivalent80x120 <= 7) return 6;
  else if (equivalent80x120 <= 8) return 7;
  else if (equivalent80x120 <= 9) return 8;
  else if (equivalent80x120 <= 10) return 9;
  else if (equivalent80x120 <= 11) return 10;
  else if (equivalent80x120 <= 12) return 11;
  else if (equivalent80x120 <= 13) return 12;
  else if (equivalent80x120 <= 14) return 13;
  else if (equivalent80x120 <= 15) return 14;
  else if (equivalent80x120 <= 16) return 15;
  else if (equivalent80x120 <= 17) return 16;
  else if (equivalent80x120 <= 18) return 17;
  else return 18; // Colonne 19 (max)
};

// Fonction pour obtenir le prix selon le type de transport
export const obtenirPrixParType = (poids, departement, typeTransport, composition = null, TRANSPORT_DATA) => {
  if (departement < 1 || departement > 95) return null;
  if (!TRANSPORT_DATA[typeTransport]) return null;
  
  const data = TRANSPORT_DATA[typeTransport];
  if (!data || data.length === 0) return null;
  
  try {
    if (typeTransport === "Colis (DPD)") {
      if (poids <= 30 && departement < data.length) {
        const col = Math.min(Math.floor(poids), 30);
        if (col >= 1 && data[departement] && data[departement][col] != null) {
          return parseFloat(data[departement][col]);
        }
      }
    } else if (typeTransport === "Messagerie") {
      if (poids <= 400 && departement < data.length) {
        const limites = [9,19,29,39,49,59,69,79,89,99,120,140,160,180,200,220,240,260,280,300,325,350,375];
        const colIndex = limites.findIndex(limite => poids <= limite);
        if (colIndex !== -1 && data[departement] && data[departement][colIndex + 1] != null) {
          return parseFloat(data[departement][colIndex + 1]);
        }
      }
    } else if (typeTransport === "Forfait palette") {
      if (poids <= 1000 && departement < data.length) {
        if (data[departement] && data[departement][1] != null) {
          return parseFloat(data[departement][1]);
        }
      }
    } else if (typeTransport === "Affrètement") {
      if (departement < data.length) {
        if (composition) {
          const colIndex = getColonneAffretement(composition);
          if (data[departement] && data[departement][colIndex + 1] != null) {
            return parseFloat(data[departement][colIndex + 1]);
          }
        } else {
          // Logique fallback par poids
          const ranges = [
            [1, 800], [801, 1200], [1201, 1600], [1601, 2400], [2401, 3200],
            [3201, 4000], [4001, 4800], [4801, 5600], [5601, 6400], [6401, 7200],
            [7201, 8000], [8001, 8800], [8801, 9600], [9601, 10400], [10401, 11200],
            [11201, 12000], [12001, 12800], [12801, 13600], [13601, 14400]
          ];
          
          for (let i = 0; i < ranges.length; i++) {
            if (poids >= ranges[i][0] && poids <= ranges[i][1]) {
              if (data[departement] && data[departement][i + 1] != null) {
                return parseFloat(data[departement][i + 1]);
              }
              break;
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Erreur lors de la récupération du prix:', error);
  }
  
  return null;
};