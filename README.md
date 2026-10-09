# Untitled

A Pen created on CodePen.

Original URL: [https://codepen.io/franck3615/pen/wBBEgZL](https://codepen.io/franck3615/pen/wBBEgZL).

## Formulaire d’inscription — Les Facettes subtiles de l’eau (`formulaire.html`)

Inscription à la conférence (vendredi 20 novembre 2026, 19 h 30) et aux
ateliers (samedi 21 novembre 2026) avec Franck RAJJOU. Le montant est calculé
automatiquement : conférence 15 €, atelier 25 €, ou 20 € par atelier pour les
personnes inscrites à la conférence (réduction de 5 € par atelier).

Chaque inscription vous est envoyée par e-mail via
[Formspree](https://formspree.io), sans serveur ni PHP. Les inscriptions se
ferment automatiquement après le 5 novembre 2026.

### Recevoir les inscriptions (5 minutes)

1. Créez un compte gratuit sur <https://formspree.io> avec l’adresse e-mail
   qui doit recevoir les inscriptions, puis validez l’e-mail de confirmation.
2. Cliquez sur **New Form** et nommez-le (ex. « Inscriptions Facettes »).
3. Formspree affiche une adresse du type `https://formspree.io/f/xyzabcd`.
   Copiez l’identifiant final (`xyzabcd`).
4. Dans `formulaire.html`, remplacez `VOTRE_ID_FORMSPREE` par cet identifiant.
5. Mettez `formulaire.html` en ligne et faites une inscription de test.

Tant que l’identifiant n’est pas renseigné, le formulaire affiche
« pas encore configuré » et n’envoie rien. La liste des inscrits peut être
exportée depuis Formspree (fichier CSV, à ouvrir dans Excel ou Google Sheets).
L’offre gratuite de Formspree couvre 50 inscriptions par mois.

### Ajouter les liens de paiement

En bas du fichier, dans le bloc `À MODIFIER` du script :

- `lienCarte` : le lien de paiement par carte bancaire (SumUp, HelloAsso…) ;
- `virement` : titulaire du compte, IBAN et BIC ;
- `dateLimite` : dernier jour d’inscription (inclus).

Ces informations s’affichent après l’envoi de l’inscription, avec le montant
à régler. Tant qu’elles sont vides, le participant lit qu’elles lui seront
envoyées par e-mail.
