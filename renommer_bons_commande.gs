/**
 * Renomme les bons de commande / factures PDF stockés dans un dossier Drive
 * en y ajoutant le nom du client et le montant de la remise de chèque
 * correspondante, à partir des données de l'onglet SituationRemiseFacture.
 *
 * Colonnes utilisées dans SituationRemiseFacture :
 *   C = Nom (client)
 *   J = Montant (montant total de la remise de chèque)
 *   L = N° facture (numéro utilisé pour retrouver le PDF)
 *
 * Format cible du nom de fichier : "<NOM CLIENT> - <N° FACTURE> - R <MONTANT>.pdf"
 * Exemple                        : "CHASTAGNER - BC-20250000052 - R 1750,25.pdf"
 *
 * Le script est idempotent : si un fichier porte déjà le nom cible, il est
 * ignoré (aucune erreur, aucun renommage inutile) à la prochaine exécution.
 */
function renommerBonsDeCommandeAvecMontantRemise() {
  const NOM_ONGLET = 'SituationRemiseFacture';
  const PREMIERE_LIGNE = 2; // La ligne 1 contient les en-têtes.
  // Le nom seul est ambigu (le dossier remonte deux fois via DriveApp, probablement
  // parce qu'il est partagé/dans un Drive partagé) : on fixe l'ID directement.
  const ID_DOSSIER_PDF = '1z4kwTrlCaenJ-4FLy4kBWiX5fvl37QEd';
  const NOM_DOSSIER_PDF = 'ImportClaudeFourni';

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOM_ONGLET);
  if (!feuille) {
    throw new Error(
      'Onglet introuvable : « ' + NOM_ONGLET + ' ».\n' +
      'Le script doit être installé dans le fichier qui contient cet onglet.'
    );
  }

  const dossier = ouvrirDossierPdf_(ID_DOSSIER_PDF, NOM_DOSSIER_PDF);

  const derniereLigne = feuille.getLastRow();
  if (derniereLigne < PREMIERE_LIGNE) {
    afficherResultatRenommage_(0, 0, 0);
    return;
  }

  const nombreLignes = derniereLigne - PREMIERE_LIGNE + 1;

  // Lecture jusqu'à L (colonne 12), seule plage utile pour ce traitement.
  const plage = feuille.getRange(PREMIERE_LIGNE, 1, nombreLignes, 12);
  const valeurs = plage.getValues();
  const valeursAffichees = plage.getDisplayValues();

  let nombreRenommes = 0;
  let nombreIgnores = 0;
  let nombreErreurs = 0;

  for (let i = 0; i < valeurs.length; i++) {
    const ligneFeuille = PREMIERE_LIGNE + i;
    const numero = String(valeursAffichees[i][11]).trim(); // L

    if (!numero) {
      continue;
    }

    try {
      const fichiersTrouves = chercherFichiersParNumero_(dossier, numero);

      if (fichiersTrouves.length === 0) {
        console.warn('Ligne ' + ligneFeuille + ' : aucun fichier PDF trouvé pour « ' + numero + ' ».');
        nombreIgnores++;
        continue;
      }
      if (fichiersTrouves.length > 1) {
        console.warn('Ligne ' + ligneFeuille + ' : plusieurs fichiers correspondent à « ' + numero + ' », renommage ignoré (ambigu).');
        nombreIgnores++;
        continue;
      }

      const nomClient = String(valeursAffichees[i][2]).trim(); // C
      const montant = valeurs[i][9]; // J

      if (!nomClient || montant === '' || montant === null) {
        console.warn('Ligne ' + ligneFeuille + ' : nom client ou montant de la remise manquant, renommage ignoré.');
        nombreIgnores++;
        continue;
      }

      const nomCible = construireNomFichier_(nomClient, numero, montant);
      const fichier = fichiersTrouves[0];

      if (fichier.getName() === nomCible) {
        continue; // Déjà renommé lors d'une exécution précédente.
      }

      fichier.setName(nomCible);
      nombreRenommes++;

    } catch (erreur) {
      console.error('Ligne ' + ligneFeuille + ' : erreur lors du renommage — ' + erreur.message);
      nombreErreurs++;
    }
  }

  afficherResultatRenommage_(nombreRenommes, nombreIgnores, nombreErreurs);
}


/** Ouvre le dossier Drive contenant les PDF, par ID si fourni sinon par nom. */
function ouvrirDossierPdf_(idDossier, nomDossier) {
  if (idDossier) {
    return DriveApp.getFolderById(idDossier);
  }

  const dossiers = DriveApp.getFoldersByName(nomDossier);
  if (!dossiers.hasNext()) {
    throw new Error('Dossier introuvable : « ' + nomDossier + ' ». Renseignez ID_DOSSIER_PDF si besoin.');
  }

  const dossier = dossiers.next();
  if (dossiers.hasNext()) {
    throw new Error(
      'Plusieurs dossiers nommés « ' + nomDossier + ' » existent sur ce Drive. ' +
      'Renseignez ID_DOSSIER_PDF avec l\'ID exact du bon dossier pour lever l\'ambiguïté.'
    );
  }
  return dossier;
}


/**
 * Renvoie tous les fichiers du dossier dont le nom contient le numéro donné.
 * On ne filtre volontairement pas par MimeType.PDF : selon les réglages de
 * synchronisation Drive, un PDF déposé peut être stocké avec un autre type
 * MIME tout en s'affichant comme un PDF localement. Le nom de fichier reste
 * le critère fiable.
 */
function chercherFichiersParNumero_(dossier, numero) {
  const fichiers = dossier.getFiles();
  const correspondances = [];

  while (fichiers.hasNext()) {
    const fichier = fichiers.next();
    if (fichier.getName().indexOf(numero) !== -1) {
      correspondances.push(fichier);
    }
  }

  return correspondances;
}


/** Construit le nom de fichier cible : "<NOM> - <NUMERO> - R <MONTANT>.pdf". */
function construireNomFichier_(nomClient, numero, montant) {
  const montantFormate = formaterMontant_(montant);
  return nettoyerPourNomFichier_(nomClient).toUpperCase() + ' - ' + nettoyerPourNomFichier_(numero) +
    ' - R ' + montantFormate + '.pdf';
}


/** Formate un montant en écriture française avec 2 décimales : 1750.25 -> "1750,25". */
function formaterMontant_(montant) {
  let valeur = montant;

  if (typeof valeur !== 'number') {
    valeur = Number(String(valeur).replace(/\s/g, '').replace(',', '.'));
  }

  if (!Number.isFinite(valeur)) {
    throw new Error('Montant de la remise invalide : « ' + montant + ' ».');
  }

  return valeur.toFixed(2).replace('.', ',');
}


/** Retire les caractères interdits ou gênants dans un nom de fichier Drive. */
function nettoyerPourNomFichier_(texte) {
  return String(texte).replace(/[\/\\:*?"<>|]/g, '-').trim();
}


function afficherResultatRenommage_(nombreRenommes, nombreIgnores, nombreErreurs) {
  let message = nombreRenommes + ' fichier(s) renommé(s).';

  if (nombreIgnores > 0) {
    message += ' ' + nombreIgnores + ' ligne(s) ignorée(s) (fichier introuvable, ambigu, ou données manquantes).';
  }
  if (nombreErreurs > 0) {
    message += ' ' + nombreErreurs + ' erreur(s) — voir le journal d\'exécution.';
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Renommage des bons de commande', 8);
  console.log(message);
}
