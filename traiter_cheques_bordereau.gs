/**
 * Extrait par OCR le texte des chèques (JPEG/PNG) déposés dans un dossier Drive,
 * remplit un bordereau dans la feuille active, puis déplace chaque fichier traité
 * vers un sous-dossier « Traités » pour éviter de le retraiter à la prochaine exécution.
 *
 * Prérequis : activer le service avancé « Drive API » dans l'éditeur Apps Script
 * (Extensions > Services). Ce script utilise la syntaxe Drive API v2
 * (champ « title », Drive.Files.remove) ; adapter vers v3 si nécessaire
 * (champ « name », Drive.Files.delete).
 */
function traiterChequesEtRemplirBordereau() {
  const ID_DOSSIER_CHEQUES = 'VOTRE_ID_DE_DOSSIER_DRIVE'; // L'ID du dossier où sont stockés vos chèques
  const NOM_DOSSIER_TRAITES = 'Traités';
  const DUREE_MAX_EXECUTION_MS = 5 * 60 * 1000; // marge sous la limite de 6 min d'Apps Script
  const MONTANT_MIN = 0.01;
  const MONTANT_MAX = 1000000;

  const heureDebut = new Date().getTime();

  const dossier = DriveApp.getFolderById(ID_DOSSIER_CHEQUES);
  const dossierTraites = obtenirOuCreerSousDossier_(dossier, NOM_DOSSIER_TRAITES);

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // En-têtes du bordereau si la feuille est vide
  if (feuille.getLastRow() === 0) {
    feuille.appendRow(['Nom du fichier', 'Client / Émetteur', 'Montant (€)', 'Statut']);
  }

  const nomsDejaTraites = lireNomsDejaTraites_(feuille);

  const fichiers = dossier.getFiles();
  let nombreTraites = 0;
  let nombreErreurs = 0;
  let interrompuPourDuree = false;

  while (fichiers.hasNext()) {
    if (new Date().getTime() - heureDebut > DUREE_MAX_EXECUTION_MS) {
      interrompuPourDuree = true;
      break;
    }

    const fichier = fichiers.next();
    const mimeType = fichier.getMimeType();

    // Vérifier s'il s'agit d'une image (JPEG, PNG)
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
      continue;
    }

    const nomFichier = fichier.getName();
    if (nomsDejaTraites.has(nomFichier)) {
      // Filet de sécurité : le déplacement vers "Traités" gère normalement les doublons.
      continue;
    }

    let fichierTempId = null;

    try {
      // 1. OCR via l'API Drive avancée (convertit l'image en document texte temporaire)
      const fichierTemp = Drive.Files.insert(
        { title: 'temp_ocr_' + nomFichier, mimeType: mimeType },
        fichier.getBlob(),
        { ocr: true }
      );
      fichierTempId = fichierTemp.id;

      // 2. Récupérer le texte extrait de l'image
      const docTemp = DocumentApp.openById(fichierTempId);
      const texteExtrait = docTemp.getBody().getText();

      // 3. Extraction du montant (priorité aux montants accolés à un symbole €)
      const resultatMontant = extraireMontant_(texteExtrait, MONTANT_MIN, MONTANT_MAX);

      // 4. Ajout d'une ligne dans le bordereau
      feuille.appendRow([
        nomFichier,
        'À vérifier sur l\'image', // Le texte brut peut être analysé pour trouver le nom
        resultatMontant.montant !== null ? resultatMontant.montant : 'Non détecté',
        resultatMontant.confiant ? 'OK' : 'À vérifier'
      ]);

      // 5. Marquer le fichier comme traité pour ne pas le retraiter au prochain lancement
      fichier.moveTo(dossierTraites);
      nombreTraites++;

    } catch (erreur) {
      feuille.appendRow([nomFichier, '', '', 'Erreur OCR : ' + erreur.message]);
      nombreErreurs++;
      console.error('Échec du traitement de "' + nomFichier + '" : ' + erreur.message);

    } finally {
      if (fichierTempId) {
        supprimerFichierTemporaire_(fichierTempId);
      }
    }
  }

  afficherResultatTraitement_(nombreTraites, nombreErreurs, interrompuPourDuree);
}


/** Renvoie le sous-dossier donné, en le créant s'il n'existe pas encore. */
function obtenirOuCreerSousDossier_(dossierParent, nomSousDossier) {
  const sousDossiers = dossierParent.getFoldersByName(nomSousDossier);
  if (sousDossiers.hasNext()) {
    return sousDossiers.next();
  }
  return dossierParent.createFolder(nomSousDossier);
}


/** Ensemble des noms de fichiers déjà présents dans la colonne A du bordereau. */
function lireNomsDejaTraites_(feuille) {
  const derniereLigne = feuille.getLastRow();
  if (derniereLigne < 2) {
    return new Set();
  }

  const noms = feuille.getRange(2, 1, derniereLigne - 1, 1).getValues();
  return new Set(noms.map(function (ligne) {
    return String(ligne[0]).trim();
  }));
}


/**
 * Cherche un montant en euros dans le texte OCR d'un chèque.
 * Priorité aux montants accolés à un symbole €, ce qui évite de confondre
 * le montant avec une date, un numéro de chèque ou un numéro de compte.
 * Renvoie { montant, confiant } ; confiant vaut false si le résultat doit
 * être vérifié manuellement (aucun symbole € trouvé, ou plusieurs montants
 * distincts accolés à un symbole €).
 */
function extraireMontant_(texte, montantMin, montantMax) {
  const motifAvecSymbole = /(\d{1,3}(?:[\s .]\d{3})*[.,]\d{2})\s*€|€\s*(\d{1,3}(?:[\s .]\d{3})*[.,]\d{2})/g;
  const candidatsAvecSymbole = collecterMontants_(texte, motifAvecSymbole, montantMin, montantMax);

  if (candidatsAvecSymbole.length === 1) {
    return { montant: candidatsAvecSymbole[0], confiant: true };
  }
  if (candidatsAvecSymbole.length > 1) {
    return { montant: Math.max.apply(null, candidatsAvecSymbole), confiant: false };
  }

  // Aucun montant accolé à un € : on retombe sur n'importe quel nombre décimal,
  // mais le résultat est alors systématiquement marqué "à vérifier".
  const motifSansSymbole = /\d{1,3}(?:[\s .]\d{3})*[.,]\d{2}/g;
  const candidatsSansSymbole = collecterMontants_(texte, motifSansSymbole, montantMin, montantMax);

  if (candidatsSansSymbole.length === 0) {
    return { montant: null, confiant: false };
  }
  return { montant: Math.max.apply(null, candidatsSansSymbole), confiant: false };
}


function collecterMontants_(texte, motif, montantMin, montantMax) {
  const montants = [];
  let correspondance;

  while ((correspondance = motif.exec(texte)) !== null) {
    const brut = correspondance[1] || correspondance[2] || correspondance[0];
    const montant = normaliserMontantFrancais_(brut);
    if (montant !== null && montant >= montantMin && montant <= montantMax) {
      montants.push(montant);
    }
  }

  return montants;
}


/** Convertit un montant écrit en français ("1 234,56", "1.234,56", "150.00") en nombre. */
function normaliserMontantFrancais_(texte) {
  let nettoye = String(texte).replace(/[\s ]/g, '');

  if (nettoye.includes(',')) {
    nettoye = nettoye.replace(/\./g, '').replace(',', '.');
  }

  const valeur = Number(nettoye);
  return Number.isFinite(valeur) ? valeur : null;
}


/** Supprime le document OCR temporaire, définitivement si possible. */
function supprimerFichierTemporaire_(fichierTempId) {
  try {
    Drive.Files.remove(fichierTempId); // Suppression définitive (API Drive v2)
  } catch (erreur) {
    try {
      DriveApp.getFileById(fichierTempId).setTrashed(true);
      console.warn('Suppression définitive impossible pour ' + fichierTempId + ', fichier mis à la corbeille à la place.');
    } catch (erreurSecondaire) {
      console.error('Impossible de supprimer le fichier OCR temporaire ' + fichierTempId + ' : ' + erreurSecondaire.message);
    }
  }
}


function afficherResultatTraitement_(nombreTraites, nombreErreurs, interrompuPourDuree) {
  let message = nombreTraites + ' chèque(s) traité(s).';

  if (nombreErreurs > 0) {
    message += ' ' + nombreErreurs + ' erreur(s) — voir la colonne Statut.';
  }
  if (interrompuPourDuree) {
    message += ' Traitement interrompu avant la fin (durée max atteinte) : relancez le script pour continuer.';
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Traitement des chèques', 8);
  console.log(message);
}
