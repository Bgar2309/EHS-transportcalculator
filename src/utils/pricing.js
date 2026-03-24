// ============================================================
// pricing.js — Grille transport EHS 2026
// Onglets : Colis (DPD), Messagerie (Kuehne), Affretement
// ============================================================

// Messagerie (Kuehne) — tranches de poids → index de colonne
// Col 3 = 1-29kg, Col 4 = 30-39kg ... Col 18 = 240kg
// Col 19 = 260 à 800kg (1 palette), Col 20 = 801 à 1600kg (2 palettes max)
const MESSAGERIE_TRANCHES = [
  { max: 29,   col: 3  },
  { max: 39,   col: 4  },
  { max: 49,   col: 5  },
  { max: 59,   col: 6  },
  { max: 69,   col: 7  },
  { max: 79,   col: 8  },
  { max: 89,   col: 9  },
  { max: 100,  col: 10 },
  { max: 101,  col: 11 },
  { max: 120,  col: 12 },
  { max: 140,  col: 13 },
  { max: 160,  col: 14 },
  { max: 180,  col: 15 },
  { max: 200,  col: 16 },
  { max: 220,  col: 17 },
  { max: 240,  col: 18 },
  { max: 800,  col: 19 }, // 260 à 800 kg — 1 palette
  { max: 1600, col: 20 }, // 801 à 1600 kg — 2 palettes max
];

// Affrètement — mapping composition palettes → index colonne
// Col 2 = FORFAIT (1 pal 80x120), Col 3 = 1 pal 115x115
// Col 4 = 2 pal 80x120, Col 5 = 2 pal mix ou 3 pal 80x120
// Lignes 1-2 de la grille définissent la logique :
// Ligne 1 : Pal 80x120 → 1, -, 2, 3, 4, 5, 6
// Ligne 2 : Pal 115x115 → -, 1, -, 2, 3, 4, 5
export const getColonneAffretement = (composition) => {
  let palettes80x120 = 0;
  let palettes115x115 = 0;

  composition.forEach(([typePalette, nb]) => {
    if (typePalette.includes('115x115') || typePalette.includes('110x110') || typePalette.includes('120x120')) {
      palettes115x115 += nb;
    } else if (typePalette !== 'carton') {
      palettes80x120 += nb;
    }
  });

  // Équivalence : 1 palette 115x115 ≈ 2 palettes 80x120 (en volume)
  // On mappe vers les 6 colonnes disponibles (col 2 à 8)
  // Col 2 : 1x80x120 seule
  // Col 3 : 1x115x115 seule
  // Col 4 : 2x80x120
  // Col 5 : 1x115x115 + 1x80x120 OU 3x80x120
  // Col 6 : 2x115x115 OU 4x80x120
  // Col 7 : 5x80x120
  // Col 8 : 6x80x120

  if (palettes115x115 === 0) {
    // Que des 80x120
    const col = Math.min(palettes80x120 + 1, 8);
    return col;
  } else if (palettes80x120 === 0) {
    // Que des 115x115 : col 3, puis +2 par palette supplémentaire
    if (palettes115x115 === 1) return 3;
    if (palettes115x115 === 2) return 6;
    return 8;
  } else {
    // Mix : équivalent en 80x120
    const equiv = palettes80x120 + (palettes115x115 * 2);
    const col = Math.min(equiv + 1, 8);
    return col;
  }
};

// Trouver la ligne d'un département dans un onglet
// Messagerie : colonne 1 contient le numéro de département (string "01", "75"...)
// Affrètement : colonne 0 contient le code département
const findDeptRow = (data, dept, deptCol) => {
  const deptStr = dept.toString().padStart(2, '0');
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row && row[deptCol] !== undefined && row[deptCol] !== null) {
      if (row[deptCol].toString() === deptStr) {
        return i;
      }
    }
  }
  return -1;
};

// Fonction principale : obtenir le prix selon le type de transport
export const obtenirPrixParType = (poids, departement, typeTransport, composition = null, TRANSPORT_DATA) => {
  if (departement < 1 || departement > 95) return null;

  try {
    // ─── DPD ───────────────────────────────────────────────────────────
    if (typeTransport === 'Colis (DPD)') {
      const data = TRANSPORT_DATA['Colis (DPD)'];
      if (!data || data.length < 3) return null;

      // Tarif unique France entière — ligne 2, colonne = poids arrondi au kg supérieur
      const col = Math.ceil(poids);
      if (col < 1 || col > 30) return null;

      const val = data[2][col];
      return val != null ? parseFloat(val) : null;
    }

    // ─── MESSAGERIE (Kuehne) ───────────────────────────────────────────
    if (typeTransport === 'Messagerie') {
      const data = TRANSPORT_DATA['Messagerie (Kuehne)'];
      if (!data) return null;
      if (poids > 1600) return null; // Au-delà → affrètement

      const rowIdx = findDeptRow(data, departement, 1);
      if (rowIdx === -1) return null;

      const tranche = MESSAGERIE_TRANCHES.find(t => poids <= t.max);
      if (!tranche) return null;

      const val = data[rowIdx][tranche.col];
      return val != null ? parseFloat(val) : null;
    }

    // ─── AFFRÈTEMENT ──────────────────────────────────────────────────
    if (typeTransport === 'Affrètement') {
      const data = TRANSPORT_DATA['Affretement'];
      if (!data) return null;

      const rowIdx = findDeptRow(data, departement, 0);
      if (rowIdx === -1) return null;

      let col;
      if (composition && composition.length > 0) {
        col = getColonneAffretement(composition);
      } else {
        // Fallback par poids si pas de composition
        const equiv80x120 = Math.ceil(poids / 800);
        col = Math.min(equiv80x120 + 1, 8);
      }

      const val = data[rowIdx][col];
      return val != null ? parseFloat(val) : null;
    }

  } catch (error) {
    console.error('Erreur pricing:', error);
  }

  return null;
};