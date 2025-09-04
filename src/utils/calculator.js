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
          
          // Vérifier que c'est mieux qu'une solution simple
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

// Fonction pour identifier la palette maximale d'un produit
export const getPaletteMax = (produitRef, PRODUITS_DATA) => {
  if (!PRODUITS_DATA[produitRef]) return null;
  
  const produit = PRODUITS_DATA[produitRef];
  const variantesPalettes = produit.variantes.filter(v => v.type_palette !== "carton" && v.pieces_par_palette > 0);
  if (variantesPalettes.length > 0) {
    return variantesPalettes[variantesPalettes.length - 1]; // Dernière = palette max
  }
  return null;
};

// Fonction pour calculer la palétisation optimale d'une référence
export const calculerPaletisationReference = (produitRef, quantite, PRODUITS_DATA) => {
  if (!PRODUITS_DATA[produitRef]) return null;
  
  const produit = PRODUITS_DATA[produitRef];
  const paletteMax = getPaletteMax(produitRef, PRODUITS_DATA);
  if (!paletteMax) return null;
  
  const capaciteMax = paletteMax.pieces_par_palette;
  const resultats = [];
  
  // 1. VÉRIFIER DPD EN PRIORITÉ
  const varianteCarton = produit.variantes.find(v => v.type_palette === "carton");
  
  // DPD possible seulement si :
  // - Il existe une variante carton
  // - La quantité rentre dans UN SEUL carton
  // - Le transport DPD est autorisé pour ce produit
  if (varianteCarton && 
      varianteCarton.pieces_par_palette > 0 && 
      quantite <= varianteCarton.pieces_par_palette &&
      varianteCarton.transport && 
      varianteCarton.transport.some(t => t.toLowerCase().includes("dpd"))) {
    
    const poidsCarton = quantite * produit.poids_unitaire + varianteCarton.poids_palette;
    
    // RETOUR DIRECT DPD - Pas besoin de calculer le reste
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
  
  // 2. Si pas de DPD possible, calculer les palettes
  const combinaisons = genererCombinaisons(produitRef, quantite, PRODUITS_DATA);
  
  // 3. Appliquer la logique selon la capacité max
  if (quantite <= capaciteMax) {
    for (const combo of combinaisons) {
      const poids = combo.poids_total;
      let typesATester = [];
      
      if (poids <= 400) {
        typesATester = ["Messagerie", "Forfait palette", "Affrètement"];
      } else if (poids <= 1000) {
        typesATester = ["Forfait palette", "Affrètement"];
      } else {
        typesATester = ["Affrètement"];
      }
      
      for (const typeTransport of typesATester) {
        const piecesTotales = combo.composition.reduce((total, [typePal, nb]) => {
          const variante = produit.variantes.find(v => v.type_palette === typePal);
          return total + (nb * (variante ? variante.pieces_par_palette : 0));
        }, 0);
        
        const gaspillage = piecesTotales - quantite;
        
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
    // > Capacité palette max : AFFRÈTEMENT UNIQUEMENT
    for (const combo of combinaisons) {
      const piecesTotales = combo.composition.reduce((total, [typePal, nb]) => {
        const variante = produit.variantes.find(v => v.type_palette === typePal);
        return total + (nb * (variante ? variante.pieces_par_palette : 0));
      }, 0);
      
      const gaspillage = piecesTotales - quantite;
      
      resultats.push({
        details: combo.details,
        type_transport: "Affrètement",
        poids_total: combo.poids_total,
        hauteur: combo.hauteur_max,
        nb_palettes_total: combo.nb_palettes_total,
        gaspillage: gaspillage,
        composition: combo.composition
      });
    }
  }
  
  // Retourner la meilleure option pour les palettes
  if (resultats.length > 0) {
    const resultatsTries = resultats.sort((a, b) => 
      (a.nb_palettes_total || 999) - (b.nb_palettes_total || 999) ||
      (a.gaspillage || 999) - (b.gaspillage || 999)
    );
    return resultatsTries[0];
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