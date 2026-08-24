/**
 * Pont manuel entre SituationRemiseFacture et ImpressionRemiseBank :
 * on sélectionne 1 à 5 lignes dans SituationRemiseFacture, on lance
 * cette macro, et elle retrouve/écrit les entrées correspondantes
 * dans le menu déroulant (colonne C) et le montant (colonne D) de
 * ImpressionRemiseBank, en C3:D7.
 *
 * Réutilisé automatiquement par scanner_cheque.gs (via
 * recupererChoixMenuDeroulant_ / rechercherValeurMenu_) pour remplir
 * ImpressionRemiseBank dès qu'un chèque scanné est rapproché.
 */
function RESTAURER_LIGNES_VERS_IMPRESSION_REMISE_BANK() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const shSitu = ss.getSheetByName("SituationRemiseFacture");
  const shSource = ss.getSheetByName("ImpressionRemiseBank");

  if (!shSitu || !shSource) {
    ui.alert(
      "Feuille introuvable",
      "Vérifie les feuilles SituationRemiseFacture et ImpressionRemiseBank.",
      ui.ButtonSet.OK
    );
    return;
  }

  // La sélection doit être faite dans SituationRemiseFacture
  if (ss.getActiveSheet().getName() !== "SituationRemiseFacture") {
    ui.alert(
      "Place-toi dans SituationRemiseFacture et sélectionne entre 1 et 5 lignes."
    );
    return;
  }

  const selection = shSitu.getActiveRange();

  if (!selection) {
    ui.alert("Sélectionne entre 1 et 5 lignes.");
    return;
  }

  const premiereLigne = selection.getRow();
  const nombreLignes = selection.getNumRows();

  if (nombreLignes < 1 || nombreLignes > 5) {
    ui.alert("Tu dois sélectionner entre 1 et 5 lignes consécutives.");
    return;
  }

  /*
    Lecture de SituationRemiseFacture :

    E = identifiant permettant de retrouver la valeur
        dans le menu déroulant

    G = montant à replacer dans la colonne D
        de ImpressionRemiseBank
  */
  const donneesSituation = shSitu
    .getRange(premiereLigne, 1, nombreLignes, 10)
    .getValues();

  const resultats = [];
  const erreurs = [];

  for (let i = 0; i < nombreLignes; i++) {
    const ligneSituation = donneesSituation[i];

    const idRecherche = String(ligneSituation[4] ?? "").trim(); // E
    const montant = ligneSituation[6];                          // G

    const ligneDestination = 3 + i;
    const celluleMenu = shSource.getRange(ligneDestination, 3); // C3 à C7

    if (idRecherche === "") {
      erreurs.push(
        "Ligne " +
        (premiereLigne + i) +
        " : l'identifiant de la colonne E est vide."
      );
      continue;
    }

    const choixAutorises = recupererChoixMenuDeroulant_(celluleMenu);

    if (choixAutorises.length === 0) {
      erreurs.push(
        "La cellule " +
        celluleMenu.getA1Notation() +
        " ne contient aucun menu déroulant exploitable."
      );
      continue;
    }

    const correspondances = rechercherValeurMenu_(
      choixAutorises,
      idRecherche
    );

    if (correspondances.length === 0) {
      erreurs.push(
        "Aucune valeur trouvée dans le menu de " +
        celluleMenu.getA1Notation() +
        " pour l'identifiant : " +
        idRecherche
      );
      continue;
    }

    if (correspondances.length > 1) {
      erreurs.push(
        "Plusieurs valeurs correspondent à " +
        idRecherche +
        " dans le menu de " +
        celluleMenu.getA1Notation() +
        "."
      );
      continue;
    }

    resultats.push({
      ligneDestination: ligneDestination,
      valeurMenu: correspondances[0],
      montant: montant
    });
  }

  /*
    Par sécurité, on n'écrit rien lorsqu'au moins
    une ligne n'a pas pu être retrouvée correctement.
  */
  if (erreurs.length > 0) {
    ui.alert(
      "Import interrompu",
      erreurs.join("\n\n"),
      ui.ButtonSet.OK
    );
    return;
  }

  // Nettoyage des anciennes valeurs uniquement dans C3:D7
  shSource.getRange("C3:D7").clearContent();

  // Écriture ligne par ligne avec la valeur exacte du menu déroulant
  for (const resultat of resultats) {
    shSource
      .getRange(resultat.ligneDestination, 3)
      .setValue(resultat.valeurMenu);

    shSource
      .getRange(resultat.ligneDestination, 4)
      .setValue(resultat.montant);
  }

  ui.alert(
    "Import terminé",
    resultats.length +
      " ligne(s) restaurée(s) dans ImpressionRemiseBank, de C3 à D" +
      (2 + resultats.length) +
      ".",
    ui.ButtonSet.OK
  );
}


/**
 * Récupère toutes les valeurs autorisées
 * par le menu déroulant d'une cellule.
 *
 * Fonctionne avec :
 * - un menu provenant d'une plage ;
 * - un menu contenant une liste saisie directement.
 */
function recupererChoixMenuDeroulant_(cellule) {
  const regle = cellule.getDataValidation();

  if (!regle) {
    return [];
  }

  const typeCritere = regle.getCriteriaType();
  const valeursCritere = regle.getCriteriaValues();

  // Menu déroulant provenant d'une plage
  if (
    typeCritere ===
    SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE
  ) {
    const plageSource = valeursCritere[0];

    return plageSource
      .getValues()
      .flat()
      .filter(valeur => valeur !== "" && valeur !== null);
  }

  // Menu déroulant avec valeurs saisies directement
  if (
    typeCritere ===
    SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST
  ) {
    return valeursCritere[0]
      .filter(valeur => valeur !== "" && valeur !== null);
  }

  return [];
}


/**
 * Recherche l'option exacte du menu contenant l'identifiant.
 *
 * Exemple :
 * identifiant recherché : BC-2026-123
 *
 * valeur du menu :
 * DUPONT | FACTURE | ... | BC-2026-123 | ...
 */
function rechercherValeurMenu_(choixAutorises, idRecherche) {
  const idNormalise = normaliserComparaison_(idRecherche);

  // Première recherche :
  // l'identifiant doit correspondre exactement à un segment séparé par |
  const correspondancesExactes = choixAutorises.filter(choix => {
    const segments = String(choix)
      .split("|")
      .map(segment => normaliserComparaison_(segment));

    return segments.includes(idNormalise);
  });

  if (correspondancesExactes.length > 0) {
    return correspondancesExactes;
  }

  /*
    Recherche de secours :
    l'identifiant est présent quelque part dans le texte.
  */
  return choixAutorises.filter(choix =>
    normaliserComparaison_(choix).includes(idNormalise)
  );
}


function normaliserComparaison_(valeur) {
  return String(valeur ?? "")
    .trim()
    .toUpperCase();
}
