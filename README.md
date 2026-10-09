# Untitled

A Pen created on CodePen.

Original URL: [https://codepen.io/franck3615/pen/wBBEgZL](https://codepen.io/franck3615/pen/wBBEgZL).

## Formulaire d’inscription à la conférence (`formulaire.html`)

Les participants s’inscrivent à la conférence et choisissent un atelier dans
une ou deux sessions. Chaque inscription vous est envoyée par e-mail via
[Formspree](https://formspree.io) : aucun serveur ni PHP n’est nécessaire.

### À personnaliser dans `formulaire.html`

Les passages à modifier sont signalés par un commentaire `À MODIFIER` :

- le nom, la date et le lieu de la conférence ;
- les horaires des deux sessions, ainsi que le titre et l’animateur de chaque
  atelier (vous pouvez ajouter ou supprimer des ateliers en copiant un bloc
  `<label class="atelier">…</label>`) ;
- l’identifiant Formspree (voir ci-dessous).

### Recevoir les inscriptions (5 minutes)

1. Créez un compte gratuit sur <https://formspree.io> avec l’adresse e-mail
   qui doit recevoir les inscriptions, puis validez l’e-mail de confirmation.
2. Cliquez sur **New Form** et nommez-le (ex. « Inscriptions conférence »).
3. Formspree affiche une adresse du type `https://formspree.io/f/xyzabcd`.
   Copiez l’identifiant final (`xyzabcd`).
4. Dans `formulaire.html`, remplacez `VOTRE_ID_FORMSPREE` par cet identifiant.
5. Mettez `formulaire.html` en ligne et faites une inscription de test.

Tant que l’identifiant n’est pas renseigné, le formulaire affiche
« pas encore configuré » et n’envoie rien. La liste des inscrits peut être
exportée depuis Formspree (fichier CSV, à ouvrir dans Excel ou Google Sheets).
L’offre gratuite de Formspree couvre 50 inscriptions par mois.
