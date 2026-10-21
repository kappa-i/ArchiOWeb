# Checklist des exigences

Source : https://github.com/mediacomem/comem-archioweb (consigne 2026-2027). Cocher seulement ce qui est implémenté **et** testé **et** documenté.

## Rendu

- [ ] Groupe de 3–4 personnes
- [ ] Repo GitHub public
- [ ] API déployée sur Render (+ MongoDB Atlas)
- [ ] E-mail à Simon Oulevay et Loris Gavillet : membres, lien repo, lien API

## Fonctionnalités

- [ ] Inscription d'un utilisateur
- [ ] Authentification (JWT ou équivalent)
- [ ] Au moins 2 autres types de ressources, liés entre eux (agrégation/composition)
- [ ] Au moins un type lié aux utilisateurs
- [ ] CRUD minimal suffisant pour une app mobile
- [ ] Au moins une liste paginée
- [ ] Au moins une liste avec filtres optionnels
- [ ] Au moins une ressource agrégée via pipeline MongoDB (ex. nombre d'items par user)
- [ ] Autorisations définies et appliquées selon le domaine
- [ ] Au moins une opération restreinte pour les utilisateurs authentifiés
- [ ] Validation des entrées (ex. Mongoose)
- [ ] Validation de l'existence des ressources liées
- [ ] Composante temps réel significative, intégrée au reste
- [ ] (Optionnel) Géolocalisation / images / audio-vidéo / accéléromètre

## Documentation

- [ ] Chaque endpoint : params, headers, body, contraintes, codes, headers et body de réponse
- [ ] Messages temps réel documentés

## Tests

- [ ] Couverture ≥ 75 %
- [ ] Tous les types d'opérations REST couverts
- [ ] Cas d'erreur testés
- [ ] Un test = une opération REST
- [ ] `npm test` reproductible

## Qualité

- [ ] Méthodes, headers et codes HTTP corrects
- [ ] Hiérarchie et nommage d'URL cohérents
- [ ] Code asynchrone correct, erreurs async gérées
- [ ] Duplication évitée (middlewares)
