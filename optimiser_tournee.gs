function optimiserTournee() {

  const SHEET = "PlanningFinale";
  const START_ROW = 2;
  const NB_COLS = 22;
  const COL = { ADR: 8, ORDRE: 11, DIST: 12, TRAJET: 13, LIEN_ETAPE: 15, ITIN: 16 };
  const BUFFER = 1.25;
  const MAX_WAYPOINTS = 25;
  // NE JAMAIS COMMITER UNE VRAIE CLE ICI : utilise
  // PropertiesService (GOOGLE_MAPS_API_KEY), voir plus bas.
  const API_KEY = "METS_TA_CLE_ICI_UNIQUEMENT_EN_LOCAL";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = opt_ui_();
  const sh = ss.getSheetByName(SHEET);
  if (!sh) { opt_alert_(ui, ss, "Erreur", "Feuille « " + SHEET + " » introuvable."); return; }

  // ==========================================================
  // NETTOYAGE AUTOMATIQUE, ICI, AVANT TOUT LE RESTE.
  // Appelé directement dans optimiserTournee() (et pas
  // seulement dans demarrer()) pour que ça tourne à coup sûr,
  // que le bouton appelle demarrer() ou optimiserTournee()
  // directement.
  // ==========================================================
  nettoyerResidusPlanningFinale_();
  const lignesAdressesVidees = nettoyerAdressesInvalidesPlanningFinale_();
  if (lignesAdressesVidees.length) {
    opt_alert_(ui, ss, "Adresses invalides vidées",
      "Ces lignes avaient une adresse sans aucun chiffre (donc pas une " +
      "vraie adresse) — elles ont été vidées automatiquement :\n\n" +
      lignesAdressesVidees.join("\n") +
      "\n\nComplète-les avec une vraie adresse, sinon ces clients seront " +
      "exclus du calcul d'itinéraire.");
  }

// === B2 et C2 : date et heure du 1er RDV (demandées si vides) ===
  if (sh.getRange(2, 2).getValue() === "" || sh.getRange(2, 2).getValue() === null) {
    const r = ui.prompt("Première date", "Date du 1er rendez-vous ? (JJ/MM/AAAA)", ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    const p = r.getResponseText().trim().split(/[\/\-.]/);
    const d = new Date(+p[2] < 100 ? +p[2] + 2000 : +p[2], +p[1] - 1, +p[0]);
    if (isNaN(d.getTime())) { ui.alert("Date invalide (ex : 15/09/2026)"); return; }
    sh.getRange(2, 2).setValue(d).setNumberFormat("dd/MM/yyyy");
  }
  if (sh.getRange(2, 3).getValue() === "" || sh.getRange(2, 3).getValue() === null) {
    const r = ui.prompt("Première heure", "Heure du 1er rendez-vous ? (HH:MM)", ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    const p = r.getResponseText().trim().replace("h", ":").split(":");
    const min = (+p[0]) * 60 + (p[1] ? +p[1] : 0);
    if (isNaN(min) || min > 1439) { ui.alert("Heure invalide (ex : 09:00)"); return; }
    sh.getRange(2, 3).setValue(min / 1440).setNumberFormat("[h]:mm");
  }
  // Clé API : propriété du script si elle existe, sinon la clé par défaut
  const apiKey = PropertiesService.getScriptProperties().getProperty("GOOGLE_MAPS_API_KEY") || API_KEY;

  // Points de DÉPART et d'ARRIVÉE (mémorisés)
  const shP = ss.getSheetByName("Paramètres");
  const props = PropertiesService.getScriptProperties();
  const DEFAUT = "92040, Issy les Moulineaux";
  const depotB5 = shP ? String(shP.getRange("B5").getValue() || "").trim() : "";
  const departDefaut  = props.getProperty("OPT_DEPART")  || depotB5 || DEFAUT;
  const arriveeDefaut = props.getProperty("OPT_ARRIVEE") || depotB5 || DEFAUT;

  const depart = opt_prompt_(ui, "Point de DÉPART", "Adresse de départ de la tournée :", departDefaut);
  if (depart === null) return;
  const arrivee = opt_prompt_(ui, "Point d'ARRIVÉE", "Adresse de fin de tournée :", arriveeDefaut);
  if (arrivee === null) return;
  if (!depart || !arrivee) { opt_alert_(ui, ss, "Erreur", "Départ ou arrivée vide."); return; }

  props.setProperty("OPT_DEPART",  depart);
  props.setProperty("OPT_ARRIVEE", arrivee);

  // Lecture des clients (lignes 2+ avec une adresse en H)
  const lastRow = sh.getLastRow();
  if (lastRow < START_ROW) { opt_alert_(ui, ss, "Erreur", "Aucun client."); return; }

  const data = sh.getRange(START_ROW, 1, lastRow - START_ROW + 1, NB_COLS).getValues();
  const rows = [];
  const addrs = [];
  for (let i = 0; i < data.length; i++) {
    const code = String(data[i][4] || "").trim();            // E = code client
    const adr  = String(data[i][COL.ADR - 1] || "").trim();  // H = adresse

    // Une vraie ligne client a TOUJOURS un code (E) ET une adresse (H).
    // Ça exclut le bloc récapitulatif en bas de la feuille (GRAND TOTAL,
    // TAUX HORAIRE, FRAIS CARBURANT...) qui n'a pas de code client mais
    // peut avoir une valeur numérique qui tombe dans la colonne H.
    if (!code || !adr) continue;

    rows.push(data[i]);
    addrs.push(adr);
  }
 if (addrs.length < 3) {
    opt_alert_(ui, ss,
      "Pas assez de clients pour optimiser",
      "Clients avec une adresse détectés : " + addrs.length + "\n\n" +
      "L'optimisation cherche le MEILLEUR ORDRE de passage entre plusieurs arrêts.\n" +
      "• Avec 1 ou 2 clients, il n'existe qu'un seul trajet possible : il n'y a rien à optimiser.\n" +
      "• Il faut donc au moins 3 clients (idéalement 5 à 15) pour que l'optimisation ait un effet visible.\n\n" +
      "👉 Vérifiez que les lignes importées ont bien une adresse en colonne H (Adresse).\n" +
      "Si vous vouliez plus de clients, refaites l'import depuis « Clients_traitement ».");
    return;
  }
  if (addrs.length > MAX_WAYPOINTS) {
    opt_alert_(ui, ss, "Trop de clients",
      "Limité à " + MAX_WAYPOINTS + " clients. Tu en as " + addrs.length + ".");
    return;
  }
// Date et heure du PREMIER rendez-vous (si B2 et C2 sont vides)
  let premiereDate = null;
  let premiereHeureMin = null;
  {
    const b2 = sh.getRange(2, 2).getValue();
    const c2 = sh.getRange(2, 3).getValue();

    if (b2 === "" || b2 === null) {
      const rep = opt_prompt_(ui, "Première date de tournée",
        "Quelle est la date du PREMIER rendez-vous ? (JJ/MM/AAAA)", "");
      if (rep === null) return;
      premiereDate = opt_parseDateFR_(rep);
      if (!premiereDate) {
        opt_alert_(ui, ss, "Date invalide", "Format attendu : JJ/MM/AAAA (ex : 15/09/2026).");
        return;
      }
    }

    if (c2 === "" || c2 === null) {
      const rep = opt_prompt_(ui, "Première heure de tournée",
        "Quelle est l'heure du PREMIER rendez-vous ? (HH:MM)", "09:00");
      if (rep === null) return;
      premiereHeureMin = opt_parseHeure_(rep);
      if (premiereHeureMin === null) {
        opt_alert_(ui, ss, "Heure invalide", "Format attendu : HH:MM (ex : 09:00).");
        return;
      }
    }
  }
  // Sauvegarde automatique AVANT modification
 const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd_HH-mm-ss");
  let nomSauv = "(sauvegarde non créée)";
  try {
    nomSauv = "SAUV_" + SHEET + "_" + stamp;
    sh.copyTo(ss).setName(nomSauv);
  } catch (e) {
    nomSauv = "⚠️ Sauvegarde impossible (feuille non copiable) — optimisation quand même effectuée";
  }

  // Appel Directions avec optimisation
  const wp = "optimize:true|" + addrs.map(a => encodeURIComponent(a)).join("|");
  const wpEncoded = wp.replace(/\|/g, "%7C");
  const url = "https://maps.googleapis.com/maps/api/directions/json"
    + "?origin=" + encodeURIComponent(depart)
    + "&destination=" + encodeURIComponent(arrivee)
    + "&waypoints=" + wpEncoded
    + "&mode=driving&units=metric&language=fr&region=fr"
    + "&key=" + encodeURIComponent(apiKey);

  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const json = JSON.parse(resp.getContentText());
  if (json.status !== "OK") {
    let detail = json.status + (json.error_message ? "\n" + json.error_message : "");

    // ---------------------------------------------------------
    // DIAGNOSTIC : quand Directions échoue (ZERO_RESULTS le
    // plus souvent), on géocode chaque adresse individuellement
    // pour dire précisément laquelle pose problème, plutôt que
    // de laisser un message opaque.
    // ---------------------------------------------------------
    const toutesAdresses = [depart].concat(addrs, [arrivee]);
    const invalides = opt_diagnostiquerAdresses_(apiKey, toutesAdresses);

    if (invalides.length) {
      detail += "\n\nAdresse(s) que Google Maps ne reconnaît pas :\n" + invalides.join("\n");
    } else {
      detail += "\n\nToutes les adresses sont reconnues individuellement : " +
        "le problème vient probablement d'un point injoignable par la route " +
        "(adresse dans un pays différent, île, etc.) plutôt que d'une adresse mal orthographiée.";
    }

    opt_alert_(ui, ss, "Erreur Google Maps", detail);
    return;
  }

  const route = json.routes[0];
  const order = route.waypoint_order;
  const legs  = route.legs;
  if (!order || !legs || legs.length !== addrs.length + 1) {
    opt_alert_(ui, ss, "Erreur", "Réponse Google inattendue (ordre/legs).");
    return;
  }

  // Réordonner les lignes selon l'ordre optimisé
  const seq = order.map(idx => rows[idx].slice());

  // Remplir K (ordre), L (distance), M (trajet)
  let totalKm = 0;
  for (let p = 0; p < seq.length; p++) {
    seq[p][COL.ORDRE - 1] = p + 1;
    if (p < seq.length - 1) {
      const legOut = legs[p + 1];
      const km  = Math.round(((legOut.distance && legOut.distance.value) || 0) / 100) / 10;
      const min = Math.round((((legOut.duration && legOut.duration.value) || 0) / 60) * BUFFER);
      seq[p][COL.DIST - 1]   = km;
      seq[p][COL.TRAJET - 1] = min / 1440;
      totalKm += km;
    } else {
      seq[p][COL.DIST - 1]   = "";
      seq[p][COL.TRAJET - 1] = "";
    }
  }

  // Trajets dépôt (aller + retour) -> Script Properties
  const allerKm  = Math.round(((legs[0].distance && legs[0].distance.value) || 0) / 100) / 10;
  const allerMin = Math.round((((legs[0].duration && legs[0].duration.value) || 0) / 60) * BUFFER);
  const lastLeg  = legs[legs.length - 1];
  const retourKm  = Math.round(((lastLeg.distance && lastLeg.distance.value) || 0) / 100) / 10;
  const retourMin = Math.round((((lastLeg.duration && lastLeg.duration.value) || 0) / 60) * BUFFER);
  props.setProperty("EXTRA_KM",  String(allerKm + retourKm));
  props.setProperty("EXTRA_MIN", String(allerMin + retourMin));

  // Écriture en bloc + formats
  sh.getRange(START_ROW, 1, seq.length, NB_COLS).setValues(seq);
  //
// === Date et heure du 1er RDV (demandées puis écrites en B2/C2) ===
  {
    const rD = ui.prompt("Première date", "Date du 1er rendez-vous ? (JJ/MM/AAAA)", ui.ButtonSet.OK_CANCEL);
    if (rD.getSelectedButton() === ui.Button.OK) {
      const p = rD.getResponseText().trim().split(/[\/\-.]/);
      const d = new Date(+p[2] < 100 ? +p[2] + 2000 : +p[2], +p[1] - 1, +p[0]);
      if (!isNaN(d.getTime())) {
        sh.getRange(2, 2).setValue(d).setNumberFormat("dd/MM/yyyy");
      } else {
        ui.alert("Date invalide (ex : 15/09/2026). B2 laissée vide.");
      }
    }

    const rH = ui.prompt("Première heure", "Heure du 1er rendez-vous ? (HH:MM)", ui.ButtonSet.OK_CANCEL);
    if (rH.getSelectedButton() === ui.Button.OK) {
      const q = rH.getResponseText().trim().replace("h", ":").split(":");
      const min = (+q[0]) * 60 + (q[1] ? +q[1] : 0);
      if (!isNaN(min) && min <= 1439) {
        sh.getRange(2, 3).setValue(min / 1440).setNumberFormat("[h]:mm");
      } else {
        ui.alert("Heure invalide (ex : 09:00). C2 laissée vide.");
      }
    }
  }
  //
  sh.getRange(START_ROW, COL.TRAJET, seq.length, 1).setNumberFormat("[h]:mm");
  sh.getRange(START_ROW, COL.DIST,   seq.length, 1).setNumberFormat("0.0");

  // Liens O (étape) et P (itinéraire global)
  const ordreAddr = seq.map(r => String(r[COL.ADR - 1] || "").trim());
  const lienGlobal = "https://www.google.com/maps/dir/"
    + [depart].concat(ordreAddr, [arrivee]).map(a => encodeURIComponent(a)).join("/");

  const formulesO = [];
  const formulesP = [];
  for (let p = 0; p < seq.length; p++) {
    formulesP.push(['=HYPERLINK("' + lienGlobal + '";"Voir itinéraire global")']);
    const dest = (p < seq.length - 1) ? ordreAddr[p + 1] : arrivee;
    const lienEtape = "https://www.google.com/maps/dir/"
      + encodeURIComponent(ordreAddr[p]) + "/" + encodeURIComponent(dest);
    formulesO.push(['=HYPERLINK("' + lienEtape + '";"Voir étape")']);
  }
  sh.getRange(START_ROW, COL.LIEN_ETAPE, seq.length, 1).setFormulas(formulesO);
  sh.getRange(START_ROW, COL.ITIN,       seq.length, 1).setFormulas(formulesP);

  SpreadsheetApp.flush();

  const recap =
    seq.length + " clients réordonnés (colonne K).\n" +
    "Distance entre clients : " + totalKm.toFixed(1) + " km\n" +
    "Départ→1er + dernier→arrivée : " + (allerKm + retourKm).toFixed(1) + " km\n\n" +
    "Départ : " + depart + "\n" +
    "Arrivée : " + arrivee + "\n\n" +
    "Sauvegarde créée : " + nomSauv;

  if (ui) {
    const rep = ui.alert("✅ Tournée optimisée — Calcul financier",
      recap + "\n\nAvez-vous rempli les dates (B), les durées (G) et les Paramètres ?\n\n" +
      "OUI → lance le calcul financier\n" +
      "NON → on s'arrête là",
      ui.ButtonSet.YES_NO);
    if (rep === ui.Button.YES) {
      try {
        phase2_Calcul();
      } catch (e) {
        ui.alert("Calcul impossible",
          "Le calcul financier n'a pas pu aboutir :\n" + (e && e.message ? e.message : e) +
          "\n\nVérifie les durées (G) et les dates (B), ou lance d'abord la Phase B.",
          ui.ButtonSet.OK);
      }
    }
  } else {
    ss.toast(recap, "Tournée optimisée", 8);
  }
}


/*******************************************************
 * Diagnostic : identifie la ou les adresses que Google
 * Maps ne sait pas géocoder — appelé uniquement quand
 * l'appel Directions a déjà échoué, pour ne pas ajouter
 * d'appels API sur le chemin qui fonctionne normalement.
 *******************************************************/
function opt_diagnostiquerAdresses_(apiKey, adresses) {
  const invalides = [];

  adresses.forEach(function(adr) {
    if (!adr) return;

    const url = "https://maps.googleapis.com/maps/api/geocode/json"
      + "?address=" + encodeURIComponent(adr)
      + "&region=fr"
      + "&key=" + encodeURIComponent(apiKey);

    try {
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const json = JSON.parse(resp.getContentText());

      if (json.status !== "OK") {
        invalides.push(adr + "  (" + json.status + ")");
      }
    } catch (e) {
      invalides.push(adr + "  (erreur réseau)");
    }
  });

  return invalides;
}
