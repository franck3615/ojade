/**
 * Scan de chèque : lit le nom du payeur par OCR et propose un
 * rapprochement avec les clients de l'onglet SituationRemiseFacture.
 * Une fois confirmé, la ligne est marquée rapprochée puis ajoutée
 * automatiquement à ImpressionRemiseBank pour la remise en banque,
 * en réutilisant la même logique que
 * RESTAURER_LIGNES_VERS_IMPRESSION_REMISE_BANK (recherche de
 * correspondance dans le menu déroulant + première case vide).
 *
 * Prérequis à activer une seule fois dans l'éditeur Apps Script :
 *  1. Services (icône +) > Drive API > Ajouter (nécessaire pour l'OCR).
 *  2. Déployer > Nouveau déploiement > Application Web, puis ouvrir
 *     l'URL obtenue depuis le téléphone pour scanner un chèque.
 */

const NOM_ONGLET_CHEQUE = 'SituationRemiseFacture';
const COLONNE_NOM_CLIENT_CHEQUE = 3;   // C
const COLONNE_CODE_CLIENT_CHEQUE = 4;  // D
const COLONNE_ID_MENU_CHEQUE = 5;      // E - identifiant utilisé pour retrouver la ligne dans le menu déroulant
const COLONNE_MONTANT_CHEQUE = 7;      // G - montant à reporter dans ImpressionRemiseBank
const COLONNE_STATUT_CHEQUE = 11;      // K
const PREMIERE_LIGNE_CHEQUE = 2;       // La ligne 1 contient les en-têtes.

const NOM_ONGLET_IMPRESSION_CHEQUE = 'ImpressionRemiseBank';
const COLONNE_MENU_IMPRESSION_CHEQUE = 3;    // C
const COLONNE_MONTANT_IMPRESSION_CHEQUE = 4; // D
const PREMIERE_LIGNE_IMPRESSION_CHEQUE = 3;  // C3
const DERNIERE_LIGNE_IMPRESSION_CHEQUE = 7;  // C7

function doGet() {
  return HtmlService.createHtmlOutputFromFile('ScannerCheque')
    .setTitle('Scanner un chèque')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Appelé depuis la page web : reçoit la photo du chèque en base64,
 * lance l'OCR puis recherche les clients correspondants.
 */
function analyserCheque(donneesBase64, typeMime) {
  const octets = Utilities.base64Decode(donneesBase64);
  const blob = Utilities.newBlob(octets, typeMime, 'cheque.jpg');

  const texteOcr = extraireTexteImage_(blob);
  const clientsTrouves = rechercherClientsParTexte_(texteOcr);

  return {
    texteOcr: texteOcr,
    clients: clientsTrouves
  };
}

/** Convertit l'image en document Google temporaire pour en extraire le texte (OCR), puis le supprime. */
function extraireTexteImage_(blob) {
  const ressource = {
    title: blob.getName(),
    mimeType: blob.getContentType()
  };

  const fichierOcr = Drive.Files.insert(ressource, blob, {
    ocr: true,
    ocrLanguage: 'fr'
  });

  try {
    const doc = DocumentApp.openById(fichierOcr.id);
    return doc.getBody().getText();
  } finally {
    Drive.Files.remove(fichierOcr.id);
  }
}

/**
 * Compare le texte OCR du chèque à la liste des clients de
 * SituationRemiseFacture et renvoie, pour chaque client dont le nom
 * apparaît dans le texte, ses lignes pas encore marquées rapprochées.
 */
function rechercherClientsParTexte_(texteOcr) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOM_ONGLET_CHEQUE);
  if (!feuille) {
    throw new Error('Onglet introuvable : « ' + NOM_ONGLET_CHEQUE + ' ».');
  }

  const derniereLigne = feuille.getLastRow();
  if (derniereLigne < PREMIERE_LIGNE_CHEQUE) {
    return [];
  }

  const texteNormalise = normaliserTexteCheque_(texteOcr);
  const nombreLignes = derniereLigne - PREMIERE_LIGNE_CHEQUE + 1;
  const valeurs = feuille
    .getRange(PREMIERE_LIGNE_CHEQUE, 1, nombreLignes, COLONNE_STATUT_CHEQUE)
    .getDisplayValues();

  const clientsParCle = new Map();

  valeurs.forEach((ligne, index) => {
    const nomClient = String(ligne[COLONNE_NOM_CLIENT_CHEQUE - 1] || '').trim();
    const codeClient = String(ligne[COLONNE_CODE_CLIENT_CHEQUE - 1] || '').trim();
    const statut = normaliserTexteCheque_(ligne[COLONNE_STATUT_CHEQUE - 1]);

    if (!nomClient || statut.includes('FACTURE RAPPROCHEE')) {
      return;
    }

    if (!texteNormalise.includes(normaliserTexteCheque_(nomClient))) {
      return;
    }

    const cle = codeClient || nomClient;
    if (!clientsParCle.has(cle)) {
      clientsParCle.set(cle, { nomClient: nomClient, codeClient: codeClient, lignes: [] });
    }
    clientsParCle.get(cle).lignes.push(PREMIERE_LIGNE_CHEQUE + index);
  });

  return Array.from(clientsParCle.values());
}

/** Rend la comparaison insensible aux majuscules et aux accents. */
function normaliserTexteCheque_(valeur) {
  return String(valeur == null ? '' : valeur)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Marque la ligne donnée comme rapprochée (colonne K), après confirmation
 * manuelle sur la page web, puis tente de l'ajouter automatiquement à
 * ImpressionRemiseBank pour la remise en banque.
 */
function marquerLigneRapprochee(numeroLigne) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOM_ONGLET_CHEQUE);
  if (!feuille) {
    throw new Error('Onglet introuvable : « ' + NOM_ONGLET_CHEQUE + ' ».');
  }

  feuille.getRange(numeroLigne, COLONNE_STATUT_CHEQUE).setValue('FACTURE RAPPROCHÉE');

  try {
    const ligneImpression = ajouterLigneImpressionRemiseBank_(feuille, numeroLigne);
    return {
      rapprochee: true,
      remiseAjoutee: true,
      message: 'Ajoutée à ' + NOM_ONGLET_IMPRESSION_CHEQUE + ', ligne ' + ligneImpression + '.'
    };
  } catch (erreur) {
    return {
      rapprochee: true,
      remiseAjoutee: false,
      message: 'Rapprochée, mais pas ajoutée à ' + NOM_ONGLET_IMPRESSION_CHEQUE + ' : ' + erreur.message
    };
  }
}

/**
 * Retrouve, dans la première case vide de la colonne C de
 * ImpressionRemiseBank (C3:C7), l'entrée du menu déroulant correspondant
 * à l'identifiant (colonne E) de la ligne SituationRemiseFacture donnée,
 * puis y écrit cette entrée et le montant (colonne G). Réutilise
 * recupererChoixMenuDeroulant_ / rechercherValeurMenu_, déjà définies
 * dans le projet par RESTAURER_LIGNES_VERS_IMPRESSION_REMISE_BANK.
 */
function ajouterLigneImpressionRemiseBank_(feuilleSitu, numeroLigne) {
  const feuilleImpression = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOM_ONGLET_IMPRESSION_CHEQUE);
  if (!feuilleImpression) {
    throw new Error('Onglet introuvable : « ' + NOM_ONGLET_IMPRESSION_CHEQUE + ' ».');
  }

  const idRecherche = String(feuilleSitu.getRange(numeroLigne, COLONNE_ID_MENU_CHEQUE).getValue() ?? '').trim();
  if (!idRecherche) {
    throw new Error('La colonne E est vide pour cette ligne.');
  }

  const montant = feuilleSitu.getRange(numeroLigne, COLONNE_MONTANT_CHEQUE).getValue();

  let ligneVide = null;
  for (let ligne = PREMIERE_LIGNE_IMPRESSION_CHEQUE; ligne <= DERNIERE_LIGNE_IMPRESSION_CHEQUE; ligne++) {
    const valeurActuelle = feuilleImpression.getRange(ligne, COLONNE_MENU_IMPRESSION_CHEQUE).getValue();
    if (String(valeurActuelle ?? '').trim() === '') {
      ligneVide = ligne;
      break;
    }
  }

  if (ligneVide === null) {
    throw new Error(
      'Toutes les lignes C' + PREMIERE_LIGNE_IMPRESSION_CHEQUE + ':C' + DERNIERE_LIGNE_IMPRESSION_CHEQUE +
      ' de ' + NOM_ONGLET_IMPRESSION_CHEQUE + ' sont déjà remplies. Traite la remise en cours (bouton Banque) avant d\'en ajouter une nouvelle.'
    );
  }

  const celluleMenu = feuilleImpression.getRange(ligneVide, COLONNE_MENU_IMPRESSION_CHEQUE);
  const choixAutorises = recupererChoixMenuDeroulant_(celluleMenu);

  if (choixAutorises.length === 0) {
    throw new Error('La cellule ' + celluleMenu.getA1Notation() + ' ne contient aucun menu déroulant exploitable.');
  }

  const correspondances = rechercherValeurMenu_(choixAutorises, idRecherche);

  if (correspondances.length === 0) {
    throw new Error('Aucune valeur trouvée dans le menu de ' + celluleMenu.getA1Notation() + ' pour l\'identifiant : ' + idRecherche);
  }

  if (correspondances.length > 1) {
    throw new Error('Plusieurs valeurs correspondent à ' + idRecherche + ' dans le menu de ' + celluleMenu.getA1Notation() + '.');
  }

  celluleMenu.setValue(correspondances[0]);
  feuilleImpression.getRange(ligneVide, COLONNE_MONTANT_IMPRESSION_CHEQUE).setValue(montant);

  return ligneVide;
}
