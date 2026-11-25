# Checklist des exigences

Source : https://github.com/mediacomem/comem-archioweb (consigne 2026-2027). Cocher seulement ce qui est implémenté **et** testé **et** documenté.

## Rendu

- [x] Groupe de 3–4 personnes
- [x] Repo GitHub public
- [x] API déployée sur Render (+ MongoDB Atlas)
- [ ] E-mail à Simon Oulevay et Loris Gavillet : membres, lien repo, lien API

## Fonctionnalités

- [x] Inscription d'un utilisateur
- [x] Authentification (JWT ou équivalent)
- [x] Au moins 2 autres types de ressources, liés entre eux (agrégation/composition)
- [x] Au moins un type lié aux utilisateurs
- [ ] CRUD minimal suffisant pour une app mobile
- [ ] Au moins une liste paginée
- [ ] Au moins une liste avec filtres optionnels
- [x] Au moins une ressource agrégée via pipeline MongoDB (ex. nombre d'items par user)
- [x] Autorisations définies et appliquées selon le domaine
- [x] Au moins une opération restreinte pour les utilisateurs authentifiés
- [x] Validation des entrées (ex. Mongoose)
- [x] Validation de l'existence des ressources liées
- [x] Composante temps réel significative, intégrée au reste
- [ ] (Optionnel) Géolocalisation / images / audio-vidéo / accéléromètre

## Documentation

- [x] Chaque endpoint : params, headers, body, contraintes, codes, headers et body de réponse
- [x] Messages temps réel documentés

## Tests

- [ ] Couverture ≥ 75 %
- [x] Tous les types d'opérations REST couverts
- [ ] Cas d'erreur testés
- [ ] Un test = une opération REST
- [ ] `npm test` reproductible

## Qualité

- [x] Méthodes, headers et codes HTTP corrects
- [x] Hiérarchie et nommage d'URL cohérents
- [x] Code asynchrone correct, erreurs async gérées
- [x] Duplication évitée (middlewares)
