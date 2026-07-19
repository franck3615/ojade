/**
 * Exporte vers le modèle Evoliz toutes les lignes de SituationRemiseFacture
 * dont la colonne K contient « FACTURE RAPPROCHÉE ».
 */
function exporterPaiementsVersEvoliz() {
  const NOM_ONGLET_SOURCE = 'SituationRemiseFacture';
  const PREMIERE_LIGNE_SOURCE = 2; // La ligne 1 contient les en-têtes.

  const ID_FICHIER_CIBLE = '1309w8S1ZCOwwfdB2p7S15TLPcAo8OGFb';
  const NOM_ONGLET_CIBLE = 'Evoliz.com';
  const PREMIERE_LIGNE_CIBLE = 2; // La ligne 1 contient les en-têtes Evoliz.

  const classeurSource = SpreadsheetApp.getActiveSpreadsheet();
  const source = classeurSource.getSheetByName(NOM_ONGLET_SOURCE);

  if (!source) {
    throw new Error(
      'Onglet source introuvable : « ' + NOM_ONGLET_SOURCE + ' ».\n' +
      'Le script doit être installé dans le fichier qui contient cet onglet.'
    );
  }

  const derniereLigneSource = source.getLastRow();
  if (derniereLigneSource < PREMIERE_LIGNE_SOURCE) {
    afficherResultatExport_(0);
    return 0;
  }

  const nombreLignesSource = derniereLigneSource - PREMIERE_LIGNE_SOURCE + 1;

  // Lecture jusqu'à L, car la dernière colonne utile du fichier source est L.
  const plageSource = source.getRange(
    PREMIERE_LIGNE_SOURCE,
    1,
    nombreLignesSource,
    12
  );
  const valeurs = plageSource.getValues();
  const valeursAffichees = plageSource.getDisplayValues();

  const paiements = [];
  const lignesSansNumeroFacture = [];

  for (let i = 0; i < valeurs.length; i++) {
    const statutColonneK = normaliserTexte_(valeursAffichees[i][10]);

    if (!statutColonneK.includes('FACTURE RAPPROCHEE')) {
      continue;
    }

    const numeroFacture = String(valeursAffichees[i][11]).trim(); // L -> A
    if (!numeroFacture) {
      lignesSansNumeroFacture.push(PREMIERE_LIGNE_SOURCE + i);
      continue;
    }

    paiements.push({
      numeroFacture: numeroFacture,                         // L -> A
      datePaiement: normaliserDate_(valeurs[i][8]),          // I -> B
      nomClient: String(valeursAffichees[i][2]).trim(),      // C -> D
      codeClient: String(valeursAffichees[i][3]).trim(),     // D -> E
      libelle: 'Règlement facture ' + numeroFacture,         // F obligatoire
      modePaiement: 'Autres',                                // G obligatoire
      montant: normaliserMontant_(valeurs[i][9])             // J -> H
    });
  }

  if (lignesSansNumeroFacture.length > 0) {
    throw new Error(
      'Export interrompu : la colonne L est vide pour les lignes source suivantes : ' +
      lignesSansNumeroFacture.join(', ') + '.'
    );
  }

  if (paiements.length === 0) {
    afficherResultatExport_(0);
    return 0;
  }

  const classeurCible = SpreadsheetApp.openById(ID_FICHIER_CIBLE);
  const cible = classeurCible.getSheetByName(NOM_ONGLET_CIBLE);

  if (!cible) {
    throw new Error(
      'Onglet cible introuvable : « ' + NOM_ONGLET_CIBLE + ' » dans le fichier ' +
      classeurCible.getName() + '.'
    );
  }

  // Première ligne située après la dernière cellule remplie de la colonne A.
  const premiereLigneLibre = trouverPremiereLigneLibreApresColonne_(
    cible,
    1,
    PREMIERE_LIGNE_CIBLE
  );

  const derniereLigneNecessaire = premiereLigneLibre + paiements.length - 1;
  if (derniereLigneNecessaire > cible.getMaxRows()) {
    cible.insertRowsAfter(
      cible.getMaxRows(),
      derniereLigneNecessaire - cible.getMaxRows()
    );
  }

  // Écriture uniquement dans les colonnes concernées afin de ne pas modifier
  // les colonnes C, I et J du modèle Evoliz.
  cible.getRange(premiereLigneLibre, 1, paiements.length, 1)
    .setValues(paiements.map(p => [p.numeroFacture]));

  cible.getRange(premiereLigneLibre, 2, paiements.length, 1)
    .setValues(paiements.map(p => [p.datePaiement]))
    .setNumberFormat('dd/MM/yyyy');

  cible.getRange(premiereLigneLibre, 4, paiements.length, 1)
    .setValues(paiements.map(p => [p.nomClient]));

  cible.getRange(premiereLigneLibre, 5, paiements.length, 1)
    .setValues(paiements.map(p => [p.codeClient]));

  cible.getRange(premiereLigneLibre, 6, paiements.length, 1)
    .setValues(paiements.map(p => [p.libelle]));

  cible.getRange(premiereLigneLibre, 7, paiements.length, 1)
    .setValues(paiements.map(p => [p.modePaiement]));

  cible.getRange(premiereLigneLibre, 8, paiements.length, 1)
    .setValues(paiements.map(p => [p.montant]))
    .setNumberFormat('0.00');

  SpreadsheetApp.flush();
  afficherResultatExport_(paiements.length);
  return paiements.length;
}


/**
 * Renvoie la première ligne située après la dernière valeur de la colonne.
 * Si la colonne ne contient que son en-tête, renvoie la première ligne de données.
 */
function trouverPremiereLigneLibreApresColonne_(feuille, colonne, premiereLigneDonnees) {
  const derniereLigneFeuille = feuille.getLastRow();

  if (derniereLigneFeuille < premiereLigneDonnees) {
    return premiereLigneDonnees;
  }

  const valeursColonne = feuille
    .getRange(
      premiereLigneDonnees,
      colonne,
      derniereLigneFeuille - premiereLigneDonnees + 1,
      1
    )
    .getDisplayValues();

  for (let i = valeursColonne.length - 1; i >= 0; i--) {
    if (String(valeursColonne[i][0]).trim() !== '') {
      return premiereLigneDonnees + i + 1;
    }
  }

  return premiereLigneDonnees;
}


/** Rend la comparaison insensible aux majuscules et aux accents. */
function normaliserTexte_(valeur) {
  return String(valeur == null ? '' : valeur)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}


/** Convertit une date texte jj/mm/aaaa en vraie date Google Sheets. */
function normaliserDate_(valeur) {
  if (valeur instanceof Date && !isNaN(valeur.getTime())) {
    return valeur;
  }

  const texte = String(valeur == null ? '' : valeur).trim();
  const correspondance = texte.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);

  if (!correspondance) {
    return valeur;
  }

  return new Date(
    Number(correspondance[3]),
    Number(correspondance[2]) - 1,
    Number(correspondance[1]),
    12,
    0,
    0
  );
}


/** Convertit si nécessaire un montant français écrit sous forme de texte. */
function normaliserMontant_(valeur) {
  if (typeof valeur === 'number') {
    return valeur;
  }

  let texte = String(valeur == null ? '' : valeur)
    .replace(/[\s\u00A0\u202F€]/g, '')
    .trim();

  if (texte === '') {
    return '';
  }

  if (texte.includes(',') && texte.includes('.')) {
    if (texte.lastIndexOf(',') > texte.lastIndexOf('.')) {
      texte = texte.replace(/\./g, '').replace(',', '.');
    } else {
      texte = texte.replace(/,/g, '');
    }
  } else if (texte.includes(',')) {
    texte = texte.replace(',', '.');
  }

  const montant = Number(texte);
  return Number.isFinite(montant) ? montant : valeur;
}


function afficherResultatExport_(nombreLignes) {
  const message = nombreLignes === 0
    ? 'Aucune ligne contenant « FACTURE RAPPROCHÉE » à exporter.'
    : nombreLignes + ' paiement(s) exporté(s) vers Evoliz.';

  SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Export Evoliz', 6);
  console.log(message);
}
