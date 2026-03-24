import { useState, useEffect } from 'react'
import './App.css'
import { loadProductsData, loadTransportData } from './utils/excelLoader'
import { 
  calculerPaletisationReference, 
  agregerPaletisations,
} from './utils/calculator'
import { obtenirPrixParType } from './utils/pricing'

let PRODUITS_DATA = {};
let TRANSPORT_DATA = {};

function App() {
  const [productLines, setProductLines] = useState([{ product: '', quantity: '' }]);
  const [department, setDepartment] = useState('');
  const [results, setResults] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState({ products: false, transport: false });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFiles = async () => {
      setIsLoading(true);
      try {
        const productsResponse = await fetch('/fichiercone.xlsx');
        if (productsResponse.ok) {
          const productsBlob = await productsResponse.blob();
          const productsFile = new File([productsBlob], 'fichiercone.xlsx');
          PRODUITS_DATA = await loadProductsData(productsFile);
          setFilesLoaded(prev => ({ ...prev, products: true }));
        }

        const transportResponse = await fetch('/Grille_transport_EHS_2026.xlsx');
        if (transportResponse.ok) {
          const transportBlob = await transportResponse.blob();
          const transportFile = new File([transportBlob], 'Grille_transport_EHS_2026.xlsx');
          TRANSPORT_DATA = await loadTransportData(transportFile);
          setFilesLoaded(prev => ({ ...prev, transport: true }));
        }
      } catch (error) {
        console.error('Erreur lors du chargement des fichiers:', error);
      }
      setIsLoading(false);
    };

    loadFiles();
  }, []);

  const addProductLine = () => {
    if (productLines.length < 4) {
      setProductLines([...productLines, { product: '', quantity: '' }]);
    }
  };

  const removeProductLine = (index) => {
    if (productLines.length > 1) {
      setProductLines(productLines.filter((_, i) => i !== index));
    }
  };

  const updateProductLine = (index, field, value) => {
    const newLines = [...productLines];
    newLines[index][field] = value;
    setProductLines(newLines);
  };

  const calculerPrixMultiReferences = async () => {
    if (!filesLoaded.products || !filesLoaded.transport) {
      alert('Les fichiers de données ne sont pas encore chargés');
      return;
    }

    setIsCalculating(true);

    try {
      const dept = parseInt(department);
      if (isNaN(dept) || dept < 1 || dept > 95) {
        setResults('Veuillez entrer un département valide (1-95)');
        return;
      }

      const referencesValides = [];
      productLines.forEach(line => {
        const quantite = parseInt(line.quantity);
        if (line.product && line.product !== '' && !isNaN(quantite) && quantite > 0) {
          referencesValides.push([line.product, quantite]);
        }
      });

      if (referencesValides.length === 0) {
        setResults('Veuillez sélectionner au moins un produit avec une quantité valide');
        return;
      }

      const paletisationsIndividuelles = [];
      for (const [produitRef, quantite] of referencesValides) {
        const paletisation = calculerPaletisationReference(produitRef, quantite, PRODUITS_DATA);
        if (paletisation) {
          paletisation.produit_ref = produitRef;
          paletisation.quantite = quantite;
          paletisationsIndividuelles.push(paletisation);
        }
      }

      if (paletisationsIndividuelles.length === 0) {
        setResults('Impossible de calculer la palétisation pour les produits sélectionnés');
        return;
      }

      const agregation = agregerPaletisations(paletisationsIndividuelles);

      const hasPaletteComplete = paletisationsIndividuelles.some(
        p => p.force_affretement && p.raison_affretement === 'palette_complete'
      );

      // ─── Calcul des prix ──────────────────────────────────────────────────
      const resultatsTransport = [];

      // 1. DPD
      if (agregation.nb_colis_dpd > 0 && referencesValides.length === 1) {
        let prixTotalDpd = 0;
        let poidsTotalDpd = 0;

        for (const paletisation of agregation.details_individuels) {
          if (paletisation.type_transport === 'Colis (DPD)') {
            const produit = PRODUITS_DATA[paletisation.produit_ref];
            const varianteCarton = produit.variantes.find(v => v.type_palette === 'carton');
            const quantite = paletisation.quantite;

            if (varianteCarton) {
              const nbCartons = Math.ceil(quantite / varianteCarton.pieces_par_palette);
              const poidsUnitaire = produit.poids_unitaire;

              for (let i = 0; i < nbCartons; i++) {
                let piecesCarton;
                if (i === nbCartons - 1) {
                  piecesCarton = quantite % varianteCarton.pieces_par_palette || varianteCarton.pieces_par_palette;
                } else {
                  piecesCarton = varianteCarton.pieces_par_palette;
                }
                const poidsCarton = piecesCarton * poidsUnitaire + varianteCarton.poids_palette;
                poidsTotalDpd += poidsCarton;
                const prixCarton = obtenirPrixParType(poidsCarton, dept, 'Colis (DPD)', null, TRANSPORT_DATA);
                if (prixCarton) prixTotalDpd += prixCarton;
              }
            }
          }
        }

        if (prixTotalDpd > 0) {
          resultatsTransport.push({
            type_transport: 'Colis (DPD)',
            prix: prixTotalDpd,
            poids: poidsTotalDpd,
            details: `${agregation.nb_colis_dpd} colis DPD`
          });
        }
      }

      // 2. Palettes
      if (agregation.composition_globale.length > 0) {
        const poidsTotalDpdSoustraire = agregation.nb_colis_dpd > 0 && referencesValides.length === 1
          ? agregation.details_individuels
              .filter(p => p.type_transport === 'Colis (DPD)')
              .reduce((sum, p) => sum + p.poids_total, 0)
          : 0;

        const poidsPalettes = agregation.poids_total - poidsTotalDpdSoustraire;
        const nbPalettesTotal = agregation.composition_globale.reduce((sum, [, nb]) => sum + nb, 0);
        const labelPalettes = `${nbPalettesTotal} palette(s) - ${agregation.composition_globale.map(([type, nb]) => `${nb}x${type}`).join(', ')}`;

        // ── CAS 1 : Palette complète → affrètement forcé ──────────────────
        if (hasPaletteComplete) {
          const prix = obtenirPrixParType(poidsPalettes, dept, 'Affrètement', agregation.composition_globale, TRANSPORT_DATA);
          if (prix) {
            resultatsTransport.push({ type_transport: 'Affrètement', prix, poids: poidsPalettes, details: labelPalettes, force: true });
          }
        }

        // ── CAS 2 : Poids > 800 kg et ≤ 1600 kg → comparer messagerie vs affrètement ──
        else if (poidsPalettes > 800 && poidsPalettes <= 1600) {
          // Option A : Messagerie Kuehne 2 palettes (col 20 : 801-1600 kg)
          const prixMsg = obtenirPrixParType(poidsPalettes, dept, 'Messagerie', null, TRANSPORT_DATA);
          if (prixMsg) {
            resultatsTransport.push({
              type_transport: 'Messagerie',
              prix: prixMsg,
              poids: poidsPalettes,
              details: `2 palettes — ${agregation.composition_globale.map(([type, nb]) => `${nb}x${type}`).join(', ')}`
            });
          }
          // Option B : Affrètement
          const prixAff = obtenirPrixParType(poidsPalettes, dept, 'Affrètement', agregation.composition_globale, TRANSPORT_DATA);
          if (prixAff) {
            resultatsTransport.push({ type_transport: 'Affrètement', prix: prixAff, poids: poidsPalettes, details: labelPalettes });
          }
        }

        // ── CAS 3 : Poids > 1600 kg → affrètement uniquement ─────────────
        else if (poidsPalettes > 1600) {
          const prix = obtenirPrixParType(poidsPalettes, dept, 'Affrètement', agregation.composition_globale, TRANSPORT_DATA);
          if (prix) {
            resultatsTransport.push({ type_transport: 'Affrètement', prix, poids: poidsPalettes, details: labelPalettes });
          }
        }

        // ── CAS 4 : Poids ≤ 800 kg → messagerie et affrètement disponibles ─
        else {
          const prixMsg = obtenirPrixParType(poidsPalettes, dept, 'Messagerie', null, TRANSPORT_DATA);
          if (prixMsg) {
            resultatsTransport.push({ type_transport: 'Messagerie', prix: prixMsg, poids: poidsPalettes, details: labelPalettes });
          }
          const prixAff = obtenirPrixParType(poidsPalettes, dept, 'Affrètement', agregation.composition_globale, TRANSPORT_DATA);
          if (prixAff) {
            resultatsTransport.push({ type_transport: 'Affrètement', prix: prixAff, poids: poidsPalettes, details: labelPalettes });
          }
        }
      }

      // ─── HTML résultat ────────────────────────────────────────────────────
      let resultat = '';

      if (resultatsTransport.length > 0) {
        const tries = resultatsTransport.sort((a, b) => a.prix - b.prix);
        const solutionOptimale = tries[0];

        if (hasPaletteComplete) {
          resultat += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:10px;padding:12px 20px;margin-bottom:16px;color:#856404;font-size:14px;">';
          resultat += '⚠️ <strong>Palette complète détectée</strong> — expédition en affrètement uniquement (palette non démontée)';
          resultat += '</div>';
        }

        resultat += '<div class="cout-transport-bloc">';
        resultat += '<div class="cout-label">COÛT TRANSPORT</div>';
        if (solutionOptimale.type_transport === 'Colis (DPD)') {
          resultat += `<div class="cout-prix">${solutionOptimale.prix.toFixed(2)} €</div>`;
        } else {
          resultat += `<div class="cout-prix">${Math.round(solutionOptimale.prix)} €</div>`;
        }
        resultat += `<div class="cout-mode">${solutionOptimale.type_transport}</div>`;
        resultat += `<div class="cout-details">${solutionOptimale.details}</div>`;
        resultat += '</div>';

        const autresSolutions = tries.slice(1);
        if (autresSolutions.length > 0) {
          resultat += '<div class="autres-options-bloc">';
          resultat += '<div class="autres-title">💡 AUTRES OPTIONS DISPONIBLES:</div>';
          autresSolutions.forEach(option => {
            const prix = option.type_transport === 'Colis (DPD)' ? option.prix.toFixed(2) : Math.round(option.prix);
            resultat += `<div class="autre-option">• ${option.details} — ${prix} € (${option.type_transport})</div>`;
          });
          resultat += '</div>';
        }
      } else {
        resultat += '<div style="background:#f8d7da;border:1px solid #f5c2c7;border-radius:10px;padding:20px;text-align:center;color:#842029;">';
        resultat += '<strong>⚠️ Tarif sur devis</strong><br>Cette commande dépasse les seuils de la grille tarifaire automatique.<br>Traitement manuel requis.';
        resultat += '</div>';
      }

      resultat += '<div class="infos-complementaires">';
      resultat += `<div><strong>⚖️ Poids total:</strong> ${agregation.poids_total.toFixed(1)} kg</div>`;
      resultat += `<div><strong>📍 Destination:</strong> Département ${dept}</div>`;
      resultat += `<div><strong>📏 Hauteur max:</strong> ${agregation.hauteur_max} cm</div>`;
      if (agregation.nb_colis_dpd > 0) resultat += `<div><strong>📦 Colis DPD:</strong> ${agregation.nb_colis_dpd}</div>`;
      if (agregation.composition_globale.length > 0) {
        resultat += `<div><strong>🏗️ Palettes:</strong> ${agregation.composition_globale.map(([type, nb]) => `${nb}x${type}`).join(' ')}</div>`;
      }
      resultat += '</div>';

      resultat += '<details class="details-techniques">';
      resultat += '<summary><strong>📋 DÉTAILS TECHNIQUES</strong></summary>';
      resultat += '<div class="detail-references"><h4>Détail par référence:</h4>';
      agregation.details_individuels.forEach(paletisation => {
        const produit = PRODUITS_DATA[paletisation.produit_ref];
        resultat += `<div class="reference-item">`;
        resultat += `<strong>• ${paletisation.produit_ref}</strong> (${paletisation.quantite} pièces)<br>`;
        resultat += `&nbsp;&nbsp;${produit.description}<br>`;
        resultat += `&nbsp;&nbsp;Palétisation: ${paletisation.details}<br>`;
        resultat += `&nbsp;&nbsp;Poids: ${paletisation.poids_total.toFixed(1)} kg`;
        if (paletisation.force_affretement) resultat += `<br>&nbsp;&nbsp;⚠️ Affrètement forcé — palette complète`;
        if (paletisation.gaspillage > 0) resultat += `<br>&nbsp;&nbsp;Gaspillage: ${paletisation.gaspillage} pièces`;
        resultat += `</div>`;
      });
      resultat += '</div></details>';

      setResults(resultat);

    } catch (error) {
      console.error('Erreur lors du calcul:', error);
      setResults(`Erreur lors du calcul: ${error.message}`);
    } finally {
      setIsCalculating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="spinner-large"></div>
          <h2>Chargement des données...</h2>
          <p>Initialisation du calculateur de transport</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="header">
        <h1 className="title">Calculateur de Transport EHS</h1>
      </div>

      <div className="main-content">
        <div className="left-panel">
          <div className="card">
            <div className="section-title">📋 Produits à expédier</div>

            <div className="card-content">
              {productLines.map((line, index) => (
                <div key={index} className="product-line">
                  <select
                    className="select"
                    value={line.product}
                    onChange={(e) => updateProductLine(index, 'product', e.target.value)}
                  >
                    <option value="">Sélectionner un produit</option>
                    {Object.keys(PRODUITS_DATA).map(produit => (
                      <option key={produit} value={produit}>{produit}</option>
                    ))}
                  </select>

                  <input
                    type="number"
                    className="input"
                    placeholder="Quantité"
                    value={line.quantity}
                    onChange={(e) => updateProductLine(index, 'quantity', e.target.value)}
                  />

                  {index > 0 && (
                    <button className="btn btn-remove" onClick={() => removeProductLine(index)}>✖</button>
                  )}
                </div>
              ))}

              {productLines.length < 4 && (
                <button className="btn btn-add" onClick={addProductLine}>+ Ajouter un produit</button>
              )}

              <div className="department-input">
                <label>🎯 Département de destination</label>
                <input
                  type="number"
                  className="input"
                  placeholder="Ex: 75"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  min="1"
                  max="95"
                />
              </div>

              <button
                className={`btn-calculate ${isCalculating ? 'calculating' : ''}`}
                onClick={calculerPrixMultiReferences}
                disabled={isCalculating || !filesLoaded.products || !filesLoaded.transport}
              >
                {isCalculating ? (
                  <div className="loading"><div className="spinner"></div>Calcul en cours...</div>
                ) : (
                  '🚀 Calculer le transport'
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="right-panel">
          <div className="card">
            <div className="section-title">📊 Résultats</div>
            <div className="results-container">
              <div
                className="results"
                dangerouslySetInnerHTML={{
                  __html: results || 'Sélectionnez vos produits et cliquez sur "Calculer le transport" pour voir les résultats.'
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App