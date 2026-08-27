/**
 * Menu de navigation rapide entre les onglets du classeur.
 *
 * Ajoute un menu « 📑 Aller à… » dans la barre de menus de Google Sheets,
 * listant chaque onglet du classeur : cliquer sur un item active
 * directement l'onglet correspondant.
 *
 * Contrainte de l'API Google Sheets : un item de menu doit pointer vers
 * une fonction du script connue à l'avance, il est impossible de générer
 * une fonction « à la volée » avec un paramètre. On déclare donc un
 * nombre fixe de fonctions génériques (accederOnglet_0, accederOnglet_1,
 * …) et on mémorise, à chaque ouverture du classeur, quel onglet
 * correspond à quelle position.
 */

const NOMBRE_MAX_ONGLETS_MENU_ = 30;
const CLE_PROPRIETE_ORDRE_ONGLETS_ = 'ORDRE_ONGLETS_MENU_ACCES_RAPIDE';

function onOpen() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const feuilles = classeur.getSheets();
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('📑 Aller à…');

  const nomsOnglets = feuilles.map(f => f.getName());
  PropertiesService.getDocumentProperties().setProperty(
    CLE_PROPRIETE_ORDRE_ONGLETS_,
    JSON.stringify(nomsOnglets)
  );

  const nombreItems = Math.min(nomsOnglets.length, NOMBRE_MAX_ONGLETS_MENU_);
  for (let i = 0; i < nombreItems; i++) {
    menu.addItem(nomsOnglets[i], 'accederOnglet_' + i);
  }

  if (nomsOnglets.length > NOMBRE_MAX_ONGLETS_MENU_) {
    menu.addSeparator();
    menu.addItem('Autre onglet…', 'accederOngletParSaisie_');
  }

  menu.addToUi();
}

/** Active l'onglet mémorisé à la position donnée. */
function accederOngletParIndex_(index) {
  const nomsOnglets = JSON.parse(
    PropertiesService.getDocumentProperties().getProperty(CLE_PROPRIETE_ORDRE_ONGLETS_) || '[]'
  );
  const nom = nomsOnglets[index];
  if (!nom) return;

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nom);
  if (feuille) {
    feuille.activate();
  }
}

/** Repli utilisé quand le classeur contient plus d'onglets que le menu n'en affiche. */
function accederOngletParSaisie_() {
  const ui = SpreadsheetApp.getUi();
  const reponse = ui.prompt(
    'Aller à un onglet',
    "Nom exact de l'onglet :",
    ui.ButtonSet.OK_CANCEL
  );

  if (reponse.getSelectedButton() !== ui.Button.OK) return;

  const nom = reponse.getResponseText().trim();
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nom);

  if (feuille) {
    feuille.activate();
  } else {
    ui.alert('Onglet introuvable : « ' + nom + ' ».');
  }
}

// Fonctions « wrapper » requises par l'API de menu (une par position d'onglet).
function accederOnglet_0() { accederOngletParIndex_(0); }
function accederOnglet_1() { accederOngletParIndex_(1); }
function accederOnglet_2() { accederOngletParIndex_(2); }
function accederOnglet_3() { accederOngletParIndex_(3); }
function accederOnglet_4() { accederOngletParIndex_(4); }
function accederOnglet_5() { accederOngletParIndex_(5); }
function accederOnglet_6() { accederOngletParIndex_(6); }
function accederOnglet_7() { accederOngletParIndex_(7); }
function accederOnglet_8() { accederOngletParIndex_(8); }
function accederOnglet_9() { accederOngletParIndex_(9); }
function accederOnglet_10() { accederOngletParIndex_(10); }
function accederOnglet_11() { accederOngletParIndex_(11); }
function accederOnglet_12() { accederOngletParIndex_(12); }
function accederOnglet_13() { accederOngletParIndex_(13); }
function accederOnglet_14() { accederOngletParIndex_(14); }
function accederOnglet_15() { accederOngletParIndex_(15); }
function accederOnglet_16() { accederOngletParIndex_(16); }
function accederOnglet_17() { accederOngletParIndex_(17); }
function accederOnglet_18() { accederOngletParIndex_(18); }
function accederOnglet_19() { accederOngletParIndex_(19); }
function accederOnglet_20() { accederOngletParIndex_(20); }
function accederOnglet_21() { accederOngletParIndex_(21); }
function accederOnglet_22() { accederOngletParIndex_(22); }
function accederOnglet_23() { accederOngletParIndex_(23); }
function accederOnglet_24() { accederOngletParIndex_(24); }
function accederOnglet_25() { accederOngletParIndex_(25); }
function accederOnglet_26() { accederOngletParIndex_(26); }
function accederOnglet_27() { accederOngletParIndex_(27); }
function accederOnglet_28() { accederOngletParIndex_(28); }
function accederOnglet_29() { accederOngletParIndex_(29); }
