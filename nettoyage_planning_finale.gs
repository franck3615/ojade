/*******************************************************
 * NETTOYAGE AUTOMATIQUE DE PlanningFinale (résidus)
 *
 * Cherche la DERNIÈRE ligne vide en colonne D (en partant du
 * bas), puis efface toutes les cellules non vides des colonnes
 * A à V à partir de cette ligne.
 *
 * PIÈGE ÉVITÉ : sh.getLastRow() peut renvoyer une ligne bien
 * plus basse que la vraie dernière donnée si des lignes du bas
 * ont juste du formatage résiduel (bordure, couleur de fond...)
 * sans aucun contenu. Chercher "la dernière ligne vide" sur
 * toute cette plage gonflée tombe alors sur une ligne déjà
 * vide, hors sujet, et rien n'est réellement nettoyé.
 * On borne donc d'abord la recherche à la vraie dernière ligne
 * qui contient réellement quelque chose (n'importe où de A à V).
 *******************************************************/
function nettoyerResidusPlanningFinale_() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("PlanningFinale");

  if (!sh) return;

  const START_ROW = 2;
  const COL_D = 4;
  const COL_A = 1;
  const COL_V = 22;

  const lastRowBrut = sh.getLastRow();

  if (lastRowBrut < START_ROW) return;

  const bloc =
    sh.getRange(
      START_ROW,
      COL_A,
      lastRowBrut - START_ROW + 1,
      COL_V - COL_A + 1
    ).getValues();

  // Vraie dernière ligne avec un contenu réel (n'importe où de A à V)
  let dernierRowAvecContenu = -1;

  for (let i = bloc.length - 1; i >= 0; i--) {
    const ligneNonVide = bloc[i].some(function(v) {
      return String(v || "").trim() !== "";
    });

    if (ligneNonVide) {
      dernierRowAvecContenu = START_ROW + i;
      break;
    }
  }

  // Aucun contenu du tout dans la feuille
  if (dernierRowAvecContenu === -1) return;

  // Chercher la DERNIÈRE ligne vide en colonne D, en partant du bas,
  // mais seulement jusqu'à la vraie dernière ligne avec du contenu
  const colD = bloc.map(function(ligne) { return ligne[COL_D - COL_A]; });

  let ligneVide = -1;

  for (let i = dernierRowAvecContenu - START_ROW; i >= 0; i--) {
    if (String(colD[i] || "").trim() === "") {
      ligneVide = START_ROW + i;
      break;
    }
  }

  if (ligneVide === -1) return;

  const nbLignes = dernierRowAvecContenu - ligneVide + 1;

  sh.getRange(
    ligneVide,
    COL_A,
    nbLignes,
    COL_V - COL_A + 1
  ).clearContent();

  SpreadsheetApp.flush();
}


/*******************************************************
 * VIDER LES ADRESSES CLIENTS QUI N'EN SONT MANIFESTEMENT PAS
 *
 * Une vraie adresse française contient presque toujours un
 * chiffre (numéro de rue, code postal). Si le texte en colonne H
 * n'en contient aucun ("hjhj", "test", "-", etc.), ce n'est pas
 * une adresse exploitable : on vide la cellule et on prévient,
 * plutôt que de laisser planter l'appel à Google Maps.
 *
 * Renvoie la liste des lignes vidées (pour affichage dans une
 * alerte), tableau vide si rien à signaler.
 *******************************************************/
function nettoyerAdressesInvalidesPlanningFinale_() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("PlanningFinale");

  if (!sh) return [];

  const START_ROW = 2;
  const COL_CODE = 5;   // E = code client
  const COL_ADR  = 8;   // H = adresse

  const lastRow = sh.getLastRow();
  if (lastRow < START_ROW) return [];

  const nbLignes = lastRow - START_ROW + 1;

  const codes =
    sh.getRange(START_ROW, COL_CODE, nbLignes, 1).getValues();

  const adresses =
    sh.getRange(START_ROW, COL_ADR, nbLignes, 1).getValues();

  const lignesVidees = [];

  for (let i = 0; i < adresses.length; i++) {

    const code = String(codes[i][0] || "").trim();
    const adr  = String(adresses[i][0] || "").trim();

    // Pas un client réel (pas de code) : on ne touche à rien,
    // c'est le rôle de nettoyerResidusPlanningFinale_()
    if (!code || !adr) continue;

    // Une adresse plausible contient au moins un chiffre
    // (numéro de rue et/ou code postal)
    const contientChiffre = /\d/.test(adr);

    if (!contientChiffre) {
      sh.getRange(START_ROW + i, COL_ADR).clearContent();
      lignesVidees.push(
        "Ligne " + (START_ROW + i) + " (" + code + ") : \"" + adr + "\""
      );
    }
  }

  if (lignesVidees.length) {
    SpreadsheetApp.flush();
  }

  return lignesVidees;
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

  // 1. Nettoyage des résidus (bloc récap en bas de feuille)
  nettoyerResidusPlanningFinale_();

  // 2. Vidage des adresses manifestement invalides (pas de chiffre)
  const lignesVidees = nettoyerAdressesInvalidesPlanningFinale_();

  if (lignesVidees.length) {
    ui.alert(
      "Adresses invalides vidées",
      "Ces lignes avaient une adresse sans aucun chiffre " +
      "(donc pas une vraie adresse) — elles ont été vidées " +
      "automatiquement :\n\n" +
      lignesVidees.join("\n") +
      "\n\nComplète-les avec une vraie adresse avant de relancer " +
      "l'optimisation, sinon ces clients ne seront pas inclus dans le calcul d'itinéraire.",
      ui.ButtonSet.OK
    );
  }

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
