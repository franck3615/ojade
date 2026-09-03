/**
 * Calcule un numéro d'étape équilibré (aller / retour) pour chaque client de
 * PlanningFinale, à partir du code postal contenu dans l'adresse complète
 * (colonne H), et l'écrit en colonne K.
 *
 * Méthode :
 *  1. Le code postal est extrait de l'adresse (colonne H) par expression
 *     régulière.
 *  2. Chaque code postal est géocodé via l'API officielle gratuite
 *     geo.api.gouv.fr (pas de clé nécessaire).
 *  3. La distance à vol d'oiseau entre le dépôt et chaque client est
 *     calculée.
 *  4. Les clients sont triés par distance croissante puis coupés en deux au
 *     milieu : la moitié la plus éloignée forme l'ALLER (numérotée du plus
 *     proche du milieu jusqu'au point le plus éloigné, qui sert de
 *     retournement), la moitié la plus proche forme le RETOUR (numérotée en
 *     sens inverse, du milieu jusqu'au plus proche du dépôt).
 *
 * Trie ensuite la colonne K (ordre croissant) pour obtenir l'ordre de visite.
 */
function calculerEtapesTourneeAllerRetour() {
  // Coordonnées du dépôt (Nanterre, 92000) — à adapter si le point de départ
  // réel est différent.
  const DEPOT_LAT = 48.8924;
  const DEPOT_LON = 2.2065;

  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  const shPlan = ss.getSheetByName('PlanningFinale');

  if (!shPlan) {
    ui.alert(
      'Erreur',
      'La feuille PlanningFinale est introuvable.',
      ui.ButtonSet.OK
    );
    return;
  }

  const lastPlan = shPlan.getLastRow();

  if (lastPlan < 2) {
    ui.alert('PlanningFinale est vide.');
    return;
  }

  const nbLignes = lastPlan - 1;

  // D = nom, H = adresse complète (contient le code postal)
  const noms = shPlan.getRange(2, 4, nbLignes, 1).getValues();
  const adresses = shPlan.getRange(2, 8, nbLignes, 1).getValues();

  const lignes = [];
  const codesPostauxUniques = {};

  for (let i = 0; i < nbLignes; i++) {
    const nom = String(noms[i][0] || '').trim();
    const adresse = String(adresses[i][0] || '').trim();

    // Ligne sans client
    if (!nom && !adresse) {
      continue;
    }

    const correspondance = adresse.match(/\b(\d{5})\b/);
    const codePostal = correspondance ? correspondance[1] : '';

    lignes.push({
      index: i,
      codePostal: codePostal
    });

    if (codePostal) {
      codesPostauxUniques[codePostal] = true;
    }
  }

  const coordonnees = geocoderCodesPostaux_(Object.keys(codesPostauxUniques));

  const valides = [];
  let nbAdresseInvalide = 0;

  lignes.forEach(function(ligne) {
    const coord = ligne.codePostal ? coordonnees[ligne.codePostal] : null;

    if (!coord) {
      nbAdresseInvalide++;
      return;
    }

    valides.push({
      index: ligne.index,
      distance: distanceKm_(DEPOT_LAT, DEPOT_LON, coord.lat, coord.lon)
    });
  });

  // Tri par distance croissante au dépôt
  valides.sort(function(a, b) {
    return a.distance - b.distance;
  });

  const milieu = Math.ceil(valides.length / 2);

  // Moitié proche du dépôt -> RETOUR, parcourue en s'éloignant du dépôt
  // puis inversée pour se terminer au plus proche (dernier arrêt avant
  // l'arrivée).
  const groupeRetour = valides.slice(0, milieu).reverse();

  // Moitié éloignée -> ALLER, du plus proche du milieu jusqu'au point de
  // retournement (le plus éloigné du dépôt).
  const groupeAller = valides.slice(milieu);

  const ordreFinal = groupeAller.concat(groupeRetour);

  // On réécrit toute la colonne K pour ne pas garder d'anciens numéros.
  const sorties = [];
  for (let i = 0; i < nbLignes; i++) {
    sorties.push(['']);
  }

  ordreFinal.forEach(function(item, position) {
    sorties[item.index] = [position + 1];
  });

  shPlan.getRange(2, 11, nbLignes, 1).setValues(sorties);
  SpreadsheetApp.flush();

  ui.alert(
    '✅ Étapes calculées',
    'Étapes numérotées : ' + ordreFinal.length + '\n' +
    '  - Aller : ' + groupeAller.length + '\n' +
    '  - Retour : ' + groupeRetour.length + '\n' +
    'Adresses non géolocalisées (colonne K laissée vide) : ' + nbAdresseInvalide + '\n\n' +
    'Trie ensuite la colonne K (ordre croissant) pour obtenir l\'ordre de visite.',
    ui.ButtonSet.OK
  );
}


/**
 * Géocode une liste de codes postaux via l'API officielle geo.api.gouv.fr.
 * Renvoie un objet { codePostal: { lat, lon } }. Les résultats sont mis en
 * cache (6h) pour éviter de refaire les mêmes appels à chaque exécution.
 */
function geocoderCodesPostaux_(codesPostaux) {
  const cache = CacheService.getScriptCache();
  const resultats = {};
  const aRecuperer = [];

  codesPostaux.forEach(function(cp) {
    const enCache = cache.get('cp_' + cp);

    if (enCache) {
      const parties = enCache.split(',');
      resultats[cp] = {
        lat: Number(parties[0]),
        lon: Number(parties[1])
      };
    } else {
      aRecuperer.push(cp);
    }
  });

  if (aRecuperer.length === 0) {
    return resultats;
  }

  const requetes = aRecuperer.map(function(cp) {
    return {
      url: 'https://geo.api.gouv.fr/communes?codePostal=' +
        encodeURIComponent(cp) + '&fields=centre&format=json',
      muteHttpExceptions: true
    };
  });

  const reponses = UrlFetchApp.fetchAll(requetes);

  reponses.forEach(function(reponse, i) {
    const cp = aRecuperer[i];

    if (reponse.getResponseCode() !== 200) {
      return;
    }

    let communes;

    try {
      communes = JSON.parse(reponse.getContentText());
    } catch (e) {
      return;
    }

    const points = communes
      .filter(function(c) {
        return c.centre && c.centre.coordinates;
      })
      .map(function(c) {
        return c.centre.coordinates; // [lon, lat]
      });

    if (points.length === 0) {
      return;
    }

    const lon = points.reduce(function(s, p) { return s + p[0]; }, 0) / points.length;
    const lat = points.reduce(function(s, p) { return s + p[1]; }, 0) / points.length;

    resultats[cp] = { lat: lat, lon: lon };
    cache.put('cp_' + cp, lat + ',' + lon, 21600);
  });

  return resultats;
}


/** Distance à vol d'oiseau (km) entre deux points lat/lon (formule de Haversine). */
function distanceKm_(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
