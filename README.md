# Untitled

A Pen created on CodePen.

Original URL: [https://codepen.io/franck3615/pen/wBBEgZL](https://codepen.io/franck3615/pen/wBBEgZL).

## Formulaire de contact (`formulaire.html`)

Formulaire « Parlons de votre projet » prêt à mettre en ligne. Les demandes
sont envoyées par e-mail via [Formspree](https://formspree.io) : aucun serveur
ni PHP n’est nécessaire, le fichier fonctionne sur n’importe quel hébergement.

### Mise en service (5 minutes)

1. Créez un compte gratuit sur <https://formspree.io> avec l’adresse e-mail
   qui doit recevoir les demandes, puis validez l’e-mail de confirmation.
2. Cliquez sur **New Form**, donnez-lui un nom (ex. « Contact site »).
3. Formspree affiche une adresse du type `https://formspree.io/f/xyzabcd`.
   Copiez l’identifiant final (`xyzabcd`).
4. Dans `formulaire.html`, remplacez `VOTRE_ID_FORMSPREE` par cet identifiant
   (une seule occurrence, dans la balise `<form action="…">`).
5. Déposez `formulaire.html` sur votre hébergement, ouvrez la page en ligne et
   envoyez une demande de test. La première soumission peut demander une
   confirmation dans votre boîte mail.

Tant que l’identifiant n’est pas renseigné, le formulaire affiche un message
« pas encore configuré » au lieu d’envoyer quoi que ce soit.

### Ce que fait le formulaire

- champs conditionnels (entreprise, précisions de devis, « autre demande ») ;
- validation des champs obligatoires, y compris les saisies vides d’espaces ;
- case de consentement obligatoire (RGPD) ;
- protection anti-spam par champ piège (`_gotcha`) ;
- objet de l’e-mail reçu adapté au type de demande ;
- réponse directe : l’adresse du visiteur est utilisée comme adresse de
  réponse dans l’e-mail reçu ;
- message de confirmation avec récapitulatif, ou message d’erreur si l’envoi
  échoue ;
- fonctionne aussi sans JavaScript (envoi classique vers Formspree).

L’offre gratuite de Formspree couvre 50 demandes par mois.
