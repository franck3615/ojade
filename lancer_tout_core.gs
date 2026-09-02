function lancerTout_core() {

  // ==========================================================
  // NETTOYAGE AUTOMATIQUE, ICI, AVANT TOUT LE RESTE.
  // lancerTout_core() est le point de passage obligé de la
  // Phase B (avec ou sans passage par l'agenda), donc c'est
  // ici qu'il faut nettoyer pour être sûr que ça tourne avant
  // phase1_Planning(), quel que soit le chemin emprunté.
  // ==========================================================
  nettoyerResidusPlanningFinale_();

  const ui = getUiSafe_();
  const lignesAdressesVidees = nettoyerAdressesInvalidesPlanningFinale_();

  if (ui && lignesAdressesVidees.length) {
    ui.alert(
      "Adresses invalides vidées",
      "Ces lignes avaient une adresse sans aucun chiffre (donc pas une " +
      "vraie adresse) — elles ont été vidées automatiquement :\n\n" +
      lignesAdressesVidees.join("\n") +
      "\n\nComplète-les avec une vraie adresse avant de relancer.",
      ui.ButtonSet.OK
    );
  }

  const ok = phase1_Planning();
  if (!ok) return;
  phase2_Calcul();
  signalerIncoherencesPlanning();
}
