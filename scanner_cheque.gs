/**
 * Scan de chèque : lit le nom du payeur par OCR et le compare aux
 * entrées du menu déroulant de la colonne C de ImpressionRemiseBank
 * (menu alimenté par la colonne Z). Si une correspondance est
 * trouvée, on peut la sélectionner d'un tap — exactement comme si on
 * la choisissait à la main dans le menu déroulant.
 *
 * Ne touche à SituationRemiseFacture que si l'opérateur le confirme
 * explicitement : une fois C3:C7 entièrement rempli, la page propose
 * de traiter la remise (traiterRemiseDepuisScan), qui reporte alors
 * le contenu de ImpressionRemiseBank vers SituationRemiseFacture —
 * jamais automatiquement, jamais sans confirmation.
 *
 * Prérequis à activer une seule fois dans l'éditeur Apps Script :
 *  1. Services (icône +) > Drive API > Ajouter (nécessaire pour l'OCR).
 *  2. Déployer > Nouveau déploiement > Application Web, puis ouvrir
 *     l'URL obtenue depuis le téléphone pour scanner un chèque.
 */

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
 * lance l'OCR puis recherche les entrées du menu déroulant de
 * ImpressionRemiseBank dont le nom apparaît dans le texte lu.
 */
function analyserCheque(donneesBase64, typeMime) {
  const octets = Utilities.base64Decode(donneesBase64);
  const blob = Utilities.newBlob(octets, typeMime, 'cheque.jpg');
  const texteOcr = extraireTexteImage_(blob);

  const feuilleImpression = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOM_ONGLET_IMPRESSION_CHEQUE);
  if (!feuilleImpression) {
    throw new Error('Onglet introuvable : « ' + NOM_ONGLET_IMPRESSION_CHEQUE + ' ».');
  }

  // Toutes les cellules C3:C7 partagent normalement le même menu déroulant.
  const celluleReference = feuilleImpression.getRange(PREMIERE_LIGNE_IMPRESSION_CHEQUE, COLONNE_MENU_IMPRESSION_CHEQUE);
  const choixDisponibles = recupererChoixMenuDeroulant_(celluleReference);

  const texteNormalise = normaliserTexteCheque_(texteOcr);
  const choixTrouves = choixDisponibles.filter(choix => {
    const nom = extraireSegmentChoix_(choix, 2);
    return nom !== '' && texteNormalise.includes(normaliserTexteCheque_(nom));
  });

  return {
    texteOcr: texteOcr,
    choix: choixTrouves
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
 * Sélectionne l'entrée choisie (exactement comme un choix manuel dans
 * le menu déroulant) dans la première case vide de C3:C7, et reporte
 * le montant en D. Appelé depuis la page web après confirmation.
 */
function ajouterChoixImpressionRemiseBank(choixTexte) {
  const feuilleImpression = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOM_ONGLET_IMPRESSION_CHEQUE);
  if (!feuilleImpression) {
    throw new Error('Onglet introuvable : « ' + NOM_ONGLET_IMPRESSION_CHEQUE + ' ».');
  }

  const choixNormalise = String(choixTexte).trim();

  let ligneVide = null;
  for (let ligne = PREMIERE_LIGNE_IMPRESSION_CHEQUE; ligne <= DERNIERE_LIGNE_IMPRESSION_CHEQUE; ligne++) {
    const valeurActuelle = String(feuilleImpression.getRange(ligne, COLONNE_MENU_IMPRESSION_CHEQUE).getValue() ?? '').trim();

    if (valeurActuelle === choixNormalise) {
      throw new Error('Ce chèque est déjà présent dans ' + NOM_ONGLET_IMPRESSION_CHEQUE + ', ligne ' + ligne + '.');
    }

    if (ligneVide === null && valeurActuelle === '') {
      ligneVide = ligne;
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

  if (!choixAutorises.some(choix => String(choix).trim() === choixNormalise)) {
    throw new Error('Cette entrée ne fait plus partie du menu déroulant (peut-être déjà utilisée ailleurs). Relance le scan.');
  }

  celluleMenu.setValue(choixTexte);
  feuilleImpression.getRange(ligneVide, COLONNE_MONTANT_IMPRESSION_CHEQUE).setValue(extraireMontantChoix_(choixTexte));

  return {
    ligne: ligneVide,
    remiseComplete: ligneVide === DERNIERE_LIGNE_IMPRESSION_CHEQUE
  };
}

/**
 * Appelée depuis la page web uniquement après confirmation explicite
 * de l'opérateur (une fois C3:C7 entièrement rempli). Réutilise
 * executerTraitementRemise_ (définie dans
 * traitement_import_situation_remise_final.gs), la même logique que
 * le menu TRAITEMENT_IMPORT_SITUATION_REMISE_FINAL, pour reporter
 * ImpressionRemiseBank vers SituationRemiseFacture.
 */
function traiterRemiseDepuisScan() {
  return executerTraitementRemise_();
}

/** Extrait le segment (séparé par |) à l'index donné d'une entrée du menu déroulant. */
function extraireSegmentChoix_(choix, index) {
  const segments = String(choix).split('|').map(segment => segment.trim());
  return segments.length > index ? segments[index] : '';
}

/** Extrait le montant (7e segment) d'une entrée du menu déroulant, ex: "... | 185.35 | Facturé". */
function extraireMontantChoix_(choix) {
  const brut = extraireSegmentChoix_(choix, 6);
  const nombre = Number(String(brut).replace(',', '.'));
  return Number.isFinite(nombre) ? nombre : brut;
}

/** Rend la comparaison insensible aux majuscules et aux accents. */
function normaliserTexteCheque_(valeur) {
  return String(valeur == null ? '' : valeur)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}
