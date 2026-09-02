// ============================================================================
// FUSION DE SIMULATIONS V6.4 - VERSION CORRIGEE
//
// PRINCIPE :
// - AP rouge + AQ rouge = client retenu pour la fusion
// - on NE déduit PLUS le nom de la feuille depuis le texte AQ
// - on retrouve directement la vraie feuille grâce au CODE CLIENT
//   présent en colonne E des feuilles simulationTournée_...
//
// SECURITE :
// - aucune ancienne feuille n'est supprimée avant création + contrôle
// - les clients retenus reçoivent la nouvelle simulation dans AQ
// - les clients non retenus appartenant aux simulations fusionnées ont AQ vide
// ============================================================================


function fusionnerSimulationsSelectionRouge() {
SpreadsheetApp.getUi().alert("TEST : la fonction de fusion démarre bien");
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();

  const shC = ss.getSheetByName("Clients_traitement");
  const shPlan = ss.getSheetByName("PlanningFinale");
  const shP = ss.getSheetByName("Paramètres");

  if (!shC || !shPlan || !shP) {
    ui.alert(
      "Erreur",
      "Clients_traitement, PlanningFinale ou Paramètres est introuvable.",
      ui.ButtonSet.OK
    );
    return;
  }


  // ============================================================
  // 1. LIRE CLIENTS_TRAITEMENT
  // ============================================================

  const lastRow = shC.getLastRow();

  if (lastRow < 2) {
    ui.alert("Fusion", "Aucun client trouvé.", ui.ButtonSet.OK);
    return;
  }

  const nbLignes = lastRow - 1;

  // A:AQ
  const data = shC.getRange(
    2,
    1,
    nbLignes,
    43
  ).getValues();

  // Couleurs AP:AQ
  const couleurs = shC.getRange(
    2,
    42,
    nbLignes,
    2
  ).getBackgrounds();


  // ============================================================
  // 2. SELECTION = UNIQUEMENT AP ROUGE + AQ ROUGE
  // ============================================================

  const clientsSelectionnes = [];
  const codesSelectionnes = {};
  const etiquettesSources = {};


  for (let i = 0; i < data.length; i++) {

    const couleurAP =
      normaliserCouleurFusion_(couleurs[i][0]);

    const couleurAQ =
      normaliserCouleurFusion_(couleurs[i][1]);


    // SEULE REGLE DE SELECTION
    if (
      !estRougeFusion_(couleurAP) ||
      !estRougeFusion_(couleurAQ)
    ) {
      continue;
    }


    const codeClient =
      String(data[i][0] || "").trim();       // A

    const nomClient =
      String(data[i][2] || "").trim();       // C

    const rue =
      String(data[i][14] || "").trim();      // O

    const cp =
      nettoyerCPV6_(data[i][17]);            // R

    const ville =
      String(data[i][18] || "").trim();      // S

    const typeClient =
      String(data[i][21] || "").trim();      // V

    const ap =
      toDateOnly_(data[i][41]);              // AP

    const aqOriginal =
      String(data[i][42] || "").trim();      // AQ


    /*
     * Une ligne AP+AQ rouge doit pouvoir être transformée
     * en client de simulation.
     *
     * Si une donnée indispensable manque, on n'ignore PAS
     * silencieusement le client : on arrête plus bas.
     */

    const adresse =
      [
        rue,
        cp,
        ville
      ]
      .filter(function(v) {
        return String(v || "").trim() !== "";
      })
      .join(" ")
      .trim();


    const dep =
      cp ? extraireDepCPV6_(cp) : "";


    const nom =
      [
        nomClient,
        typeClient
      ]
      .filter(function(v) {
        return String(v || "").trim() !== "";
      })
      .join(" / ");


    clientsSelectionnes.push({

      sourceRow: i + 2,

      codeClient: codeClient,

      nom: nom,

      nomClient: nomClient,

      typeClient: typeClient,

      adresse: adresse,

      cp: cp,

      ville: ville,

      dep: dep,

      ap: ap,

      aqOriginal: aqOriginal

    });


    // AQ nous donne DIRECTEMENT la simulation source
    if (aqOriginal) {
      etiquettesSources[aqOriginal] = true;
    }
  }


  // ============================================================
  // 3. AUCUNE SELECTION
  // ============================================================

  if (!clientsSelectionnes.length) {

    ui.alert(
      "Fusion impossible",
      "Aucune ligne avec AP ET AQ rouges n'a été trouvée.",
      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // 4. CONTROLE STRICT DES CLIENTS ROUGES
  //
  // IMPORTANT :
  // ON NE SUPPRIME JAMAIS SILENCIEUSEMENT UNE LIGNE ROUGE.
  // ============================================================

  const erreurs = [];


  clientsSelectionnes.forEach(function(c) {

    const manques = [];

    if (!c.codeClient) {
      manques.push("code client A");
    }

    if (!c.nomClient) {
      manques.push("nom client C");
    }

    if (!c.cp) {
      manques.push("code postal R");
    }

    if (!c.adresse) {
      manques.push("adresse");
    }

    if (!c.ap) {
      manques.push("date AP");
    }

    if (!c.aqOriginal) {
      manques.push("simulation source AQ");
    }

    if (
      c.aqOriginal &&
      c.aqOriginal.toLowerCase().indexOf("simulation") !== 0
    ) {
      manques.push("AQ n'est pas une simulation");
    }


    if (manques.length) {

      erreurs.push(
        "Ligne " +
        c.sourceRow +
        " - " +
        (c.nomClient || c.codeClient || "client") +
        " : " +
        manques.join(", ")
      );
    }
  });


  if (erreurs.length) {

    ui.alert(
      "Fusion annulée",
      clientsSelectionnes.length +
      " ligne(s) AP+AQ rouges ont été détectées.\n\n" +
      "Mais certaines contiennent une donnée indispensable incorrecte :\n\n" +
      erreurs.join("\n") +
      "\n\nAUCUNE modification n'a été effectuée.",
      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // 5. CONTROLE DES DOUBLONS
  // ============================================================

  const doublons = [];


  clientsSelectionnes.forEach(function(c) {

    if (codesSelectionnes[c.codeClient]) {

      doublons.push(
        c.codeClient +
        " - " +
        c.nomClient
      );

    } else {

      codesSelectionnes[c.codeClient] = true;
    }
  });


  if (doublons.length) {

    ui.alert(
      "Fusion annulée",
      "Des codes clients sont présents plusieurs fois dans la sélection rouge :\n\n" +
      doublons.join("\n") +
      "\n\nAUCUNE modification n'a été effectuée.",
      ui.ButtonSet.OK
    );

    return;
  }


    // ============================================================
  // 6. IDENTIFIER LES SIMULATIONS SOURCES A PARTIR DE AQ
  //
  // AQ EST LA REFERENCE.
  // SI UNE ANCIENNE FEUILLE N'EXISTE PLUS,
  // CELA NE BLOQUE PAS LA FUSION.
  // ============================================================

  const feuillesSources = [];
  const nomsSources = [];

  const etiquettesSourcesListe =
    Object.keys(etiquettesSources);


  // Il faut au moins 2 simulations indiquées dans AQ
  if (etiquettesSourcesListe.length < 2) {

    ui.alert(
      "Fusion impossible",
      "Les cellules AP+AQ rouges appartiennent à moins de deux simulations sources.",
      ui.ButtonSet.OK
    );

    return;
  }


  etiquettesSourcesListe.forEach(function(etiquette) {

    const nomFeuille =
      convertirEtiquetteAQVersNomFeuilleFusion_(etiquette);

    nomsSources.push(nomFeuille);


    // Si la feuille existe encore, on la mémorise
    // pour la supprimer à la toute fin.
    const sh =
      ss.getSheetByName(nomFeuille);

    if (sh) {
      feuillesSources.push(sh);
    }
  });
  // ============================================================
  // 7. CONFIRMATION
  // ============================================================

  const confirmation = ui.alert(

    "Fusion des simulations",

    clientsSelectionnes.length +
    " CLIENT(S) AP + AQ ROUGES ONT ETE DETECTES.\n\n" +

    "Ces " +
    clientsSelectionnes.length +
    " clients seront TOUS placés dans la nouvelle simulation.\n\n" +

    "Simulations sources :\n\n" +
    nomsSources.join("\n") +

    "\n\nAucun client rouge ne sera volontairement éliminé.\n\n" +

    "Continuer ?",

    ui.ButtonSet.YES_NO
  );


  if (confirmation !== ui.Button.YES) {
    return;
  }


  // ============================================================
  // 8. DATE DE LA NOUVELLE SIMULATION
  // ============================================================

  const dateJour = new Date();

  dateJour.setHours(0, 0, 0, 0);


  // ============================================================
  // 9. CALCUL GOOGLE
  // ============================================================

  const depOrigine =
    normaliserDepV6_(
      shP.getRange("B12").getValue()
    );


  if (!depOrigine) {

    ui.alert(
      "Fusion annulée",
      "Paramètres!B12 ne contient pas le département de départ.",
      ui.ButtonSet.OK
    );

    return;
  }


  const origineGoogle =
    depOrigine + ", France";


  const route =
    calculerRouteV6_(
      origineGoogle,
      clientsSelectionnes
    );


  if (!route) {

    ui.alert(
      "Fusion annulée",
      "Google Maps n'a pas pu calculer l'itinéraire.\n\n" +
      "Aucune simulation source n'a été supprimée.",
      ui.ButtonSet.OK
    );

    return;
  }


  const clientsOrdonnes =
    appliquerOrdreGoogleV6_(
      clientsSelectionnes,
      route.ordre
    );


  // SECURITE ABSOLUE
  if (
    clientsOrdonnes.length !==
    clientsSelectionnes.length
  ) {

    ui.alert(
      "Fusion annulée",
      clientsSelectionnes.length +
      " clients ont été sélectionnés mais seulement " +
      clientsOrdonnes.length +
      " sont revenus du calcul Google.\n\n" +
      "AUCUNE modification n'a été effectuée.",
      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // 10. ECRIRE LES CLIENTS DANS PLANNINGFINALE
  // ============================================================

  ecrireSelectionV6_(
    shPlan,
    shP,
    clientsOrdonnes,
    dateJour
  );


  SpreadsheetApp.flush();


  // ============================================================
  // 11. CONTROLE IMMEDIAT DE PLANNINGFINALE
  //
  // N ROUGES = N CLIENTS DANS PLANNINGFINALE
  // ============================================================

  const codesPlanning = {};


  const valeursPlanning =
    shPlan.getRange(
      2,
      5,
      clientsSelectionnes.length,
      1
    ).getValues();


  valeursPlanning.forEach(function(ligne) {

    const code =
      String(ligne[0] || "").trim();

    if (code) {
      codesPlanning[code] = true;
    }
  });


  const manquantsPlanning =
    clientsSelectionnes.filter(function(c) {

      return !codesPlanning[c.codeClient];
    });


  if (
    manquantsPlanning.length ||
    Object.keys(codesPlanning).length !==
      clientsSelectionnes.length
  ) {

    ui.alert(
      "Fusion annulée",
      "CONTROLE DE SECURITE ECHEC.\n\n" +
      "Clients rouges : " +
      clientsSelectionnes.length +
      "\n" +
      "Clients écrits dans PlanningFinale : " +
      Object.keys(codesPlanning).length +
      "\n\n" +
      "Aucune ancienne simulation n'a été supprimée.",
      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // 12. CREER LA NOUVELLE SIMULATION
  // ============================================================

  const nomNouvelleFeuille =
    archiverPlanningSimulationV6_(
      ss,
      shPlan,
      dateJour
    );


  const nouvelleFeuille =
    ss.getSheetByName(nomNouvelleFeuille);


  if (!nouvelleFeuille) {

    ui.alert(
      "ERREUR",
      "La nouvelle simulation n'a pas été créée.\n\n" +
      "Les anciennes simulations sont conservées.",
      ui.ButtonSet.OK
    );

    return;
  }


  SpreadsheetApp.flush();


  // ============================================================
  // 13. CONTROLE ABSOLU DE LA NOUVELLE FEUILLE
  //
  // ON COMPARE EXACTEMENT LES CODES.
  // ============================================================

  const codesNouvelle = {};


  const lastNouvelle =
    nouvelleFeuille.getLastRow();


  if (lastNouvelle >= 2) {

    const valeurs =
      nouvelleFeuille.getRange(
        2,
        5,
        lastNouvelle - 1,
        1
      ).getValues();


    valeurs.forEach(function(ligne) {

      const code =
        String(ligne[0] || "").trim();

      if (code) {
        codesNouvelle[code] = true;
      }
    });
  }


  const codesAttendus =
    clientsSelectionnes.map(function(c) {
      return c.codeClient;
    });


  const codesManquants =
    codesAttendus.filter(function(code) {
      return !codesNouvelle[code];
    });


  const codesEnTrop =
    Object.keys(codesNouvelle).filter(function(code) {
      return !codesSelectionnes[code];
    });


  if (
    codesManquants.length ||
    codesEnTrop.length ||
    Object.keys(codesNouvelle).length !==
      clientsSelectionnes.length
  ) {

    ss.deleteSheet(nouvelleFeuille);

    ui.alert(
      "Fusion annulée",

      "CONTROLE DE SECURITE ECHEC.\n\n" +

      "Clients AP+AQ rouges : " +
      clientsSelectionnes.length +

      "\nClients trouvés dans la nouvelle simulation : " +
      Object.keys(codesNouvelle).length +

      "\n\nLa nouvelle feuille incorrecte a été supprimée." +

      "\nLes anciennes simulations sont conservées." +

      "\nAQ n'a pas été modifié.",

      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // 14. NOUVELLE ETIQUETTE AQ
  // ============================================================

  const etiquetteNouvelleAQ =
    convertirNomFeuilleVersEtiquetteAQFusion_(
      nomNouvelleFeuille
    );


  // Le numéro de simulation est porté par l'étiquette elle-même
  // ("SIMULATION jj/mm/aaaa - N") : on ne peut pas s'en passer,
  // sinon "numero" est indéfini plus bas (bug V6.4 corrigé ici).
  const matchNumeroAQ =
    etiquetteNouvelleAQ.match(/-\s*(\d+)\s*$/);

  const numero =
    matchNumeroAQ ? parseInt(matchNumeroAQ[1], 10) : 1;


  const palette = [
  "#fff2cc",
  "#d9ead3",
  "#fce5cd",
  "#d9eaf7",
  "#eadcf8",
  "#d0e0e3"
];

const couleurNouvelle =
  palette[(numero - 1) % palette.length];


  // ============================================================
  // 15. VIDER AQ DES CLIENTS DES SIMULATIONS SOURCES
  //
  // IMPORTANT :
  // ON SE BASE SUR LE TEXTE AQ.
  // ON NE RECHERCHE PAS LES CLIENTS DANS LES ANCIENNES FEUILLES.
  // ============================================================

  const sourcesNormalisees = {};


  Object.keys(etiquettesSources).forEach(function(v) {

    sourcesNormalisees[
      String(v).trim().toLowerCase()
    ] = true;
  });


  for (let i = 0; i < data.length; i++) {

    const aqActuel =
      String(data[i][42] || "")
        .trim();

    if (!aqActuel) {
      continue;
    }


    if (
      !sourcesNormalisees[
        aqActuel.toLowerCase()
      ]
    ) {
      continue;
    }


    // Tous les clients appartenant aux anciennes
    // simulations sont d'abord libérés.
    shC
      .getRange(i + 2, 43)
      .clearContent()
      .setBackground(null)
      .setFontColor("#000000");
  }


  // ============================================================
  // 16. REAFFECTER LES CLIENTS RETENUS
  // ============================================================

  clientsSelectionnes.forEach(function(c) {

    // Nouvelle simulation dans AQ
    shC
      .getRange(c.sourceRow, 43)
      .setValue(etiquetteNouvelleAQ)
      .setBackground(couleurNouvelle)
      .setFontColor("#000000");


    // Enlever le rouge de AP
    shC
      .getRange(c.sourceRow, 42)
      .setBackground(null);
  });


  SpreadsheetApp.flush();


  // ============================================================
  // 17. VERIFICATION AQ DES CLIENTS RETENUS
  // ============================================================

  const erreursAQ = [];


  clientsSelectionnes.forEach(function(c) {

    const valeur =
      String(
        shC
          .getRange(c.sourceRow, 43)
          .getValue() || ""
      ).trim();


    if (valeur !== etiquetteNouvelleAQ) {

      erreursAQ.push(
        c.codeClient +
        " - " +
        c.nomClient
      );
    }
  });


  if (erreursAQ.length) {

    ui.alert(
      "ATTENTION",

      "La nouvelle simulation a été créée mais AQ n'est pas conforme pour certains clients.\n\n" +

      erreursAQ.join("\n") +

      "\n\nPAR SECURITE, les anciennes simulations n'ont PAS été supprimées.",

      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // 18. DERNIER CONTROLE AVANT SUPPRESSION
  // ============================================================

  if (
    Object.keys(codesNouvelle).length !==
    clientsSelectionnes.length
  ) {

    ui.alert(
      "SECURITE",

      "Le nombre de clients de la nouvelle simulation ne correspond plus au nombre sélectionné.\n\n" +

      "Les anciennes simulations NE SONT PAS supprimées.",

      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // 19. SUPPRIMER LES ANCIENNES SIMULATIONS
  //
  // C'EST LA TOUTE DERNIERE OPERATION.
  // ============================================================

  feuillesSources.forEach(function(sh) {

    if (
      sh.getSheetId() !==
      nouvelleFeuille.getSheetId()
    ) {

      ss.deleteSheet(sh);
    }
  });


  SpreadsheetApp.flush();


  // ============================================================
  // 20. TERMINE
  // ============================================================

  nouvelleFeuille.activate();


  ui.alert(

    "Fusion terminée",

    "Nouvelle simulation :\n" +
    nomNouvelleFeuille +

    "\n\nClients AP+AQ rouges détectés : " +
    clientsSelectionnes.length +

    "\nClients présents dans la nouvelle simulation : " +
    Object.keys(codesNouvelle).length +

    "\n\nAnciennes simulations supprimées : " +
    feuillesSources.length +

    "\n\nLes clients retenus sont affectés à la nouvelle simulation." +

    "\nLes autres clients des simulations sources ont maintenant AQ vide.",

    ui.ButtonSet.OK
  );
}
function normaliserCouleurFusion_(couleur) {

  return String(couleur || "")
    .trim()
    .toLowerCase();
}


function estRougeFusion_(couleur) {

  couleur = normaliserCouleurFusion_(couleur);

  // Format attendu : #rrggbb
  const match = couleur.match(
    /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/
  );

  if (!match) {
    return false;
  }

  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);

  // Rouge suffisamment marqué
  return (
    r >= 170 &&
    g <= 100 &&
    b <= 100 &&
    r >= g + 80 &&
    r >= b + 80
  );
}

function convertirEtiquetteAQVersNomFeuilleFusion_(etiquette) {

  const match = String(etiquette || "")
    .trim()
    .match(
      /^SIMULATION\s+(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d+)$/i
    );

  if (!match) {
    throw new Error(
      "Etiquette AQ invalide : " + etiquette
    );
  }

  const numero = parseInt(match[4], 10);

  const base =
    "simulationTournée_" +
    match[1] + "-" +
    match[2] + "-" +
    match[3];

  // SIMULATION xx/xx/xxxx - 1
  // correspond à la feuille sans suffixe _1
  if (numero === 1) {
    return base;
  }

  // SIMULATION xx/xx/xxxx - 2 → ..._2
  // SIMULATION xx/xx/xxxx - 3 → ..._3
  return base + "_" + numero;
}
function convertirNomFeuilleVersEtiquetteAQFusion_(nomFeuille) {

  const match = String(nomFeuille || "")
    .trim()
    .match(
      /^simulationTournée_(\d{2})-(\d{2})-(\d{4})(?:_(\d+))?$/i
    );

  if (!match) {
    throw new Error(
      "Nom de feuille simulation invalide : " + nomFeuille
    );
  }

  const jour = match[1];
  const mois = match[2];
  const annee = match[3];

  // Pas de suffixe = simulation n°1
  const numero = match[4]
    ? parseInt(match[4], 10)
    : 1;

  return (
    "SIMULATION " +
    jour + "/" +
    mois + "/" +
    annee +
    " - " +
    numero
  );
}
