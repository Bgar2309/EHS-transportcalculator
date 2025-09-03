import * as XLSX from 'xlsx';

// Chargement des données produits depuis Excel
export const loadProductsData = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        const produitsData = {};
        
        jsonData.forEach(row => {
          const nomProduit = row['Nom produit'];
          const description = row['Description'];
          const poidsUnitaire = row['Poids unitaire'];
          const typePalette = row['type palette'];
          const poidsPalette = row['poids palette en kg'];
          const piecesParPalette = row['pièce par palette'];
          const hauteur = row['hauteur palette en cm'];
          const transportAutorise = row['transport autorisé'];
          
          if (!produitsData[nomProduit]) {
            produitsData[nomProduit] = {
              description: description,
              poids_unitaire: poidsUnitaire,
              variantes: []
            };
          }
          
          produitsData[nomProduit].variantes.push({
            type_palette: typePalette,
            poids_palette: poidsPalette,
            pieces_par_palette: piecesParPalette,
            hauteur: hauteur,
            transport: typeof transportAutorise === 'string' ? 
              transportAutorise.split(', ') : []
          });
        });
        
        resolve(produitsData);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'));
    reader.readAsBinaryString(file);
  });
};

// Chargement des données de transport depuis Excel
export const loadTransportData = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        const transportData = {};
        
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          transportData[sheetName] = jsonData;
        });
        
        resolve(transportData);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'));
    reader.readAsBinaryString(file);
  });
};