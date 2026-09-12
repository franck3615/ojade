/**
 * Repère, dans les onglets ListeDevis et ListeCommande (exports Evoliz), les devis
 * et bons de commande qui n'ont jamais été transformés en facture (Etat différent
 * de « Facturé ») ou qui ont été annulés, afin de pouvoir les passer en revue et
 * les supprimer manuellement (le script ne supprime rien lui-même).
 *
 * Résultat écrit dans un onglet dédié « DevisCommandesNonFactures » :
 *   Type | Numéro | Client | Date | Montant TTC | État | Annulé
 *
 * Chaque devis/commande apparaît sur plusieurs lignes dans les exports Evoliz
 * (une ligne par article) ; le script regroupe par numéro et ne garde qu'une
 * ligne de synthèse par document.
 */
function identifierDevisEtCommandesNonFactures() {
  const NOM_ONGLET_SORTIE = 'DevisCommandesNonFactures';

  // Positions de colonnes (0 = A), identiques sur les deux onglets d'après
  // l'export Evoliz. ListeCommande n'a pas de ligne d'en-tête exploitable :
  // on se fie à ce positionnement, vérifié par un contrôle de cohérence
  // sur la colonne Etat au démarrage.
  const COLONNES = {
    numero: 0,   // A : Devis n° / Commande n°
    date: 1,     // B : Date devis / Date commande
    client: 2,   // C : Organisation
    montant: 8,  // I : Total TTC
    etat: 9,     // J : Etat
    annule: 24   // Y : Annulé
  };
  const ETATS_CONNUS = ['FACTURE', 'ENREGISTRE', 'ACCEPTE', 'ENVOYE', 'REFUSE', 'BROUILLON'];

  const classeur = SpreadsheetApp.getActiveSpreadsheet();

  const lignesDevis = collecterDocumentsNonFactures_(classeur, 'ListeDevis', 'Devis', 1, COLONNES, ETATS_CONNUS);
  const lignesCommandes = collecterDocumentsNonFactures_(classeur, 'ListeCommande', 'Commande', 0, COLONNES, ETATS_CONNUS);

  const resultat = lignesDevis.concat(lignesCommandes);

  const sortie = obtenirOuCreerOngletSortie_(classeur, NOM_ONGLET_SORTIE);
  sortie.clear();
  sortie.appendRow(['Type', 'Numéro', 'Client', 'Date', 'Montant TTC', 'État', 'Annulé']);

  if (resultat.length > 0) {
    sortie.getRange(2, 1, resultat.length, 7).setValues(resultat);
  }

  const message = resultat.length + ' devis/commande(s) non facturé(s) ou annulé(s) — voir l\'onglet « ' +
    NOM_ONGLET_SORTIE + ' ». Rien n\'a été supprimé automatiquement.';
  classeur.toast(message, 'Devis / commandes non facturés', 8);
  console.log(message);
}


/**
 * Lit un onglet Evoliz (ListeDevis ou ListeCommande), regroupe les lignes par
 * numéro de document et renvoie une ligne de synthèse pour chaque document
 * dont l'état n'est pas « Facturé » ou qui est marqué annulé.
 */
function collecterDocumentsNonFactures_(classeur, nomOnglet, typeDocument, premiereLigne, colonnes, etatsConnus) {
  const feuille = classeur.getSheetByName(nomOnglet);
  if (!feuille) {
    throw new Error('Onglet introuvable : « ' + nomOnglet + ' ».');
  }

  const derniereLigne = feuille.getLastRow();
  if (derniereLigne < premiereLigne + 1) {
    return [];
  }

  const nombreLignes = derniereLigne - premiereLigne;
  const derniereColonne = Math.max(colonnes.annule, colonnes.etat, colonnes.montant, colonnes.client, colonnes.date, colonnes.numero) + 1;
  const valeurs = feuille.getRange(premiereLigne + 1, 1, nombreLignes, derniereColonne).getDisplayValues();

  verifierColonneEtat_(nomOnglet, valeurs, colonnes.etat, etatsConnus);

  const documentsVus = new Set();
  const resultat = [];

  for (let i = 0; i < valeurs.length; i++) {
    const numero = String(valeurs[i][colonnes.numero]).trim();
    if (!numero || documentsVus.has(numero)) {
      continue;
    }
    documentsVus.add(numero);

    const etat = String(valeurs[i][colonnes.etat]).trim();
    const annule = String(valeurs[i][colonnes.annule]).trim();
    const estFacture = normaliserTexte_(etat) === 'FACTURE';
    const estAnnule = normaliserTexte_(annule) === 'OUI';

    if (estFacture && !estAnnule) {
      continue; // Transformé en facture et pas annulé : rien à signaler.
    }

    resultat.push([
      typeDocument,
      numero,
      String(valeurs[i][colonnes.client]).trim(),
      String(valeurs[i][colonnes.date]).trim(),
      String(valeurs[i][colonnes.montant]).trim(),
      etat,
      annule || 'Non'
    ]);
  }

  return resultat;
}


/** Rend la comparaison insensible aux majuscules et aux accents. */
function normaliserTexte_(valeur) {
  return String(valeur == null ? '' : valeur)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}


/**
 * Vérifie que la colonne « Etat » contient bien des valeurs connues, pour détecter
 * rapidement un décalage de colonnes (notamment sur ListeCommande, sans en-tête).
 */
function verifierColonneEtat_(nomOnglet, valeurs, colonneEtat, etatsConnus) {
  for (let i = 0; i < valeurs.length; i++) {
    const etat = normaliserTexte_(valeurs[i][colonneEtat]);
    if (etat && etatsConnus.indexOf(etat) === -1) {
      throw new Error(
        'Colonne « Etat » inattendue dans « ' + nomOnglet + ' » (ligne ' + (i + 1) + ' : "' +
        valeurs[i][colonneEtat] + '"). Le positionnement des colonnes a peut-être changé, ' +
        'vérifiez la constante COLONNES avant de relancer.'
      );
    }
  }
}


/** Renvoie l'onglet de sortie donné, en le créant s'il n'existe pas encore. */
function obtenirOuCreerOngletSortie_(classeur, nomOnglet) {
  const existant = classeur.getSheetByName(nomOnglet);
  return existant || classeur.insertSheet(nomOnglet);
}
