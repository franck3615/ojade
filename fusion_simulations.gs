// ============================================================================
// FUSION DE SIMULATIONS - VERSION SIMPLIFIEE (SANS GOOGLE MAPS)
//
// Remplace la version V6.4 (calcul d'itinéraire Google Maps) par une
// version plus simple : les clients retenus restent dans l'ordre où ils
// apparaissent dans Clients_traitement, pas d'appel à Google Maps.
//
// PRINCIPE :
// - AP rouge + AQ rouge = client retenu pour la fusion
// - Les autres clients appartenant aux mêmes simulations sources
//   (mêmes que celles indiquées en AQ pour les clients retenus)
//   se retrouvent avec AQ vide après la fusion.
//
// CORRECTIF APPLIQUE :
// - "Exception: Those columns are out of bounds." : le script demandait
//   des plages fixes (43 colonnes sur Clients_traitement pour aller
//   jusqu'à AQ, 23 colonnes sur PlanningFinale pour aller jusqu'à W)
//   sans vérifier que ces feuilles avaient bien autant de colonnes dans
//   leur grille. assurerColonnes_() étend la grille si besoin avant de
//   lire/écrire, ce qui évite le plantage.
// ============================================================================


function fusionnerSimulationsSelectionRouge() {

  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();

  const shC = ss.getSheetByName("Clients_traitement");
  const shPlan = ss.getSheetByName("PlanningFinale");

  if (!shC || !shPlan) {
    ui.alert(
      "Erreur",
      "Clients_traitement ou PlanningFinale est introuvable.",
      ui.ButtonSet.OK
    );
    return;
  }


  // ============================================================
  // MEMOIRE DES COULEURS AP/AQ (avant toute sélection/fusion)
  // ============================================================

  gererCouleurOrigineAPAQ();


  // ============================================================
  // SECURITE : ETENDRE LES FEUILLES SI ELLES N'ONT PAS ASSEZ
  // DE COLONNES (sinon getRange plante avec "columns out of bounds")
  //
  // Clients_traitement doit aller au moins jusqu'à AQ (colonne 43)
  // PlanningFinale doit aller au moins jusqu'à W (colonne 23)
  // ============================================================

  function assurerColonnes_(sh, nbColonnes) {

    const actuelles = sh.getMaxColumns();

    if (actuelles < nbColonnes) {
      sh.insertColumnsAfter(
        actuelles,
        nbColonnes - actuelles
      );
    }
  }

  assurerColonnes_(shC, 44);
  assurerColonnes_(shPlan, 23);


  // ============================================================
  // REPERAGE AUTOMATIQUE PAR DATE (colonne AR)
  //
  // Si au moins une ligne a déjà AP+AQ rouge (l'opérateur a
  // commencé une sélection), on propose de scanner AR (date de
  // la prochaine intervention) et de sélectionner aussi (AP+AQ+AR
  // en rouge) tous les clients dont cette date est <= aujourd'hui
  // + 15 jours.
  //
  // On ne touche pas au texte de AQ (déjà rempli en amont avec
  // l'étiquette "SIMULATION ...") : seule la couleur change. Les
  // lignes sans étiquette AQ valide sont ignorées et signalées,
  // pour ne pas créer de sélection qui échouerait plus loin.
  // ============================================================

  function toDateOnlyLocal_(valeur) {

    let d;

    if (valeur instanceof Date) {
      d = new Date(valeur.getTime());
    } else if (valeur) {
      d = new Date(valeur);
    } else {
      return null;
    }

    if (isNaN(d.getTime())) {
      return null;
    }

    d.setHours(0, 0, 0, 0);
    return d;
  }

  function reperageAutomatiqueAR_() {

    const lastRowC = shC.getLastRow();
    if (lastRowC < 2) return;

    const nbLignesC = lastRowC - 1;

    // AP:AQ existantes
    const couleursAPAQ =
      shC.getRange(2, 42, nbLignesC, 2).getBackgrounds();

    let dejaUneSelection = false;

    for (let i = 0; i < couleursAPAQ.length; i++) {
      if (
        estRouge(couleursAPAQ[i][0]) &&
        estRouge(couleursAPAQ[i][1])
      ) {
        dejaUneSelection = true;
        break;
      }
    }

    if (!dejaUneSelection) return;

    const reponse = ui.alert(
      "Repérage automatique",
      "Au moins un client est déjà sélectionné (AP+AQ rouge).\n\n" +
      "Veux-tu que je repère automatiquement, en colonne AR (date de la " +
      "prochaine intervention), les clients dont cette date est dans les " +
      "15 prochains jours, et que je les sélectionne aussi (AP, AQ, AR en rouge) ?",
      ui.ButtonSet.YES_NO
    );

    if (reponse !== ui.Button.YES) return;

    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);

    const pivot = new Date(aujourdHui);
    pivot.setDate(pivot.getDate() + 15);

    const blocAPAR =
      shC.getRange(2, 42, nbLignesC, 3).getValues();        // AP:AR valeurs (pour AQ texte)

    const backgroundsAPAR =
      shC.getRange(2, 42, nbLignesC, 3).getBackgrounds();   // AP:AR couleurs

    let nbColores = 0;
    let nbIgnores = 0;

    for (let i = 0; i < blocAPAR.length; i++) {

      const dateAR = toDateOnlyLocal_(blocAPAR[i][2]); // AR = 3e colonne du bloc

      if (!dateAR || dateAR.getTime() > pivot.getTime()) {
        continue;
      }

      const aqTexte = String(blocAPAR[i][1] || "").trim(); // AQ = 2e colonne du bloc

      if (
        !aqTexte ||
        aqTexte.toLowerCase().indexOf("simulation") !== 0
      ) {
        nbIgnores++;
        continue;
      }

      backgroundsAPAR[i][0] = "#ff0000"; // AP
      backgroundsAPAR[i][1] = "#ff0000"; // AQ
      backgroundsAPAR[i][2] = "#ff0000"; // AR

      nbColores++;
    }

    shC.getRange(2, 42, nbLignesC, 3).setBackgrounds(backgroundsAPAR);

    SpreadsheetApp.flush();

    ui.alert(
      "Repérage terminé",
      nbColores + " client(s) sélectionné(s) automatiquement " +
      "(intervention prévue avant le " +
      Utilities.formatDate(pivot, ss.getSpreadsheetTimeZone(), "dd/MM/yyyy") +
      ").\n\n" +
      (nbIgnores
        ? nbIgnores + " ligne(s) ignorée(s) : date dans les 15 jours mais " +
          "pas d'étiquette de simulation valide en AQ."
        : "Aucune ligne ignorée."),
      ui.ButtonSet.OK
    );
  }

  reperageAutomatiqueAR_();


  // ============================================================
  // PETITE FONCTION LOCALE : DETECTER LE ROUGE
  // ============================================================

  function estRouge(couleur) {

    couleur = String(couleur || "")
      .trim()
      .toLowerCase();

    const m = couleur.match(
      /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/
    );

    if (!m) return false;

    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);

    return (
      r >= 170 &&
      g <= 100 &&
      b <= 100 &&
      r >= g + 80 &&
      r >= b + 80
    );
  }


  // ============================================================
  // NORMALISER UNE VALEUR AQ
  // ============================================================

  function normaliserAQ(valeur) {

    return String(valeur || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  }


  // ============================================================
  // CONVERTIR :
  //
  // SIMULATION 29/08/2026 - 4
  // ->
  // simulationTournée_29-08-2026_4
  //
  // SIMULATION 02/09/2026 - 1
  // ->
  // simulationTournée_02-09-2026
  // ============================================================

  function etiquetteVersFeuille(etiquette) {

    const m =
      String(etiquette || "").trim().match(
        /^SIMULATION\s+(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d+)$/i
      );

    if (!m) return "";

    const numero = parseInt(m[4], 10);

    let nom =
      "simulationTournée_" +
      m[1] + "-" +
      m[2] + "-" +
      m[3];

    if (numero > 1) {
      nom += "_" + numero;
    }

    return nom;
  }


  // ============================================================
  // 1. LIRE Clients_traitement
  // ============================================================

  const lastRow = shC.getLastRow();

  if (lastRow < 2) {
    ui.alert("Aucun client.");
    return;
  }

  const nbLignes = lastRow - 1;

  // A:AQ
  const data =
    shC.getRange(
      2,
      1,
      nbLignes,
      43
    ).getValues();

  // AP:AQ
  const backgrounds =
    shC.getRange(
      2,
      42,
      nbLignes,
      2
    ).getBackgrounds();


  // ============================================================
  // 2. DETECTER LES CLIENTS AP + AQ ROUGES
  // ============================================================

  const retenus = [];
  const codesRetenus = {};
  const sourcesAQ = {};


  for (let i = 0; i < data.length; i++) {

    const rougeAP =
      estRouge(backgrounds[i][0]);

    const rougeAQ =
      estRouge(backgrounds[i][1]);

    // Les DEUX doivent être rouges
    if (!rougeAP || !rougeAQ) {
      continue;
    }


    const code =
      String(data[i][0] || "").trim();       // A

    const client =
      String(data[i][2] || "").trim();       // C

    const rue =
      String(data[i][14] || "").trim();      // O

    const cp =
      String(data[i][17] || "").trim();      // R

    const ville =
      String(data[i][18] || "").trim();      // S

    const equipement =
      String(data[i][21] || "").trim();      // V

    const ap =
      data[i][41];                           // AP

    const aq =
      String(data[i][42] || "").trim();      // AQ


    if (!code || !client || !aq) {
      continue;
    }


    if (
      aq.toUpperCase().indexOf("SIMULATION") !== 0
    ) {
      continue;
    }


    // Pas deux fois le même code
    if (codesRetenus[code]) {
      continue;
    }

    codesRetenus[code] = true;


    const adresse =
      [rue, cp, ville]
        .filter(function(v) {
          return String(v || "").trim() !== "";
        })
        .join(" ")
        .trim();


    retenus.push({

      ligne: i + 2,

      code: code,

      client: client,

      equipement: equipement,

      nom:
        equipement
          ? client + " / " + equipement
          : client,

      adresse: adresse,

      ap: ap,

      aqSource: aq

    });


    sourcesAQ[
      normaliserAQ(aq)
    ] = aq;
  }


  // ============================================================
  // 3. CONTROLES
  // ============================================================

  if (!retenus.length) {

    ui.alert(
      "Fusion impossible",
      "Aucun client avec AP ET AQ rouges.",
      ui.ButtonSet.OK
    );

    return;
  }


  const listeSources =
    Object.keys(sourcesAQ);


  if (listeSources.length < 2) {

    ui.alert(
      "Fusion impossible",
      "Les clients retenus ne proviennent pas d'au moins deux simulations.",
      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // 4. CONFIRMATION
  // ============================================================

  const confirmation =
    ui.alert(
      "Fusion des simulations",

      retenus.length +
      " client(s) AP + AQ rouges ont été détectés.\n\n" +

      "Ces " +
      retenus.length +
      " clients seront TOUS conservés.\n\n" +

      "Simulations sources :\n\n" +
      listeSources
        .map(function(k) {
          return sourcesAQ[k];
        })
        .join("\n") +

      "\n\nTous les AUTRES clients de ces simulations auront AQ VIDE.\n\n" +

      "Continuer ?",

      ui.ButtonSet.YES_NO
    );


  if (confirmation !== ui.Button.YES) {
    return;
  }


  // ============================================================
  // 5. DATE DU JOUR
  // ============================================================

  const aujourdHui = new Date();

  aujourdHui.setHours(
    0,
    0,
    0,
    0
  );


  const tz =
    ss.getSpreadsheetTimeZone();


  const dateNom =
    Utilities.formatDate(
      aujourdHui,
      tz,
      "dd-MM-yyyy"
    );


  const dateAQ =
    Utilities.formatDate(
      aujourdHui,
      tz,
      "dd/MM/yyyy"
    );


  // ============================================================
  // 6. TROUVER LE NOM DE LA NOUVELLE SIMULATION
  // ============================================================

  const base =
    "simulationTournée_" +
    dateNom;


  let nomNouvelle =
    base;


  let numeroNouvelle =
    1;


  while (
    ss.getSheetByName(
      nomNouvelle
    )
  ) {

    numeroNouvelle++;

    nomNouvelle =
      base +
      "_" +
      numeroNouvelle;
  }


  const nouvelleValeurAQ =
    "SIMULATION " +
    dateAQ +
    " - " +
    numeroNouvelle;


  // ============================================================
  // 7. PREPARER PlanningFinale
  //
  // Aucun Google Maps.
  // Les clients restent dans l'ordre de Clients_traitement.
  // ============================================================

  const lastPlan =
    Math.max(
      shPlan.getLastRow(),
      2
    );


  shPlan
    .getRange(
      2,
      1,
      lastPlan - 1,
      23
    )
    .clearContent();


  shPlan
    .getRange("B2")
    .setValue(
      aujourdHui
    );


  retenus.forEach(function(c, index) {

    const ligne =
      index + 2;


    // D = Nom
    shPlan
      .getRange(
        ligne,
        4
      )
      .setValue(
        c.nom
      );


    // E = Code client
    shPlan
      .getRange(
        ligne,
        5
      )
      .setValue(
        c.code
      );


    // G = durée
    shPlan
      .getRange(
        ligne,
        7
      )
      .setValue(
        90
      );


    // H = adresse
    shPlan
      .getRange(
        ligne,
        8
      )
      .setValue(
        c.adresse
      );


    // K = date AP
    shPlan
      .getRange(
        ligne,
        11
      )
      .setValue(
        c.ap
      );

  });


  SpreadsheetApp.flush();


  // ============================================================
  // 8. CREER LA NOUVELLE FEUILLE
  // ============================================================

  const nouvelleFeuille =
    ss.insertSheet(
      nomNouvelle
    );


  const nbRowsCopie =
    Math.max(
      shPlan.getLastRow(),
      1
    );


  const nbColsCopie =
    Math.max(
      shPlan.getLastColumn(),
      1
    );


  // La feuille neuve n'a pas forcément autant de colonnes
  // que PlanningFinale : on l'étend avant la copie, sinon
  // "Those columns are out of bounds" sur le copyTo.
  assurerColonnes_(
    nouvelleFeuille,
    nbColsCopie
  );


  shPlan
    .getRange(
      1,
      1,
      nbRowsCopie,
      nbColsCopie
    )
    .copyTo(
      nouvelleFeuille
        .getRange(
          1,
          1,
          nbRowsCopie,
          nbColsCopie
        )
    );


  // Largeurs de colonnes
  for (
    let col = 1;
    col <= nbColsCopie;
    col++
  ) {

    nouvelleFeuille
      .setColumnWidth(
        col,
        shPlan.getColumnWidth(col)
      );
  }


  // Hauteurs des lignes
  for (
    let ligne = 1;
    ligne <= nbRowsCopie;
    ligne++
  ) {

    nouvelleFeuille
      .setRowHeight(
        ligne,
        shPlan.getRowHeight(ligne)
      );
  }


  SpreadsheetApp.flush();


  // ============================================================
  // 9. VERIFIER QUE LES CLIENTS DE LA NOUVELLE SIMULATION
  //    SONT EXACTEMENT LES CLIENTS RETENUS
  // ============================================================

  const codesNouvelle =
    nouvelleFeuille
      .getRange(
        2,
        5,
        retenus.length,
        1
      )
      .getValues()
      .map(function(ligne) {

        return String(
          ligne[0] || ""
        ).trim();

      })
      .filter(function(code) {

        return code !== "";

      });


  const ensembleNouvelle = {};


  codesNouvelle.forEach(function(code) {
    ensembleNouvelle[code] = true;
  });


  let controleCodesOK =
    codesNouvelle.length ===
    retenus.length;


  retenus.forEach(function(c) {

    if (!ensembleNouvelle[c.code]) {
      controleCodesOK = false;
    }

  });


  if (!controleCodesOK) {

    ss.deleteSheet(
      nouvelleFeuille
    );


    ui.alert(
      "Fusion annulée",

      "La nouvelle simulation ne contient pas exactement les " +
      retenus.length +
      " clients retenus.\n\n" +

      "Elle a été supprimée.\n" +
      "AQ n'a pas été modifié.",

      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // 10. PREPARER AQ
  // ============================================================

  const aqRange =
    shC.getRange(
      2,
      43,
      nbLignes,
      1
    );


  const valeursAQ =
    aqRange.getValues();


  const couleursAQ =
    aqRange.getBackgrounds();


  // Couleur pastel simple
  const palette = [
    "#fff2cc",
    "#d9ead3",
    "#d9eaf7",
    "#fce5cd",
    "#eadcf8",
    "#f4ddec"
  ];


  const couleurNouvelle =
    palette[
      (numeroNouvelle - 1) %
      palette.length
    ];


  // ============================================================
  // 11. VIDER AQ POUR TOUS LES CLIENTS
  //     DES SIMULATIONS SOURCES
  // ============================================================

  for (
    let i = 0;
    i < valeursAQ.length;
    i++
  ) {

    const valeurActuelle =
      normaliserAQ(
        valeursAQ[i][0]
      );


    if (
      sourcesAQ[
        valeurActuelle
      ]
    ) {

      valeursAQ[i][0] =
        "";

      couleursAQ[i][0] =
        "#ffffff";
    }
  }


  // ============================================================
  // 12. REAFFECTER UNIQUEMENT LES CLIENTS RETENUS
  // ============================================================

  retenus.forEach(function(c) {

    const index =
      c.ligne - 2;


    valeursAQ[index][0] =
      nouvelleValeurAQ;


    couleursAQ[index][0] =
      couleurNouvelle;

  });


  // ============================================================
  // 13. ECRIRE AQ EN UNE SEULE FOIS
  // ============================================================

  aqRange
    .setValues(
      valeursAQ
    );


  aqRange
    .setBackgrounds(
      couleursAQ
    );


  SpreadsheetApp.flush();


  // ============================================================
  // 14. CONTROLE FINAL AQ
  // ============================================================

  const aqControle =
    aqRange.getValues();


  let controleAQOK =
    true;


  for (
    let i = 0;
    i < aqControle.length;
    i++
  ) {

    const code =
      String(
        data[i][0] || ""
      ).trim();


    const aqAvant =
      normaliserAQ(
        data[i][42]
      );


    const aqApres =
      String(
        aqControle[i][0] || ""
      ).trim();


    // Client retenu :
    // doit avoir la nouvelle simulation
    if (
      codesRetenus[code]
    ) {

      if (
        aqApres !==
        nouvelleValeurAQ
      ) {

        controleAQOK =
          false;
      }

      continue;
    }


    // Client NON retenu appartenant
    // à une simulation source :
    // AQ doit être VIDE
    if (
      sourcesAQ[
        aqAvant
      ]
    ) {

      if (aqApres !== "") {

        controleAQOK =
          false;
      }
    }
  }


  if (!controleAQOK) {

    ui.alert(
      "ATTENTION",

      "La nouvelle simulation a été créée, " +
      "mais le contrôle final de AQ n'est pas conforme.\n\n" +

      "Les anciennes simulations NE SERONT PAS supprimées.",

      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // 15. RETIRER LE ROUGE DE AP DES CLIENTS RETENUS
  // ============================================================

  retenus.forEach(function(c) {

    shC
      .getRange(
        c.ligne,
        42
      )
      .setBackground(
        null
      );

  });


  SpreadsheetApp.flush();


  // ============================================================
  // 16. SUPPRIMER LES ANCIENNES FEUILLES SOURCES
  //
  // Une feuille déjà absente n'empêche pas la fusion.
  // ============================================================

  let nbSupprimees =
    0;


  listeSources.forEach(function(k) {

    const nomSource =
      etiquetteVersFeuille(
        sourcesAQ[k]
      );


    if (!nomSource) {
      return;
    }


    const shSource =
      ss.getSheetByName(
        nomSource
      );


    if (
      shSource &&
      shSource.getSheetId() !==
      nouvelleFeuille.getSheetId()
    ) {

      ss.deleteSheet(
        shSource
      );

      nbSupprimees++;
    }

  });


  SpreadsheetApp.flush();


  // ============================================================
  // 17. TERMINE
  // ============================================================

  nouvelleFeuille.activate();


  ui.alert(
    "Fusion terminée",

    "Nouvelle simulation :\n" +
    nomNouvelle +
    "\n\n" +

    "Clients fusionnés : " +
    retenus.length +
    "\n\n" +

    "Anciennes simulations supprimées : " +
    nbSupprimees +
    "\n\n" +

    "Tous les autres clients des simulations sources ont maintenant AQ vide.",

    ui.ButtonSet.OK
  );
}


// ============================================================================
// MEMOIRE / RESTAURATION DES COULEURS D'ORIGINE DE AP ET AQ
//
// Fonction autonome, à bascule :
// - Si aucune sauvegarde n'existe (colonne AS vide partout) : elle
//   sauvegarde les couleurs actuelles de AP et AQ dans AS (texte
//   "couleurAP|couleurAQ" + couleur de AS = couleur de AP), SAUF les
//   lignes déjà rouges (AP ou AQ), qui sont ignorées.
// - Si une sauvegarde existe déjà : elle propose à l'opérateur de
//   revenir aux couleurs d'origine (Oui/Non), et si Oui, restaure
//   AP et AQ puis vide la mémoire (AS).
//
// Appelée automatiquement en tout début de
// fusionnerSimulationsSelectionRouge().
// ============================================================================

function gererCouleurOrigineAPAQ() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  const shC = ss.getSheetByName("Clients_traitement");

  if (!shC) {
    ui.alert("Erreur", "Clients_traitement introuvable.", ui.ButtonSet.OK);
    return;
  }

  const lastRow = shC.getLastRow();
  if (lastRow < 2) return;

  const nbLignes = lastRow - 1;

  // AP = colonne 42, AQ = colonne 43, AS = colonne 45 (mémoire des couleurs)
  const COL_AP = 42;
  const COL_AQ = 43;
  const COL_AS = 45;

  function estRouge_(couleur) {
    couleur = String(couleur || "").trim().toLowerCase();
    const m = couleur.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
    if (!m) return false;

    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);

    return (
      r >= 170 &&
      g <= 100 &&
      b <= 100 &&
      r >= g + 80 &&
      r >= b + 80
    );
  }

  const valeursAS = shC.getRange(2, COL_AS, nbLignes, 1).getValues();

  // Y a-t-il déjà une sauvegarde en mémoire (AS non vide quelque part) ?
  let sauvegardeExistante = false;
  for (let i = 0; i < valeursAS.length; i++) {
    if (String(valeursAS[i][0] || "").trim() !== "") {
      sauvegardeExistante = true;
      break;
    }
  }

  if (!sauvegardeExistante) {
    // --- MODE SAUVEGARDE : couleurs actuelles de AP et AQ, SAUF le rouge ---
    const couleursAPAQ = shC.getRange(2, COL_AP, nbLignes, 2).getBackgrounds();

    const nouvellesAS = [];
    const couleursASVisuel = [];
    let nbSauvegardes = 0;
    let nbExclues = 0;

    for (let i = 0; i < couleursAPAQ.length; i++) {
      const couleurAP = couleursAPAQ[i][0] || "#ffffff";
      const couleurAQ = couleursAPAQ[i][1] || "#ffffff";

      if (estRouge_(couleurAP) || estRouge_(couleurAQ)) {
        // Ligne déjà rouge : on ne la sauvegarde pas.
        nouvellesAS.push([""]);
        couleursASVisuel.push([null]);
        nbExclues++;
        continue;
      }

      nouvellesAS.push([couleurAP + "|" + couleurAQ]);
      couleursASVisuel.push([couleurAP]);
      nbSauvegardes++;
    }

    shC.getRange(2, COL_AS, nbLignes, 1).setValues(nouvellesAS);
    shC.getRange(2, COL_AS, nbLignes, 1).setBackgrounds(couleursASVisuel);

    SpreadsheetApp.flush();

    ui.alert(
      "Couleurs sauvegardées",
      nbSauvegardes + " ligne(s) sauvegardée(s) en mémoire (colonne AS).\n" +
      nbExclues + " ligne(s) déjà rouges ont été ignorées (non sauvegardées).\n\n" +
      "Tu peux maintenant colorier tes sélections en rouge.",
      ui.ButtonSet.OK
    );

  } else {
    // --- MODE RESTAURATION : on propose de revenir aux couleurs d'origine ---
    const reponse = ui.alert(
      "Restauration des couleurs",
      "Une sauvegarde des couleurs d'origine de AP et AQ existe.\n\n" +
      "Veux-tu revenir à ces couleurs d'origine maintenant ?",
      ui.ButtonSet.YES_NO
    );

    if (reponse !== ui.Button.YES) return;

    const couleursAP = [];
    const couleursAQ = [];

    for (let i = 0; i < valeursAS.length; i++) {
      const memo = String(valeursAS[i][0] || "").trim();

      if (!memo) {
        couleursAP.push([null]);
        couleursAQ.push([null]);
        continue;
      }

      const parties = memo.split("|");
      couleursAP.push([parties[0] || "#ffffff"]);
      couleursAQ.push([parties[1] || "#ffffff"]);
    }

    shC.getRange(2, COL_AP, nbLignes, 1).setBackgrounds(couleursAP);
    shC.getRange(2, COL_AQ, nbLignes, 1).setBackgrounds(couleursAQ);

    // Vider la mémoire (texte + couleur) une fois restauré
    shC.getRange(2, COL_AS, nbLignes, 1).clearContent();
    shC.getRange(2, COL_AS, nbLignes, 1).setBackground(null);

    SpreadsheetApp.flush();

    ui.alert(
      "Couleurs restaurées",
      "Les couleurs d'origine de AP et AQ ont été rétablies.\n\n" +
      "La mémoire (colonne AS) a été vidée.",
      ui.ButtonSet.OK
    );
  }
}
