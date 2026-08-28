// =========================================================================
// PHASE 1 : ORGANISATION DU PLANNING + REMPLISSAGE DE LA COLONNE G
// =========================================================================
function demarrer() {
  const ui = SpreadsheetApp.getUi();

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

// =========================================================================
// ORGANISATION GÉNÉRALE
//   phase1_Planning()  -> organise tout + remplit la colonne G depuis Paramètres
//   phase2_Calcul()    -> calcul financier uniquement (lit une G déjà propre)
//   lancerTout()       -> propose l'agenda puis lance phase1 + phase2 (LE SEUL BOUTON À UTILISER)
// =========================================================================
function lancerTout() {
  if (!verifierBonneFeuille_()) return;
  const ui = getUiSafe_();

  if (ui) {
    const rep = ui.alert(
      "Agenda",
      "Voulez-vous visualiser l'agenda avant de lancer la planification ?",
      ui.ButtonSet.YES_NO
    );
    if (rep === ui.Button.YES) {
      afficherAgendaAvantPlanification_();
      return;
    }
  }

  lancerTout_core();
}


function afficherAgendaAvantPlanification_() {
  const CALENDAR_ID = "c_868360d47ecc6aca018d78b3d339ac81f9292e9c62f7aab3fc34469ada9432ae@group.calendar.google.com";
  const tz = Session.getScriptTimeZone();

  const embedUrl = "https://calendar.google.com/calendar/embed?src=" +
    encodeURIComponent(CALENDAR_ID) +
    "&ctz=" + encodeURIComponent(tz) +
    "&mode=WEEK";

  const html = HtmlService.createHtmlOutput(
    '<div style="display:flex;flex-direction:column;height:600px;font-family:Arial,sans-serif;margin:0;">' +
      '<iframe src="' + embedUrl + '" style="flex:1;border:0;width:100%;"></iframe>' +
      '<div style="padding:8px;text-align:right;border-top:1px solid #ddd;">' +
        '<button id="btnContinuer" onclick="continuerPlanification()" style="padding:8px 16px;font-size:14px;cursor:pointer;">' +
          'Continuer la planification' +
        '</button>' +
      '</div>' +
    '</div>' +
    '<script>' +
      'function continuerPlanification() {' +
        'document.getElementById("btnContinuer").disabled = true;' +
        'google.script.run' +
          '.withSuccessHandler(function() { google.script.host.close(); })' +
          '.withFailureHandler(function(err) { alert("Erreur : " + err.message); document.getElementById("btnContinuer").disabled = false; })' +
          '.lancerTout_core();' +
      '}' +
    '</script>'
  )
    .setWidth(900)
    .setHeight(650);

  SpreadsheetApp.getUi().showModalDialog(html, "Agenda — consultez les disponibilités puis continuez");
}


function lancerTout_core() {
  const ok = phase1_Planning();
  if (!ok) return;
  phase2_Calcul();
   signalerIncoherencesPlanning();
}

// =========================================================================
// PHASE 1 : ORGANISATION DU PLANNING + REMPLISSAGE DE LA COLONNE G
// =========================================================================
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

// Utilitaire : distance (km) et temps (min, x1.25) d'un trajet A->B
function directionsLeg_(apiKey, origin, destination) {
  if (!origin || !destination) return null;
  const url = "https://maps.googleapis.com/maps/api/directions/json?origin=" +
              encodeURIComponent(origin) + "&destination=" + encodeURIComponent(destination) +
              "&key=" + encodeURIComponent(apiKey);
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const json = JSON.parse(resp.getContentText());
  if (json.status !== "OK") return null;
  const leg = json.routes && json.routes[0] && json.routes[0].legs && json.routes[0].legs[0];
  if (!leg) return null;
  const distVal = (leg.distance && leg.distance.value) || 0;
  const durVal  = (leg.duration && leg.duration.value) || 0;
  return { km: Math.round((distVal / 1000) * 10) / 10, min: Math.round((durVal / 60) * 1.25) };
}

// =========================================================================
// PHASE 2 : CALCUL FINANCIER UNIQUEMENT
// =========================================================================
function phase2_Calcul() {
  const ss  = SpreadsheetApp.getActive();
  const sh  = ss.getSheetByName("PlanningFinale");
  const shP = ss.getSheetByName("Paramètres");
  if (!sh || !shP) throw new Error("Feuille introuvable");

  const COL_V = 22;
  const COL_CALCUL = 21;
  const COL_DUREE_G = 7;
  const COL_M = 13;
  const COL_DATE = 2;
  const START_ROW = 2;
  const COL_L = 12;

  const CONSO_L_100   = 6.5;
  const PRIX_LITRE    = 1.75;
  const COUT_PEAGE_KM = 0.09;

  const fullRows = sh.getLastRow();
  const colDates = sh.getRange(START_ROW, COL_DATE, fullRows - START_ROW + 1, 1).getValues();
  let realEndRow = START_ROW - 1;
  for (let i = 0; i < colDates.length; i++) { if (colDates[i][0]) realEndRow = START_ROW + i; }
  if (realEndRow < START_ROW) throw new Error("Aucune donnée détectée");
  const nbRows = realEndRow - START_ROW + 1;

  const params = shP.getRange("B1:B4").getValues();
  let   prixHeure        = toNumber_(params[0][0]); // sera recalculé automatiquement (marge / heures)
  const forfaitNuitUnit  = toNumber_(params[1][0]);
  const forfaitRepasUnit = toNumber_(params[2][0]);
  const multiplicateur   = toNumber_(params[3][0]);

  const colG    = sh.getRange(START_ROW, COL_DUREE_G, nbRows, 1).getValues();
  const colM    = sh.getRange(START_ROW, COL_M,       nbRows, 1).getValues();
  const colDate = sh.getRange(START_ROW, COL_DATE,    nbRows, 1).getValues();
  const colL    = sh.getRange(START_ROW, COL_L,       nbRows, 1).getValues();

  let totalMaintenanceMinutes = 0;
  let totalTempsTrajetMinutes = 0;
  for (let i = 0; i < nbRows; i++) {
    totalMaintenanceMinutes += toNumber_(colG[i][0]);
    const mTrajet = timeCellToMinutes_(colM[i][0]);
    if (mTrajet !== null) totalTempsTrajetMinutes += mTrajet;
  }

  let totalKm = 0;
  for (let i = 0; i < nbRows; i++) {
    const v = parseFloat(colL[i][0]);
    if (!isNaN(v)) totalKm += v;
  }

  // Ajout des trajets dépôt (aller + retour) calculés en phase 1
  const props = PropertiesService.getScriptProperties();
  const extraKm  = parseFloat(props.getProperty("EXTRA_KM"))  || 0;
  const extraMin = parseFloat(props.getProperty("EXTRA_MIN")) || 0;
  totalKm                 += extraKm;
  totalTempsTrajetMinutes += extraMin;

  const litres       = totalKm * CONSO_L_100 / 100;
  const fraisEssence = litres * PRIX_LITRE;
  const fraisPeage   = totalKm * COUT_PEAGE_KM;

  const joursUniques = {};
  for (let i = 0; i < nbRows; i++) {
    const d = toDateOnly_(colDate[i][0]);
    if (d) joursUniques[d.getTime()] = true;
  }
  const nbJoursDifferents = Object.keys(joursUniques).length;
  const nbNuits = Math.max(0, nbJoursDifferents - 1);
  const nbRepas = nbNuits;

  const totalHeures       = (totalTempsTrajetMinutes + totalMaintenanceMinutes) / 60;
  const heuresMaintenance = totalMaintenanceMinutes / 60;
  const totalNuits  = nbNuits * forfaitNuitUnit;
  const totalRepas  = nbRepas * forfaitRepasUnit;

  // ===== B1 AUTOMATIQUE : taux horaire = marge cible / heures =====
  const margeCible = sommeMargesParametres_(shP);
  if (margeCible > 0 && totalHeures > 0) {
    prixHeure = margeCible / totalHeures;
    shP.getRange("B1").setValue(prixHeure).setNumberFormat("0.00");
  }

  const montantBase  = (totalHeures * prixHeure);
  const montantMulti = (totalHeures * prixHeure) * multiplicateur;
  const grandTotal   = montantMulti + totalNuits + totalRepas;
  const grandTotalAvecFrais = grandTotal + fraisEssence + fraisPeage;
  const plusValue = montantBase - grandTotalAvecFrais;

  const tauxHoraire  = totalHeures       > 0 ? montantMulti / totalHeures       : 0;
  const tauxHoraireG = heuresMaintenance > 0 ? montantMulti / heuresMaintenance : 0;

  const gainParJour = nbNuits > 0 ? montantMulti / nbNuits : montantMulti;

  const l = realEndRow + 1;

  const labels = [
    ["TOTAL AVEC COEFFICIENT :"],
    ["TOTAL NUITS (" + nbNuits + ") :"],
    ["TOTAL REPAS (" + nbRepas + ") :"],
    ["GRAND TOTAL :"],
    ["TAUX HORAIRE (total) :"],
    ["TAUX HORAIRE (heures G) :"],
    ["FRAIS CARBURANT (" + totalKm.toFixed(0) + " km) :"],
    ["FRAIS PÉAGE (estimé) :"],
    ["GRAND TOTAL + FRAIS :"]
  ];
  sh.getRange(l, COL_CALCUL, labels.length, 1).setValues(labels).setFontWeight("bold");

  const values = [
    [montantMulti],[totalNuits],[totalRepas],[grandTotal],
    [tauxHoraire],[tauxHoraireG],[fraisEssence],[fraisPeage],[grandTotalAvecFrais]
  ];
  sh.getRange(l, COL_V, values.length, 1).setValues(values).setFontWeight("bold").setNumberFormat("#,##0.00 €");

  const labelsParam = [
    ["TOTAL DE BASE (" + prixHeure.toFixed(2) + "€/h) :"],
    ["PLUS-VALUE :"]
  ];
  const valuesParam = [
    [montantBase],
    [plusValue]
  ];
  shP.getRange(8, 1, labelsParam.length, 1).setValues(labelsParam).setFontWeight("bold");
  shP.getRange(8, 2, valuesParam.length, 1).setValues(valuesParam).setFontWeight("bold").setNumberFormat("#,##0.00 €");

  sh.getRange(l, COL_M).setValue(totalTempsTrajetMinutes / 1440).setNumberFormat("[h]:mm");
  sh.getRange(l, COL_DUREE_G).setValue(totalMaintenanceMinutes / 1440).setNumberFormat("[h]:mm");

  sh.getRange(l, 23).setValue(gainParJour).setFontWeight("bold").setNumberFormat("#,##0.00 €");

  SpreadsheetApp.flush();

  // ===== ARCHIVAGE (à la fin) =====
  const uiArch = getUiSafe_();
  if (uiArch) {
    const rep = uiArch.alert("Archiver le tableau ?",
      "Copier le tableau (A2 → colonne U) dans la zone d'archive (à partir de la colonne X) ?",
      uiArch.ButtonSet.YES_NO);
    if (rep === uiArch.Button.YES) {
      const maxR = sh.getMaxRows();
      const bVals = sh.getRange(2, 2, maxR - 1, 1).getValues();
      let lastB = 1;
      for (let i = 0; i < bVals.length; i++) {
        if (bVals[i][0] !== "" && bVals[i][0] !== null) lastB = i + 2;
      }
      if (lastB >= 2) {
        const src = sh.getRange(2, 1, lastB - 1, 21); // A2:U{lastB}
        const xVals = sh.getRange(1, 24, maxR, 1).getValues();
        let lastX = 0;
        for (let i = 0; i < xVals.length; i++) {
          if (String(xVals[i][0] || "").trim() !== "") lastX = i + 1;
        }
        const destRow = (lastX === 0 ? 2 : lastX + 2);
        src.copyTo(sh.getRange(destRow, 24));
        SpreadsheetApp.flush();
        uiArch.alert("✅ Archivé", "Tableau copié à partir de la colonne X, ligne " + destRow + ".", uiArch.ButtonSet.OK);
      }
    }
  }
// === Colonne A : mail d'attribution choisi dans une liste ===
  {
    const ui = SpreadsheetApp.getUi();
    const sh = SpreadsheetApp.getActive().getSheetByName("PlanningFinale");

    const MAILS = [
      "sosplomb.92@gmail.com",
      "eau@ojade.fr"
    ];

    let liste = "Choisir le mail d'attribution en tapant son numéro :\n\n";
    for (let i = 0; i < MAILS.length; i++) liste += (i + 1) + " → " + MAILS[i] + "\n";

    const rep = ui.prompt("Mail d'attribution", liste, ui.ButtonSet.OK_CANCEL);
    if (rep.getSelectedButton() === ui.Button.OK) {
      const choix = parseInt(rep.getResponseText().trim(), 10);
      const mail = MAILS[choix - 1];
      if (mail) {
        const last = sh.getLastRow();
        const colD = sh.getRange(2, 4, last - 1, 1).getValues();
        let derniere = 1;
        for (let i = 0; i < colD.length; i++) {
          if (String(colD[i][0] || "").trim() !== "") derniere = i + 2;
        }
        if (derniere >= 2) {
          const nb = derniere - 1;
          const bloc = [];
          for (let i = 0; i < nb; i++) bloc.push([mail]);
          sh.getRange(2, 1, nb, 1).setValues(bloc);
        }
      } else {
        ui.alert("Numéro invalide", "Aucun mail ne correspond à ce numéro. Colonne A inchangée.", ui.ButtonSet.OK);
      }
    }
  }
  // ============================================================
  // 17) MARQUAGE "TOURNÉE" DANS Clients_traitement (colonne AQ)
  // ============================================================
  {
    const COL_NUM_PLANNING = 5;        // Colonne E = N° client dans PlanningFinale
    const FORMAT_DATE = "dd/MM/yyyy";  // ex. 09/02/2026

    const shCT = ss.getSheetByName("Clients_traitement");
    if (shCT) {
      const valB2 = sh.getRange(2, 2).getValue();
      const dateTxt = (valB2 instanceof Date)
        ? Utilities.formatDate(valB2, ss.getSpreadsheetTimeZone(), FORMAT_DATE)
        : String(valB2 || "").trim();
      const marqueur = "TOURNÉE " + dateTxt;

      const numsTournee = sh.getRange(START_ROW, COL_NUM_PLANNING, nbRows, 1).getValues();

      const lastCT = shCT.getLastRow();
      const numsCT = shCT.getRange(2, 1, Math.max(0, lastCT - 1), 1).getValues();
      const indexCT = {};
      for (let i = 0; i < numsCT.length; i++) {
        const cle = String(numsCT[i][0] || "").trim();
        if (cle !== "") indexCT[cle] = i + 2;
      }

      const COL_AQ = 43;
      let marques = 0;
      const nonTrouves = [];
      for (let i = 0; i < numsTournee.length; i++) {
        const cle = String(numsTournee[i][0] || "").trim();
        if (cle === "") continue;
        const ligne = indexCT[cle];
        if (ligne) { shCT.getRange(ligne, COL_AQ).setValue(marqueur); marques++; }
        else { nonTrouves.push(cle); }
      }
      SpreadsheetApp.flush();

      const uiMark = getUiSafe_();
      if (uiMark) {
        let msg = marques + " client(s) marqué(s) « " + marqueur + " » dans Clients_traitement (AQ).";
        if (marques === 0) msg += "\n\n⚠️ Aucun marqué : vérifiez COL_NUM_PLANNING (colonne du N° client dans PlanningFinale).";
        if (nonTrouves.length) msg += "\n\nNon trouvés (" + nonTrouves.length + ") : " + nonTrouves.join(", ");
        uiMark.alert("Marquage tournée", msg, uiMark.ButtonSet.OK);
      }
    }
  }
CALCULER_BESOINS_COMMANDE();
}

// Somme des marges saisies en colonne C de Paramètres (lignes ayant un client en D)
function sommeMargesParametres_(shP) {
  const COL_MARGE = 3; // C
  const COL_NOM   = 4; // D
  const lastRow = shP.getLastRow();
  if (lastRow < 1) return 0;
  const noms   = shP.getRange(1, COL_NOM,   lastRow, 1).getValues();
  const marges = shP.getRange(1, COL_MARGE, lastRow, 1).getValues();
  let somme = 0;
  for (let i = 0; i < noms.length; i++) {
    if (String(noms[i][0] || "").trim() === "") continue;
    const v = parseFloat(String(marges[i][0]).replace(",", ".")) || 0;
    somme += v;
  }
  return somme;
}

// =========================================================================
// SUB-FONCTIONS ET OUTILS
// =========================================================================
function verifierChronologieInitiale(sh, startRow, colDate, colHeure, ui) {
  const lastRow = sh.getLastRow();
  let dateTimePrec = null;
  let lignePrec = null;
  for (let i = startRow; i <= lastRow; i++) {
    const dateVal = sh.getRange(i, colDate).getValue();
    const heureVal = sh.getRange(i, colHeure).getValue();
    if (!dateVal || !heureVal) continue;
    const dateObj = toDateOnly_(dateVal);
    const minutes = timeCellToMinutes_(heureVal);
    if (!dateObj || minutes === null) continue;
    const dateTime = new Date(dateObj);
    dateTime.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    if (dateTimePrec && dateTime < dateTimePrec) {
      if (ui) {
        ui.alert("🚨 BLOCAGE DE SÉCURITÉ INITIAL",
          "IMPOSSIBLE DE LANCER LE PROGRAMME !\n\n" +
          "La ligne " + i + " (" + formatDateTime(dateTime) + ") est placée avant " +
          "la ligne " + lignePrec + " (" + formatDateTime(dateTimePrec) + ").\n\n" +
          "Veuillez remettre vos lignes dans l'ordre chronologique avant de relancer.",
          ui.ButtonSet.OK);
      }
      sh.getRange(i, 6).setValue("❌ ERREUR CHRONO INITIALE (Ligne " + i + " avant " + lignePrec + ")");
      sh.getRange(i, 6).setFontColor("#ff0000");
      return false;
    }
    dateTimePrec = dateTime;
    lignePrec = i;
  }
  return true;
}

function formatDateTime(date) {
  if (!date) return "";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return d + "/" + m + "/" + y + " à " + h + ":" + min;
}

function getUiSafe_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }

function alertSafe_(ui, ss, title, msg) { if (ui) ui.alert(title, msg, ui.ButtonSet.OK); else ss.toast(msg, title, 5); }

function toNumber_(v) {
  if (v === null || v === "") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function toDateOnly_(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) { const d = new Date(v); d.setHours(0, 0, 0, 0); return d; }
  const str = String(v).trim();
  let parts = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) return new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]));
  parts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (parts) return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
  return null;
}

function timeCellToMinutes_(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  if (typeof v === "number") return Math.round(v * 1440);
  const match = String(v).match(/^(\d{1,2}):(\d{2})$/);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  return null;
}

function buildDateTime_(dateOnly, minutes) {
  const d = toDateOnly_(dateOnly) || new Date();
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  dt.setMinutes(minutes || 0);
  return dt;
}

function hhmm_(date) {
  if (!date) return "??:??";
  return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
}

function setF_(sh, row, txt) { sh.getRange(row, 6).setValue(txt); }
function appendF_(sh, row, txt) {
  const cell = sh.getRange(row, 6);
  const cur = cell.getValue() || "";
  cell.setValue(cur ? cur + " | " + txt : txt);
}

function parseDateFRorISO_(text) {
  if (!text) return null;
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  return null;
}

function ajusterWeekendAvecQuestions_(ui, date) { return date; }

function trierSelonColonneK_NumeriquePur_(sh, ui) {
  const START_ROW = 2;
  const COL_K = 11;
  const lastRowSheet = sh.getLastRow();
  const lastColSheet = sh.getLastColumn();
  if (lastRowSheet < START_ROW) return false;
  const nbRows = lastRowSheet - START_ROW + 1;
  const data = sh.getRange(START_ROW, 1, nbRows, lastColSheet).getValues();

  let dataStarted = false;
  let firstEmptyFound = false;
  const rowsToSort = [];

  for (let i = 0; i < data.length; i++) {
    const rawValue = data[i][COL_K - 1];

    const isEmpty = (rawValue === "" || rawValue === null || rawValue === undefined);
    if (isEmpty) {
      if (dataStarted) firstEmptyFound = true;
      continue;
    }

    dataStarted = true;
    if (firstEmptyFound) {
      if (ui) ui.alert("⚠️ ERREUR DE TRI", "Ligne vide au milieu de la colonne K.", ui.ButtonSet.OK);
      return false;
    }

    let num;
    if (rawValue instanceof Date) {
      num = rawValue.getTime();
    } else if (typeof rawValue === "number") {
      num = rawValue;
    } else {
      const normalized = String(rawValue)
        .replace(/[\s  ]/g, "")
        .replace(",", ".");
      num = Number(normalized);
    }

    if (!Number.isFinite(num)) {
      if (ui) ui.alert(
        "⚠️ ERREUR DE FORMAT",
        "Ligne " + (START_ROW + i) + " colonne K non valide.\n" +
        "Valeur = [" + rawValue + "]\n" +
        "Type = " + (rawValue instanceof Date ? "Date" : typeof rawValue),
        ui.ButtonSet.OK
      );
      return false;
    }

    rowsToSort.push({ kValue: num, rowData: data[i] });
  }

  if (!dataStarted) return false;

  rowsToSort.sort((a, b) => a.kValue - b.kValue);
  const output = rowsToSort.map(item => item.rowData);
  sh.getRange(START_ROW, 1, output.length, lastColSheet).setValues(output);
  return true;
}

function verifierBonneFeuille_() {
  const NOM_ATTENDU = "PlanningFinale";
  const sh = SpreadsheetApp.getActiveSheet();
  const nomActuel = sh.getName();

  if (nomActuel !== NOM_ATTENDU) {
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      "🛑 MAUVAISE FEUILLE",
      "Tu es sur l'onglet « " + nomActuel + " ».\n\n" +
      "Ce programme doit être lancé depuis l'onglet « " + NOM_ATTENDU + " ».\n\n" +
      "Clique sur le bon onglet en bas, puis relance.",
      ui.ButtonSet.OK
    );
    return false;
  }
  return true;
}

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

  const rdvParJour = {};
  const joursOccupes = [];

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

function verifierContactsEvolizDansPlanning() {

  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  const shPlan = ss.getSheetByName("PlanningFinale");

  if (!shPlan) {
    ui.alert("Erreur", "La feuille PlanningFinale est introuvable.", ui.ButtonSet.OK);
    return;
  }

  // ============================================================
  // RECHERCHE AUTOMATIQUE DU FICHIER EVOLIZ
  // ============================================================

  const ID_DOSSIER_EVOLIZ = "10QzuJ3e9MCItsPLAus4izmRaBLAVuXW8";
  const RACINE_NOM_FICHIER = "evoliz_Contact_Client";

  const dossier = DriveApp.getFolderById(ID_DOSSIER_EVOLIZ);
  const fichiers = dossier.getFiles();

  let fichierEvoliz = null;
  let datePlusRecente = null;

  while (fichiers.hasNext()) {
    const fichier = fichiers.next();
    const nom = fichier.getName();

    if (nom.indexOf(RACINE_NOM_FICHIER) === 0) {
      const dateModification = fichier.getLastUpdated();

      if (fichierEvoliz === null || dateModification > datePlusRecente) {
        fichierEvoliz = fichier;
        datePlusRecente = dateModification;
      }
    }
  }

  if (!fichierEvoliz) {
    ui.alert(
      "Erreur",
      "Aucun fichier commençant par evoliz_Contact_Client n'a été trouvé dans le dossier.",
      ui.ButtonSet.OK
    );
    return;
  }

  const ssEvoliz = SpreadsheetApp.openById(fichierEvoliz.getId());
  const shEvoliz = ssEvoliz.getSheetByName("Evoliz.com");

  if (!shEvoliz) {
    ui.alert(
      "Erreur",
      "Le fichier " + fichierEvoliz.getName() + " ne contient pas la feuille Evoliz.com.",
      ui.ButtonSet.OK
    );
    return;
  }

  // ============================================================
  // LECTURE EVOLIZ A:L
  // ============================================================

  const lastEvoliz = shEvoliz.getLastRow();

  if (lastEvoliz < 2) {
    ui.alert("Erreur", "La feuille Evoliz.com ne contient aucun client.", ui.ButtonSet.OK);
    return;
  }

  const dataEvoliz = shEvoliz.getRange(2, 1, lastEvoliz - 1, 12).getValues();

  const parCode = {};
  const parNom = {};

  dataEvoliz.forEach(function(ligne) {
    const nom = String(ligne[0] || "").trim().toLowerCase();
    const code = String(ligne[1] || "").trim().toLowerCase();
    const email = String(ligne[5] || "").trim();
    const telJ = String(ligne[9] || "").trim();
    const telL = String(ligne[11] || "").trim();

    const fiche = { nom: nom, code: code, email: email, telJ: telJ, telL: telL };

    if (code) parCode[code] = fiche;
    if (nom) parNom[nom] = fiche;
  });

  const lastPlan = shPlan.getLastRow();

  if (lastPlan < 2) {
    ui.alert("PlanningFinale est vide.");
    return;
  }

  const dataPlan = shPlan.getRange(2, 4, lastPlan - 1, 3).getValues();

  const sorties = [];
  let nbEmailManquant = 0;
  let nbTelManquant = 0;
  let nbIntrouvable = 0;

  dataPlan.forEach(function(ligne) {
    const nomOriginal = String(ligne[0] || "").trim();
    const codeOriginal = String(ligne[1] || "").trim();
    const nom = nomOriginal.toLowerCase();
    const code = codeOriginal.toLowerCase();

    if (!nomOriginal && !codeOriginal) {
      sorties.push([""]);
      return;
    }

    let fiche = code ? parCode[code] : null;
    if (!fiche && nom) fiche = parNom[nom];

    if (!fiche) {
      sorties.push(["❌ Client introuvable dans Evoliz"]);
      nbIntrouvable++;
      return;
    }

    const emailOK = fiche.email !== "";
    const telephoneOK = fiche.telJ !== "" || fiche.telL !== "";

    if (emailOK && telephoneOK) {
      sorties.push([""]);
      return;
    }

    if (!emailOK && !telephoneOK) {
      sorties.push(["⚠️ Email + téléphone manquants"]);
      nbEmailManquant++;
      nbTelManquant++;
      return;
    }

    if (!emailOK) {
      sorties.push(["⚠️ Email manquant"]);
      nbEmailManquant++;
      return;
    }

    if (!telephoneOK) {
      sorties.push(["⚠️ Téléphone manquant"]);
      nbTelManquant++;
      return;
    }
  });

  shPlan.getRange(2, 6, sorties.length, 1).setValues(sorties);
  SpreadsheetApp.flush();

  ui.alert(
    "✅ Contrôle Evoliz terminé",
    "Email manquant : " + nbEmailManquant + "\n" +
    "Téléphone manquant : " + nbTelManquant + "\n" +
    "Client introuvable : " + nbIntrouvable,
    ui.ButtonSet.OK
  );
}
