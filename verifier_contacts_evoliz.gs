/**
 * Vérifie que chaque client de PlanningFinale a bien un email et un
 * téléphone renseignés côté Evoliz, et écrit le résultat en colonne Q
 * (et non plus en colonne F, qui est utilisée par phase1_Planning() pour
 * les messages d'horaire — les deux fonctions écrivaient auparavant dans
 * la même colonne F, et verifierContactsEvolizDansPlanning() effaçait
 * systématiquement les messages d'horaire dès qu'un client avait un
 * email et un téléphone valides).
 */
function verifierContactsEvolizDansPlanning() {

  const ss =
    SpreadsheetApp.getActive();

  const ui =
    SpreadsheetApp.getUi();

  const shPlan =
    ss.getSheetByName(
      "PlanningFinale"
    );

  if (!shPlan) {

    ui.alert(
      "Erreur",
      "La feuille PlanningFinale est introuvable.",
      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // RECHERCHE AUTOMATIQUE DU FICHIER EVOLIZ
  // ============================================================

  const ID_DOSSIER_EVOLIZ =
    "10QzuJ3e9MCItsPLAus4izmRaBLAVuXW8";

  const RACINE_NOM_FICHIER =
    "evoliz_Contact_Client";

  const dossier =
    DriveApp.getFolderById(
      ID_DOSSIER_EVOLIZ
    );

  const fichiers =
    dossier.getFiles();

  let fichierEvoliz = null;
  let datePlusRecente = null;


  // Chercher tous les fichiers dont le nom commence par
  // evoliz_Contact_Client
  //
  // S'il y en a plusieurs, prendre le plus récent.

  while (fichiers.hasNext()) {

    const fichier =
      fichiers.next();

    const nom =
      fichier.getName();

    if (
      nom.indexOf(
        RACINE_NOM_FICHIER
      ) === 0
    ) {

      const dateModification =
        fichier.getLastUpdated();

      if (
        fichierEvoliz === null ||
        dateModification > datePlusRecente
      ) {

        fichierEvoliz =
          fichier;

        datePlusRecente =
          dateModification;
      }
    }
  }


  // Aucun fichier trouvé
  if (!fichierEvoliz) {

    ui.alert(
      "Erreur",
      "Aucun fichier commençant par evoliz_Contact_Client n'a été trouvé dans le dossier.",
      ui.ButtonSet.OK
    );

    return;
  }


  // Ouvrir automatiquement le fichier trouvé
  const ssEvoliz =
    SpreadsheetApp.openById(
      fichierEvoliz.getId()
    );


  // Chercher la feuille qui, elle, ne change jamais
  const shEvoliz =
    ssEvoliz.getSheetByName(
      "Evoliz.com"
    );


  if (!shEvoliz) {

    ui.alert(
      "Erreur",
      "Le fichier " +
      fichierEvoliz.getName() +
      " ne contient pas la feuille Evoliz.com.",
      ui.ButtonSet.OK
    );

    return;
  }


  // ============================================================
  // LECTURE EVOLIZ A:L
  // ============================================================

  const lastEvoliz =
    shEvoliz.getLastRow();


  if (lastEvoliz < 2) {

    ui.alert(
      "Erreur",
      "La feuille Evoliz.com ne contient aucun client.",
      ui.ButtonSet.OK
    );

    return;
  }


  const dataEvoliz =
    shEvoliz.getRange(
      2,
      1,
      lastEvoliz - 1,
      12
    ).getValues();


  // ============================================================
  // INDEX PAR CODE CLIENT + PAR NOM
  // ============================================================

  const parCode = {};
  const parNom = {};


  dataEvoliz.forEach(
    function(ligne) {

      // A
      const nom =
        String(
          ligne[0] || ""
        )
          .trim()
          .toLowerCase();


      // B
      const code =
        String(
          ligne[1] || ""
        )
          .trim()
          .toLowerCase();


      // F
      const email =
        String(
          ligne[5] || ""
        ).trim();


      // J
      const telJ =
        String(
          ligne[9] || ""
        ).trim();


      // L
      const telL =
        String(
          ligne[11] || ""
        ).trim();


      const fiche = {

        nom:
          nom,

        code:
          code,

        email:
          email,

        telJ:
          telJ,

        telL:
          telL
      };


      if (code) {

        parCode[code] =
          fiche;
      }


      if (nom) {

        parNom[nom] =
          fiche;
      }
    }
  );


  // ============================================================
  // LECTURE PlanningFinale
  //
  // D = nom
  // E = code
  // ============================================================

  const lastPlan =
    shPlan.getLastRow();


  if (lastPlan < 2) {

    ui.alert(
      "PlanningFinale est vide."
    );

    return;
  }


  const dataPlan =
    shPlan.getRange(
      2,
      4,
      lastPlan - 1,
      2
    ).getValues();


  const sorties = [];


  let nbEmailManquant =
    0;

  let nbTelManquant =
    0;

  let nbIntrouvable =
    0;


  // ============================================================
  // CONTROLE
  // ============================================================

  dataPlan.forEach(
    function(ligne) {

      const nomOriginal =
        String(
          ligne[0] || ""
        ).trim();


      const codeOriginal =
        String(
          ligne[1] || ""
        ).trim();


      const nom =
        nomOriginal.toLowerCase();


      const code =
        codeOriginal.toLowerCase();


      // Ligne sans client
      if (
        !nomOriginal &&
        !codeOriginal
      ) {

        sorties.push([
          ""
        ]);

        return;
      }


      // ========================================================
      // RECHERCHE D'ABORD PAR CODE CLIENT
      // ========================================================

      let fiche =
        code
          ? parCode[code]
          : null;


      // ========================================================
      // SINON PAR NOM
      // ========================================================

      if (
        !fiche &&
        nom
      ) {

        fiche =
          parNom[nom];
      }


      // ========================================================
      // CLIENT INTROUVABLE
      // ========================================================

      if (!fiche) {

        sorties.push([
          "❌ Client introuvable dans Evoliz"
        ]);

        nbIntrouvable++;

        return;
      }


      // ========================================================
      // EMAIL
      // ========================================================

      const emailOK =
        fiche.email !== "";


      // ========================================================
      // TELEPHONE :
      // J OU L suffit
      // ========================================================

      const telephoneOK =
        fiche.telJ !== "" ||
        fiche.telL !== "";


      // ========================================================
      // RESULTAT
      // ========================================================

      if (
        emailOK &&
        telephoneOK
      ) {

        sorties.push([
          ""
        ]);

        return;
      }


      if (
        !emailOK &&
        !telephoneOK
      ) {

        sorties.push([
          "⚠️ Email + téléphone manquants"
        ]);

        nbEmailManquant++;
        nbTelManquant++;

        return;
      }


      if (!emailOK) {

        sorties.push([
          "⚠️ Email manquant"
        ]);

        nbEmailManquant++;

        return;
      }


      if (!telephoneOK) {

        sorties.push([
          "⚠️ Téléphone manquant"
        ]);

        nbTelManquant++;

        return;
      }
    }
  );


  // ============================================================
  // ECRITURE COLONNE Q
  // ============================================================

  shPlan
    .getRange(
      2,
      17,
      sorties.length,
      1
    )
    .setValues(
      sorties
    );


  SpreadsheetApp.flush();


  // ============================================================
  // RESULTAT
  // ============================================================

  ui.alert(

    "✅ Contrôle Evoliz terminé",

    "Email manquant : " +
    nbEmailManquant +
    "\n" +

    "Téléphone manquant : " +
    nbTelManquant +
    "\n" +

    "Client introuvable : " +
    nbIntrouvable,

    ui.ButtonSet.OK

  );
}
