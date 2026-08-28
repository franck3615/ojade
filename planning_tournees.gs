/**
 * Planification de tournée : calcule itinéraire, horaires et durées sur la
 * feuille PlanningFinale, puis marque en rouge/souligné les dates (colonne B)
 * pour lesquelles un rendez-vous existe déjà dans l'agenda Google dédié.
 *
 * Dépend de fonctions utilitaires définies ailleurs dans le projet Apps
 * Script (verifierBonneFeuille_, alertSafe_, getUiSafe_, toDateOnly_,
 * timeCellToMinutes_, buildDateTime_, hhmm_, minutesToHHMM_, setF_, appendF_,
 * toNumber_, parseDateFRorISO_, directionsLeg_, trierSelonColonneK_NumeriquePur_,
 * verifierChronologieInitiale, ajusterWeekendAvecQuestions_,
 * verifierContactsEvolizDansPlanning) — non incluses dans ce fichier.
 */
function phase1_Planning() {
  if (!verifierBonneFeuille_()) return;
  const ss = SpreadsheetApp.getActive();
  const ui = getUiSafe_();
  const SHEET = "PlanningFinale";
  const START_ROW = 2;

  const COL_DATE = 2;
  const COL_HEURE = 3;
  const COL_CLIENT = 4;
  const COL_ALERTES = 6;
  const COL_DUREE_G = 7;
  const COL_ADR = 8;
  const COL_J = 10;
  const COL_L = 12;
  const COL_M = 13;
  const COL_O = 15;
  const COL_P = 16;
  const COL_LOCK = 21;
  const COL_V = 22;

  const DEPOT_CELL = "B5"; // cellule de Paramètres contenant l'adresse du dépôt

  const sh = ss.getSheetByName(SHEET);
  if (!sh) { alertSafe_(ui, ss, "Erreur", "La feuille " + SHEET + " n'existe pas."); return false; }

  const shP = ss.getSheetByName("Paramètres");
  if (!shP) { alertSafe_(ui, ss, "Erreur", "La feuille Paramètres n'existe pas."); return false; }

  const props = PropertiesService.getScriptProperties();
  let RET_DEPOT_MIN = 180;

  if (ui) {
    const rep = ui.prompt("Seuil retour depot", "Minutes :", ui.ButtonSet.OK_CANCEL);
    if (rep.getSelectedButton() === ui.Button.OK) {
      const parsed = parseInt(rep.getResponseText());
      if (!isNaN(parsed)) { RET_DEPOT_MIN = parsed; props.setProperty("RET_DEPOT_MIN", String(RET_DEPOT_MIN)); }
    } else { return false; }
  }

const cellB2 = sh.getRange(2, COL_DATE);
const cellC2 = sh.getRange(2, COL_HEURE);

let b2Ok = toDateOnly_(cellB2.getValue());
let c2Min = timeCellToMinutes_(cellC2.getValue());

// ============================================================
// DATE DE DÉBUT DE TOURNÉE
// ============================================================

if (!b2Ok) {

  if (!ui) {
    throw new Error("Date de début de tournée absente en B2.");
  }

  const repDate = ui.prompt(
    "Début de tournée",
    "Saisir la date de début de tournée (JJ/MM/AAAA) :",
    ui.ButtonSet.OK_CANCEL
  );

  if (repDate.getSelectedButton() !== ui.Button.OK) {
    return false;
  }

  const parsedDate =
    parseDateFRorISO_(repDate.getResponseText().trim());

  if (!parsedDate) {

    ui.alert(
      "Date invalide",
      "La date doit être saisie au format JJ/MM/AAAA.\n\nExemple : 15/09/2026",
      ui.ButtonSet.OK
    );

    return false;
  }

  cellB2.setValue(parsedDate);
  cellB2.setNumberFormat("dd/MM/yyyy");

  b2Ok = parsedDate;
}


// ============================================================
// HEURE DE DÉBUT DE TOURNÉE
// ============================================================

if (c2Min === null) {

  if (!ui) {
    throw new Error("Heure de début de tournée absente en C2.");
  }

  const repHeure = ui.prompt(
    "Début de tournée",
    "Saisir l'heure de début de tournée (HH:MM) :",
    ui.ButtonSet.OK_CANCEL
  );

  if (repHeure.getSelectedButton() !== ui.Button.OK) {
    return false;
  }

  const minutes =
    timeCellToMinutes_(repHeure.getResponseText().trim());

  if (minutes === null) {

    ui.alert(
      "Heure invalide",
      "L'heure doit être saisie au format HH:MM.\n\nExemple : 09:00",
      ui.ButtonSet.OK
    );

    return false;
  }

  cellC2.setValue(minutes / 1440);
  cellC2.setNumberFormat("[h]:mm");

  c2Min = minutes;
}

SpreadsheetApp.flush();
  if (!verifierChronologieInitiale(sh, START_ROW, COL_DATE, COL_HEURE, ui)) return false;

  const API_KEY = "AIzaSyCKIbFspk4V3avCeA1ct1ZtAAwopKGzDaw";
  const LIMIT_MIN = 17 * 60 + 30;
  const RESET_MIN = 9 * 60;

  trierSelonColonneK_NumeriquePur_(sh, ui);

  const depotAddress = String(sh.getRange(2, COL_ADR).getValue() || "").trim();
  if (!depotAddress) { alertSafe_(ui, ss, "Erreur", "Adresse depot vide en H2."); return false; }

  const lastRow = sh.getLastRow();
  if (lastRow < START_ROW) { alertSafe_(ui, ss, "Erreur", "Pas assez de lignes."); return false; }

  const Hcol = sh.getRange(START_ROW, COL_ADR, lastRow - START_ROW + 1, 1).getValues();
  let endRow = START_ROW - 1;
  for (let i = 0; i < Hcol.length; i++) {
    if (!String(Hcol[i][0] || "").trim()) break;
    endRow = START_ROW + i;
  }

  const nRows = endRow - START_ROW + 1;
  sh.getRange(START_ROW, COL_ALERTES, nRows, 1).clearContent();
  sh.getRange(START_ROW, COL_ALERTES, nRows, 1).setFontColor("#000000");

  const colD = sh.getRange(START_ROW, COL_CLIENT, nRows, 1).getValues();
  const colH = sh.getRange(START_ROW, COL_ADR, nRows, 1).getValues();
  const colLock = sh.getRange(START_ROW, COL_LOCK, nRows, 1).getValues();

  // REMPLISSAGE COLONNE G + couleurs
  const lastRowP = shP.getLastRow();
  const paramData = shP.getRange(1, 4, lastRowP, 4).getValues();
  const mapColor = {};
  const mapG = {};
  for (let i = 0; i < paramData.length; i++) {
    const nom = String(paramData[i][0] || "").trim();
    if (nom) { mapColor[nom] = paramData[i][1]; mapG[nom] = paramData[i][3]; }
  }

  const outG = [];
  const outColor = [];
  for (let i = 0; i < nRows; i++) {
    const nom = String(colD[i][0] || "").trim();
    if (!nom) { outG.push([""]); outColor.push(["#ffffff"]); continue; }
    if (mapG[nom] === undefined) {
      const ligne = START_ROW + i;
      alertSafe_(ui, ss, "🚨 CLIENT ABSENT DE PARAMÈTRES",
        "Ligne " + ligne + " : le client \"" + nom + "\" n'existe pas dans la feuille Paramètres.\n\n" +
        "Ajoutez-le dans Paramètres (colonne D = nom, colonne G = minutes de maintenance), puis relancez.");
      sh.getRange(ligne, COL_ALERTES).setValue("❌ CLIENT \"" + nom + "\" ABSENT DE PARAMÈTRES");
      sh.getRange(ligne, COL_ALERTES).setFontColor("#ff0000");
      return false;
    }
    outG.push([mapG[nom]]);
    outColor.push([mapColor[nom] || "#ffffff"]);
  }

  sh.getRange(START_ROW, COL_DUREE_G, nRows, 1).setValues(outG);
  sh.getRange(START_ROW, COL_CLIENT, nRows, 1).setBackgrounds(outColor);

  // ITINÉRAIRES (Google Maps)
  const addrList = [];
  const rowList = [];
  for (let i = 0; i < colH.length; i++) {
    const adr = String(colH[i][0] || "").trim();
    if (!adr) break;
    addrList.push(adr);
    rowList.push(START_ROW + i);
  }

  if (addrList.length < 2) { alertSafe_(ui, ss, "Erreur", "Il faut au moins 2 adresses."); return false; }

  sh.getRange(START_ROW, COL_J, addrList.length, 1).clearContent();
  sh.getRange(START_ROW, COL_L, addrList.length, 1).clearContent();
  sh.getRange(START_ROW, COL_M, addrList.length, 1).clearContent();
  sh.getRange(START_ROW, COL_O, addrList.length, 1).clearContent();
  sh.getRange(START_ROW, COL_P, addrList.length, 1).clearContent();
  sh.getRange(START_ROW, COL_V, addrList.length, 1).clearContent();

  const origin = addrList[0];
  const destination = addrList[addrList.length - 1];
  const mid = addrList.slice(1, addrList.length - 1);
  const waypointsParam = mid.length ? "&waypoints=" + encodeURIComponent(mid.join("|")) : "";
  const url = "https://maps.googleapis.com/maps/api/directions/json?origin=" + encodeURIComponent(origin) +
              "&destination=" + encodeURIComponent(destination) + waypointsParam +
              "&key=" + encodeURIComponent(API_KEY);

  const reponse = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const json = JSON.parse(reponse.getContentText());
  if (json.status !== "OK") { alertSafe_(ui, ss, "Erreur Google Maps", json.status); return false; }

  const legs = json.routes && json.routes[0] && json.routes[0].legs;
  if (!legs || legs.length !== addrList.length - 1) { alertSafe_(ui, ss, "Erreur", "Reponse Google inattendue."); return false; }

  const lienGlobal = "https://www.google.com/maps/dir/" + addrList.map(a => encodeURIComponent(a)).join("/");
  for (let i = 0; i < addrList.length; i++) {
    sh.getRange(rowList[i], COL_P).setFormula('=HYPERLINK("' + lienGlobal + '";"Voir itineraire global")');
    if (i < addrList.length - 1) {
      const lienEtape = "https://www.google.com/maps/dir/" + encodeURIComponent(addrList[i]) + "/" + encodeURIComponent(addrList[i + 1]);
      sh.getRange(rowList[i], COL_O).setFormula('=HYPERLINK("' + lienEtape + '";"Voir etape")');
    }
  }

  const Jminutes = new Array(addrList.length).fill(0);
  for (let i = 0; i < legs.length; i++) {
    const row = rowList[i];
    const distKm = Math.round((((legs[i].distance && legs[i].distance.value) || 0) / 1000) * 10) / 10;
    const trajetMin = Math.round((((legs[i].duration && legs[i].duration.value) || 0) / 60) * 1.25);
    sh.getRange(row, COL_L).setValue(distKm);
    const cellM = sh.getRange(row, COL_M);
    cellM.setValue(trajetMin / 1440);
    cellM.setNumberFormat("[h]:mm");
    const gMin = toNumber_(outG[i][0]);
    const totalMin = gMin + trajetMin;
    Jminutes[i] = totalMin;
    const cellJ = sh.getRange(row, COL_J);
    cellJ.setValue(totalMin / 1440);
    cellJ.setNumberFormat("[h]:mm");
  }

  // TRAJETS DÉPÔT : aller (dépôt -> 1er RV) + retour (dernier RV -> dépôt)
  const adrDepot = String(shP.getRange(DEPOT_CELL).getValue() || "").trim();
  let extraKm = 0;
  let extraMin = 0;
  if (adrDepot) {
    const aller  = directionsLeg_(API_KEY, adrDepot, addrList[0]);
    const retour = directionsLeg_(API_KEY, addrList[addrList.length - 1], adrDepot);
    if (aller)  { extraKm += aller.km;  extraMin += aller.min; }
    if (retour) { extraKm += retour.km; extraMin += retour.min; }
  } else {
    alertSafe_(ui, ss, "Info dépôt", "Adresse du dépôt vide dans Paramètres!" + DEPOT_CELL +
      ".\nLes trajets dépôt (aller/retour) ne seront pas comptés tant que la cellule est vide.");
  }
  props.setProperty("EXTRA_KM",  String(extraKm));
  props.setProperty("EXTRA_MIN", String(extraMin));

  // HORAIRES (avec gestion des LOCK)
  const actualStart = new Array(addrList.length);

  function lockModeAtIndex_(i) {
    const v = String((colLock[i] && colLock[i][0]) || "").trim().toUpperCase();
    if (v === "LOCK" || v === "X" || v === "OK" || v === "1" || v === "🔒") return "LOCK";
    if (v === "LOCK_DATE") return "LOCK_DATE";
    return "NONE";
  }

  {
    const i = 0;
    const row = rowList[i];
    const mode = lockModeAtIndex_(i);
    let baseDate = toDateOnly_(sh.getRange(row, COL_DATE).getValue()) || today;
    let baseMin = timeCellToMinutes_(sh.getRange(row, COL_HEURE).getValue());
    if (baseMin === null || mode !== "LOCK") {
      baseMin = RESET_MIN;
      const cell = sh.getRange(row, COL_HEURE);
      cell.setValue(RESET_MIN / 1440);
      cell.setNumberFormat("[h]:mm");
    }
    if ((mode === "LOCK" || mode === "LOCK_DATE") && !toDateOnly_(sh.getRange(row, COL_DATE).getValue())) {
      sh.getRange(row, COL_DATE).setValue(baseDate);
    }
    actualStart[i] = buildDateTime_(baseDate, baseMin);
    setF_(sh, row, "Tournée Début à " + hhmm_(actualStart[i]));
  }

  for (let i = 1; i < addrList.length; i++) {
    const row = rowList[i];
    const mode = lockModeAtIndex_(i);
    const trajetMin = Math.round(((legs[i - 1].duration && legs[i - 1].duration.value) || 0) / 60);
    const prevReco = new Date(actualStart[i - 1].getTime() + Jminutes[i - 1] * 60000);
    const prevMin = prevReco.getHours() * 60 + prevReco.getMinutes();

    if (mode === "LOCK") {
      const bOk = toDateOnly_(sh.getRange(row, COL_DATE).getValue());
      const cMin = timeCellToMinutes_(sh.getRange(row, COL_HEURE).getValue());
      if (bOk && cMin !== null) {
        actualStart[i] = buildDateTime_(bOk, cMin);
       appendF_(sh, row, "Rv " + hhmm_(actualStart[i]) + " (🔒) — réel calculé : " + hhmm_(prevReco));
        continue;
      }
    }

    if (mode === "LOCK_DATE") {
      const bOk = toDateOnly_(sh.getRange(row, COL_DATE).getValue());
      if (bOk) {
        const prevDate = toDateOnly_(prevReco);
        if (bOk.getTime() > prevDate.getTime()) {
          actualStart[i] = buildDateTime_(bOk, RESET_MIN);
          sh.getRange(row, COL_HEURE).setValue(RESET_MIN / 1440);
          sh.getRange(row, COL_HEURE).setNumberFormat("[h]:mm");
          appendF_(sh, row, "Rv " + hhmm_(actualStart[i]) + " (📅)");
        } else if (bOk.getTime() === prevDate.getTime()) {
          actualStart[i] = buildDateTime_(bOk, prevMin);
          sh.getRange(row, COL_HEURE).setValue(prevMin / 1440);
          sh.getRange(row, COL_HEURE).setNumberFormat("[h]:mm");
          appendF_(sh, row, "Rv " + hhmm_(actualStart[i]) + " (📅)");
        } else {
          const newDate = new Date(prevReco);
          newDate.setDate(newDate.getDate() + 1);
          sh.getRange(row, COL_DATE).setValue(newDate);
          sh.getRange(row, COL_HEURE).setValue(RESET_MIN / 1440);
          sh.getRange(row, COL_HEURE).setNumberFormat("[h]:mm");
          actualStart[i] = buildDateTime_(newDate, RESET_MIN);
          appendF_(sh, row, "Rv " + hhmm_(actualStart[i]) + " (📅)");
        }
        continue;
      }
    }

    if (prevMin > LIMIT_MIN) {
      const newDate = new Date(actualStart[i - 1]);
      newDate.setDate(newDate.getDate() + 1);
      const adjusted = ajusterWeekendAvecQuestions_(ui, newDate);
      sh.getRange(row, COL_DATE).setValue(adjusted);
      sh.getRange(row, COL_HEURE).setValue(RESET_MIN / 1440);
      sh.getRange(row, COL_HEURE).setNumberFormat("[h]:mm");
      actualStart[i] = buildDateTime_(adjusted, RESET_MIN);
      appendF_(sh, row, "J+1 | Arrivée " + hhmm_(actualStart[i]) + " (réel sans règle : " + minutesToHHMM_(prevMin) + ")");
    } else {
      const currentDate = toDateOnly_(sh.getRange(row, COL_DATE).getValue());
      const baseDate = currentDate || toDateOnly_(prevReco);
      const baseMin = prevMin;
      if (!currentDate) sh.getRange(row, COL_DATE).setValue(baseDate);
      const cellHeure = sh.getRange(row, COL_HEURE);
      cellHeure.setValue(baseMin / 1440);
      cellHeure.setNumberFormat("[h]:mm");
      actualStart[i] = buildDateTime_(baseDate, baseMin);
      appendF_(sh, row, "Arrivée estimée à " + hhmm_(actualStart[i]) + " (Route: " + trajetMin + " min)");
    }
  }
  verifierContactsEvolizDansPlanning();

  marquerDatesAvecRdvCalendrier_(sh, ss, ui, START_ROW, endRow, COL_DATE);

  SpreadsheetApp.flush();
  return true;
}


/**
 * Souligne en rouge la cellule de date (colonne B) de chaque ligne dont la
 * date correspond à une journée où l'agenda Google contient déjà au moins
 * un événement. Les autres cellules retrouvent une mise en forme normale.
 */
function marquerDatesAvecRdvCalendrier_(sh, ss, ui, startRow, endRow, colDate) {
  const CALENDAR_ID = "c_868360d47ecc6aca018d78b3d339ac81f9292e9c62f7aab3fc34469ada9432ae@group.calendar.google.com";

  if (endRow < startRow) return;

  const cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) {
    alertSafe_(ui, ss, "Erreur agenda", "Agenda introuvable ou inaccessible : " + CALENDAR_ID);
    return;
  }

  const nRows = endRow - startRow + 1;
  const dateRange = sh.getRange(startRow, colDate, nRows, 1);
  const dates = dateRange.getValues();
  const tz = Session.getScriptTimeZone();

  const rdvParJour = {}; // cache : "yyyy-MM-dd" -> booléen, pour éviter d'interroger deux fois la même date
  const joursOccupes = []; // dates uniques où l'agenda contient déjà un rendez-vous

  for (let i = 0; i < nRows; i++) {
    const row = startRow + i;
    const cell = sh.getRange(row, colDate);
    const d = toDateOnly_(dates[i][0]);

    if (!d) { cell.setFontLine("none"); continue; }

    const cle = Utilities.formatDate(d, tz, "yyyy-MM-dd");
    if (!(cle in rdvParJour)) {
      const debutJour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const finJour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      rdvParJour[cle] = cal.getEvents(debutJour, finJour).length > 0;
      if (rdvParJour[cle]) joursOccupes.push(d);
    }

    if (rdvParJour[cle]) {
      cell.setFontColor("#ff0000").setFontLine("underline");
    } else {
      cell.setFontLine("none");
    }
  }

  if (joursOccupes.length > 0) {
    alertSafe_(ui, ss, "⚠️ Agenda déjà chargé", construireMessagePeriodesOccupees_(joursOccupes, tz));
  }
}


/**
 * Regroupe une liste de dates (uniques ou non) en périodes consécutives et
 * renvoie un message listant chaque jour ou plage de jours occupée dans
 * l'agenda, pour affichage à l'opérateur.
 */
function construireMessagePeriodesOccupees_(jours, tz) {
  const tries = jours.slice().sort((a, b) => a.getTime() - b.getTime());
  const periodes = [];
  let debut = tries[0];
  let fin = tries[0];

  for (let i = 1; i < tries.length; i++) {
    const veille = new Date(fin);
    veille.setDate(veille.getDate() + 1);
    if (tries[i].getTime() === veille.getTime()) {
      fin = tries[i];
    } else {
      periodes.push([debut, fin]);
      debut = tries[i];
      fin = tries[i];
    }
  }
  periodes.push([debut, fin]);

  const fmt = d => Utilities.formatDate(d, tz, "dd/MM/yyyy");
  const lignes = periodes.map(([d1, d2]) =>
    d1.getTime() === d2.getTime() ? "- " + fmt(d1) : "- du " + fmt(d1) + " au " + fmt(d2)
  );

  return "L'agenda contient déjà des rendez-vous aux dates suivantes :\n\n" + lignes.join("\n");
}
