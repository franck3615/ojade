/**
 * Reprend le contenu de ImpressionRemiseBank (B2, D9, C3:D7) et
 * l'ajoute à SituationRemiseFacture, avec anti-doublon (clé =
 * colonne E + date colonne I), met à jour la colonne M des feuilles
 * Regrouper / Regrouper_sansFacture, puis écrit un rapport en B3.
 *
 * Ne montre aucune UI elle-même : lève une Error en cas de problème.
 * Utilisée à la fois par TRAITEMENT_IMPORT_SITUATION_REMISE_FINAL
 * (déclenchée depuis le menu de la feuille) et par
 * traiterRemiseDepuisScan (déclenchée depuis la page de scan de
 * chèque, scanner_cheque.gs) une fois que l'opérateur confirme.
 */
function executerTraitementRemise_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const shSource = ss.getSheetByName("ImpressionRemiseBank");
  const shSitu = ss.getSheetByName("SituationRemiseFacture");

  if (!shSource || !shSitu) {
    throw new Error("Vérifie les feuilles ImpressionRemiseBank et SituationRemiseFacture.");
  }

  const tz = Session.getScriptTimeZone();

  // ============================================================
  // 1. INFORMATIONS GÉNÉRALES DE LA REMISE
  // ============================================================

  const valB2Raw = shSource.getRange("B2").getValue();

  if (!valB2Raw) {
    throw new Error("La date de remise en B2 est vide.");
  }

  const valB2Formatee = valB2Raw instanceof Date
    ? Utilities.formatDate(valB2Raw, tz, "dd/MM/yyyy")
    : String(valB2Raw).trim();

  const montantD9 = shSource.getRange("D9").getValue();

  const blocM =
    "Rem Bank Le " +
    valB2Formatee +
    " | Montant " +
    String(montantD9 ?? "").trim();

  // ============================================================
  // 2. LECTURE DES LIGNES C3:D7
  // ============================================================

  const dataSource = shSource.getRange("C3:D7").getValues();

  // ============================================================
  // 3. CONSTRUCTION DE L'HISTORIQUE ANTI-DOUBLON
  //    Clé = colonne E + date colonne I
  // ============================================================

  const baseHistorique = new Set();
  const derniereLigneSitu = shSitu.getLastRow();

  if (derniereLigneSitu > 0) {
    const dataSitu = shSitu
      .getRange(1, 1, derniereLigneSitu, 10)
      .getValues();

    for (let r = 0; r < dataSitu.length; r++) {
      const idE = String(dataSitu[r][4] ?? "")
        .trim()
        .toUpperCase();

      const valeurDateI = dataSitu[r][8];

      const dateI = valeurDateI instanceof Date
        ? Utilities.formatDate(valeurDateI, tz, "dd/MM/yyyy")
        : String(valeurDateI ?? "").trim();

      if (idE !== "") {
        baseHistorique.add(idE + "_" + dateI);
      }
    }
  }

  // ============================================================
  // 4. PRÉPARATION DES LIGNES À AJOUTER
  // ============================================================

  const nouvellesLignesSituation = [];
  const idsATraiter = new Set();

  for (let i = 0; i < dataSource.length; i++) {
    const ligneC = String(dataSource[i][0] ?? "").trim();
    const valeurD = dataSource[i][1];

    if (
      ligneC === "" ||
      ligneC.toLowerCase() === "null"
    ) {
      continue;
    }

    const segments = ligneC
      .split("|")
      .map(segment => segment.trim());

    if (segments.length < 5) {
      continue;
    }

    const idUnique = String(segments[4] ?? "")
      .trim()
      .toUpperCase();

    if (idUnique === "") {
      continue;
    }

    idsATraiter.add(idUnique);

    const empreinte = idUnique + "_" + valB2Formatee;

    if (baseHistorique.has(empreinte)) {
      continue;
    }

    const nouvelleLigne = new Array(10).fill("");

    /*
      SituationRemiseFacture :

      A = segment 1
      B = segment 2
      C = segment 3
      D = segment 4
      E = segment 5 / identifiant
      F = segment 6
      G = colonne D de ImpressionRemiseBank
      H = segment 8
      I = date B2
      J = montant global D9
    */

    nouvelleLigne[0] = segments[0] ?? "";
    nouvelleLigne[1] = segments[1] ?? "";
    nouvelleLigne[2] = segments[2] ?? "";
    nouvelleLigne[3] = segments[3] ?? "";
    nouvelleLigne[4] = segments[4] ?? "";
    nouvelleLigne[5] = segments[5] ?? "";

    // Toujours alimentée, indépendamment du nombre de segments.
    nouvelleLigne[6] =
      valeurD === null ||
      valeurD === undefined ||
      valeurD === ""
        ? ""
        : valeurD;

    nouvelleLigne[7] = segments[7] ?? "";
    nouvelleLigne[8] = valB2Raw;
    nouvelleLigne[9] = montantD9;

    nouvellesLignesSituation.push(nouvelleLigne);
    baseHistorique.add(empreinte);
  }

  // ============================================================
  // 5. MISE À JOUR DE LA COLONNE M DES FEUILLES REGROUPER
  // ============================================================

  const feuillesRegroupement = [
    "Regrouper",
    "Regrouper_sansFacture"
  ];

  let compteurM = 0;

  for (const nomOnglet of feuillesRegroupement) {
    const shReg = ss.getSheetByName(nomOnglet);

    if (!shReg) {
      continue;
    }

    const lastRowReg = shReg.getLastRow();

    if (lastRowReg < 1) {
      continue;
    }

    const valeursA = shReg
      .getRange(1, 1, lastRowReg, 1)
      .getValues();

    const valeursM = shReg
      .getRange(1, 13, lastRowReg, 1)
      .getValues();

    let feuilleModifiee = false;

    for (let r = 0; r < lastRowReg; r++) {
      const idColonneA = String(valeursA[r][0] ?? "")
        .trim()
        .toUpperCase();

      if (!idsATraiter.has(idColonneA)) {
        continue;
      }

      const ancienneValeurM = String(valeursM[r][0] ?? "").trim();

      if (!ancienneValeurM.includes(blocM)) {
        valeursM[r][0] =
          ancienneValeurM === ""
            ? blocM
            : ancienneValeurM + " | " + blocM;

        compteurM++;
        feuilleModifiee = true;
      }
    }

    if (feuilleModifiee) {
      shReg
        .getRange(1, 13, lastRowReg, 1)
        .setValues(valeursM);
    }
  }

  // ============================================================
  // 6. AJOUT GROUPÉ DANS SituationRemiseFacture
  // ============================================================

  let compteurS = nouvellesLignesSituation.length;

  if (compteurS > 0) {
    const premiereLigneDestination = shSitu.getLastRow() + 1;

    shSitu
      .getRange(
        premiereLigneDestination,
        1,
        compteurS,
        10
      )
      .setValues(nouvellesLignesSituation);

    // G = montant individuel
    shSitu
      .getRange(premiereLigneDestination, 7, compteurS, 1)
      .setNumberFormat("0.00");

    // I = date de remise
    shSitu
      .getRange(premiereLigneDestination, 9, compteurS, 1)
      .setNumberFormat("dd/MM/yyyy");

    // J = montant global de la remise
    shSitu
      .getRange(premiereLigneDestination, 10, compteurS, 1)
      .setNumberFormat("0.00");
  }

  // ============================================================
  // 7. RAPPORT FINAL
  // ============================================================

  const horodatage = Utilities.formatDate(
    new Date(),
    tz,
    "dd/MM HH:mm"
  );

  shSource.getRange("B3").setValue(
    "✅ " +
    horodatage +
    " | Regr:" +
    compteurM +
    " | Situ:" +
    compteurS
  );

  return { compteurM: compteurM, compteurS: compteurS };
}

/** Version menu (feuille) : mêmes étapes, avec une alerte UI en cas d'erreur. */
function TRAITEMENT_IMPORT_SITUATION_REMISE_FINAL() {
  const ui = SpreadsheetApp.getUi();

  try {
    executerTraitementRemise_();
  } catch (erreur) {
    ui.alert(erreur.message);
  }
}
