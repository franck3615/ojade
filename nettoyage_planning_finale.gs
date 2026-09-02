/*******************************************************
 * NETTOYAGE AUTOMATIQUE DE PlanningFinale
 *
 * Cherche la DERNIÈRE ligne vide en colonne D, puis efface
 * tout le contenu des colonnes A à V à partir de cette ligne
 * jusqu'à la fin de la feuille.
 *
 * But : enlever les résidus (bloc récapitulatif financier,
 * anciennes données laissées par une exécution précédente...)
 * qui traînent sous la vraie liste de clients, et que
 * optimiserTournee() pourrait sinon prendre pour des lignes
 * clients (colonne H = adresse envoyée à Google Maps).
 *******************************************************/
function nettoyerResidusPlanningFinale_() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("PlanningFinale");

  if (!sh) return;

  const START_ROW = 2;
  const COL_D = 4;
  const COL_A = 1;
  const COL_V = 22;

  const lastRow = sh.getLastRow();

  if (lastRow < START_ROW) return;

  const colD =
    sh.getRange(
      START_ROW,
      COL_D,
      lastRow - START_ROW + 1,
      1
    ).getValues();

  // Chercher la DERNIÈRE ligne vide en colonne D
  // (on part du bas de la feuille ; la première case vide
  // rencontrée en remontant est la dernière ligne vide)
  let ligneVide = -1;

  for (let i = colD.length - 1; i >= 0; i--) {
    if (String(colD[i][0] || "").trim() === "") {
      ligneVide = START_ROW + i;
      break;
    }
  }

  // Aucune ligne vide trouvée en colonne D : rien à nettoyer
  if (ligneVide === -1) return;

  const nbLignes = lastRow - ligneVide + 1;

  sh.getRange(
    ligneVide,
    COL_A,
    nbLignes,
    COL_V - COL_A + 1
  ).clearContent();

  SpreadsheetApp.flush();
}


/*******************************************************
 * POINT DE DÉPART UNIQUE
 *
 * Demande à l'opérateur ce qu'il veut lancer, puis exécute :
 *   OUI      → Optimiser la tournée   (Phase A : optimiserTournee)
 *   NON      → Recalculer le planning (Phase B : lancerTout)
 *   ANNULER  → ne rien faire
 *******************************************************/
function demarrer() {
  const ui = SpreadsheetApp.getUi();

  // Nettoyage automatique des résidus, AVANT toute autre chose
  nettoyerResidusPlanningFinale_();

  const choix = ui.alert(
    "Que veux-tu lancer ?",
    "OUI       →  Optimiser la tournée (Phase A)\n" +
    "NON       →  Recalculer le planning (Phase B)\n" +
    "ANNULER   →  Ne rien faire",
    ui.ButtonSet.YES_NO_CANCEL
  );

  if (choix === ui.Button.YES) {
    optimiserTournee();      // Phase A
  } else if (choix === ui.Button.NO) {
    lancerTout();            // Phase B
  }
  // ANNULER (ou fenêtre fermée) : aucune action
}
