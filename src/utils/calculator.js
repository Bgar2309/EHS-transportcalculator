// Fonction pour générer toutes les combinaisons de palettes possibles (VERSION INTELLIGENTE)
export const genererCombinaisons = (produitRef, quantite, PRODUITS_DATA) => {
  if (!PRODUITS_DATA[produitRef]) return [];
  
  const produit = PRODUITS_DATA[produitRef];
  const variantesTriees = produit.variantes
    .filter(v => v.type_palette !== "carton" && v.pieces_par_palette > 0)
    .sort((a, b) => b.pieces_par_palette - a.pieces_par_palette);
  
  const combinaisons = [];
  
  // 1. Solutions avec une seule type de palette
  for (const variante of variantesTriees) {
    const piecesParPalette = variante.pieces_par_palette;
    const nbPalettesNecessaires = Math.ceil(quantite / piecesParPalette);
    
    const poidsProduits = quantite * produit.poids_unitaire;
    const poidsPalettesVides = nbPalettesNecessaires * variante.poids_palette;
    const poidsTotal = poidsProduits + poidsPalettesVides;
    
    const piecesTotales = nbPalettesNecessaires * piecesParPalette;
    const gaspillage = piecesTotales - quantite;
    
    combinaisons.push({
      details: `${nbPalettesNecessaires} palette(s) ${variante.type_palette}`,
      nb_palettes_total: nbPalettesNecessaires,
      poids_total: poidsTotal,
      hauteur_max: variante.hauteur,
      composition: [[variante.type_palette, nbPalettesNecessaires]],
      gaspillage: gaspillage
    });
  }
  
  // 2. Solutions mixtes intelligentes pour grandes quantités
  if (quantite > 50) {
    for (let i = 0; i < variantesTriees.length - 1; i++) {
      const grandeVariante = variantesTriees[i];
      const grandeCapacite = grandeVariante.pieces_par_palette;
      const nbGrandesMax = Math.floor(quantite / grandeCapacite);
      
      for (let nbGrandes = 1; nbGrandes <= Math.min(nbGrandesMax, 4); nbGrandes++) {
        const piecesRestantes = quantite - (nbGrandes * grandeCapacite);
        if (piecesRestantes <= 0) continue;
        
        for (let j = i + 1; j < variantesTriees.length; j++) {
          const petiteVariante = variantesTriees[j];
          const petiteCapacite = petiteVariante.pieces_par_palette;
          const nbPetites = Math.ceil(piecesRestantes / petiteCapacite);
          
          if (nbPetites > 10 || nbGrandes + nbPetites > 8) continue;
          
          const piecesTotales = (nbGrandes * grandeCapacite) + (nbPetites * petiteCapacite);
          const gaspillage = piecesTotales - quantite;
          
          const poidsProduits = quantite * produit.poids_unitaire;
          const poidsPalettesVides = (nbGrandes * grandeVariante.poids_palette) + 
                                     (nbPetites * petiteVariante.poids_palette);
          const poidsTotal = poidsProduits + poidsPalettesVides;
          const hauteurMax = Math.max(grandeVariante.hauteur, petiteVariante.hauteur);
          
          const solutionSimple = Math.min(...combinaisons.map(x => x.nb_palettes_total));
          const gaspillageSimple = Math.min(...combinaisons
            .filter(x => x.nb_palettes_total === solutionSimple)
            .map(x => x.gaspillage));
          
          if (nbGrandes + nbPetites < solutionSimple || 
              (nbGrandes + nbPetites === solutionSimple && gaspillage < gaspillageSimple)) {
            
            combinaisons.push({
              details: `${nbGrandes} palette(s) ${grandeVariante.type_palette} + ${nbPetites} palette(s) ${petiteVariante.type_palette}`,
              nb_palettes_total: nbGrandes + nbPetites,
              poids_total: poidsTotal,
              hauteur_max: hauteurMax,
              composition: [[grandeVariante.type_palette, nbGrandes], [petiteVariante.type_palette, nbPetites]],
              gaspillage: gaspillage
            });
          }
        }
      }
    }
  }
  
  return combinaisons
    .sort((a, b) => a.nb_palettes_total - b.nb_palettes_total || a.gaspillage - b.gaspillage)
    .slice(0, 5);
};

// Retourne la variante 115x115 (palette max) d'un produit
export const getVariante115x115 = (produitRef, PRODUITS_DATA) => {
  if (!PRODUITS_DATA[produitRef]) return null;
  const produit = PRODUITS_DATA[produitRef];
  return produit.variantes.find(v =>
    v.type_palette !== 'carton' &&
    v.pieces_par_palette > 0 &&
    (v.type_palette.includes('115') || v.type_palette.includes('110') || v.type_palette.includes('120x120'))
  ) || null;
};

// Fonction pour identifier la palette maximale d'un produit
export const getPaletteMax = (produitRef, PRODUITS_DATA) => {
  if (!PRODUITS_DATA[produitRef]) return null;
  const produit = PRODUITS_DATA[produitRef];
  const variantesPalettes = produit.variantes.filter(v => v.type_palette !== "carton" && v.pieces_par_palette > 0);
  if (variantesPalettes.length > 0) {
    return variantesPalettes[variantesPalettes.length - 1];
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// RÈGLE PALETTE COMPLÈTE
// Si quantite % pieces_par_palette_115x115 === 0 → affrètement forcé
// (palette complète = on ne découpe pas, on expédie tel quel en affrètement)
// ─────────────────────────────────────────────────────────────────────────────
export const estPaletteComplete = (produitRef, quantite, PRODUITS_DATA) => {
  const variante115 = getVariante115x115(produitRef, PRODUITS_DATA);
  if (!variante115 || variante115.pieces_par_palette <= 0) return false;
  return quantite % variante115.pieces_par_palette === 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// RÈGLE MESSAGERIE — LIMITE 800 kg / 2 palettes max (grille Kuehne 2026)
// Si poids palette > 800 kg OU nb palettes > 2 → affrètement obligatoire
// ─────────────────────────────────────────────────────────────────────────────
export const depasseLimiteMessagerie = (paletisation) => {
  if (!paletisation || paletisation.type_transport === 'Colis (DPD)') return false;
  
  const nbPalettes = paletisation.nb_palettes_total || 0;
  const poids = paletisation.poids_total || 0;

  // Plus de 2 palettes → affrètement
  if (nbPalettes > 2) return true;

  // 1 palette > 800 kg → affrètement
  if (nbPalettes === 1 && poids > 800) return true;

  // 2 palettes → poids total max 1600 kg (col 20 de la grille)
  if (nbPalettes === 2 && poids > 1600) return true;

  return false;
};

// Fonction pour calculer la palétisation optimale d'une référence
export const calculerPaletisationReference = (produitRef, quantite, PRODUITS_DATA) => {
  if (!PRODUITS_DATA[produitRef]) return null;
  
  const produit = PRODUITS_DATA[produitRef];
  const paletteMax = getPaletteMax(produitRef, PRODUITS_DATA);
  if (!paletteMax) return null;
  
  const capaciteMax = paletteMax.pieces_par_palette;

  // ── 1. VÉRIFIER DPD EN PRIORITÉ ─────────────────────────────────────────
  const varianteCarton = produit.variantes.find(v => v.type_palette === "carton");
  
  if (varianteCarton && 
      varianteCarton.pieces_par_palette > 0 && 
      quantite <= varianteCarton.pieces_par_palette &&
      varianteCarton.transport && 
      varianteCarton.transport.some(t => t.toLowerCase().includes("dpd"))) {
    
    const poidsCarton = quantite * produit.poids_unitaire + varianteCarton.poids_palette;
    
    return {
      details: `1 colis DPD (${quantite} pièces)`,
      type_transport: "Colis (DPD)",
      poids_total: poidsCarton,
      hauteur: varianteCarton.hauteur,
      nb_palettes_total: 1,
      gaspillage: 0,
      composition: [["carton", 1]]
    };
  }

  // ── 2. RÈGLE PALETTE COMPLÈTE → AFFRÈTEMENT FORCÉ ───────────────────────
  // Si la quantité est un multiple exact de la palette 115x115,
  // on force l'affrètement (palette complète, on ne découpe pas)
  if (estPaletteComplete(produitRef, quantite, PRODUITS_DATA)) {
    const combinaisons = genererCombinaisons(produitRef, quantite, PRODUITS_DATA);
    const meilleure = combinaisons[0];
    if (meilleure) {
      return {
        details: meilleure.details,
        type_transport: "Affrètement",
        force_affretement: true,
        raison_affretement: "palette_complete",
        poids_total: meilleure.poids_total,
        hauteur: meilleure.hauteur_max,
        nb_palettes_total: meilleure.nb_palettes_total,
        gaspillage: meilleure.gaspillage,
        composition: meilleure.composition
      };
    }
  }

  // ── 3. CALCUL PALETTES STANDARD ─────────────────────────────────────────
  const combinaisons = genererCombinaisons(produitRef, quantite, PRODUITS_DATA);
  const resultats = [];
  
  if (quantite <= capaciteMax) {
    for (const combo of combinaisons) {
      const poids = combo.poids_total;
      const nbPal = combo.nb_palettes_total;
      let typesATester = [];

      // ── RÈGLE 800 kg / 2 palettes (messagerie Kuehne 2026) ───────────
      // Messagerie possible seulement si :
      //   - 1 palette ET poids <= 800 kg → col 19 (260-800 kg)
      //   - 2 palettes ET poids <= 1600 kg → col 20 (801-1600 kg)
      //   - Poids <= 240 kg → tranches classiques
      const messagerieOk = (
        (nbPal === 1 && poids <= 800) ||
        (nbPal === 2 && poids <= 1600) ||
        (poids <= 240)
      );

      if (messagerieOk) {
        typesATester = ["Messagerie", "Affrètement"];
      } else {
        typesATester = ["Affrètement"];
      }

      const piecesTotales = combo.composition.reduce((total, [typePal, nb]) => {
        const variante = produit.variantes.find(v => v.type_palette === typePal);
        return total + (nb * (variante ? variante.pieces_par_palette : 0));
      }, 0);
      
      const gaspillage = piecesTotales - quantite;
      
      for (const typeTransport of typesATester) {
        resultats.push({
          details: combo.details,
          type_transport: typeTransport,
          poids_total: poids,
          hauteur: combo.hauteur_max,
          nb_palettes_total: combo.nb_palettes_total,
          gaspillage: gaspillage,
          composition: combo.composition
        });
      }
    }
  } else {
    // > Capacité palette max → AFFRÈTEMENT UNIQUEMENT
    for (const combo of combinaisons) {
      const piecesTotales = combo.composition.reduce((total, [typePal, nb]) => {
        const variante = produit.variantes.find(v => v.type_palette === typePal);
        return total + (nb * (variante ? variante.pieces_par_palette : 0));
      }, 0);
      
      resultats.push({
        details: combo.details,
        type_transport: "Affrètement",
        poids_total: combo.poids_total,
        hauteur: combo.hauteur_max,
        nb_palettes_total: combo.nb_palettes_total,
        gaspillage: piecesTotales - quantite,
        composition: combo.composition
      });
    }
  }
  
  if (resultats.length > 0) {
    return resultats.sort((a, b) => 
      (a.nb_palettes_total || 999) - (b.nb_palettes_total || 999) ||
      (a.gaspillage || 999) - (b.gaspillage || 999)
    )[0];
  }
  
  return null;
};

// Fonction pour agréger les palétisations de plusieurs références
export const agregerPaletisations = (paletisationsIndividuelles) => {
  const compteurPalettes = {};
  let poidsTotal = 0;
  let hauteurMax = 0;
  let nbColisDpd = 0;
  const detailsIndividuels = [];
  
  paletisationsIndividuelles.forEach(paletisation => {
    if (!paletisation) return;
    
    detailsIndividuels.push(paletisation);
    poidsTotal += paletisation.poids_total;
    hauteurMax = Math.max(hauteurMax, paletisation.hauteur);
    
    if (paletisation.type_transport === "Colis (DPD)") {
      nbColisDpd += paletisation.nb_palettes_total;
    } else {
      paletisation.composition.forEach(([typePalette, nb]) => {
        if (typePalette !== "carton") {
          compteurPalettes[typePalette] = (compteurPalettes[typePalette] || 0) + nb;
        }
      });
    }
  });
  
  const compositionGlobale = Object.entries(compteurPalettes);
  
  return {
    composition_globale: compositionGlobale,
    poids_total: poidsTotal,
    hauteur_max: hauteurMax,
    nb_colis_dpd: nbColisDpd,
    details_individuels: detailsIndividuels
  };
};