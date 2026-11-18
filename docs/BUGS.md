# Bugs connus

Bugs et incohérences repérés en relisant le code, à corriger plus tard.

## 1. Supprimer son compte casse les rooms où on joue

- **Où** : `routes/users.js` (`DELETE /users/me`)
- **Problème** : on supprime le `User`, mais pas ses `Participant` ni son `Host`.
- **Conséquence** : `GET /rooms/:code/participants` fait `populate('user')`, qui renvoie `null` pour ce joueur. `formatParticipant` plante sur `user.id` → **500** pour toute la room.
- **Piste** : en supprimant le compte, quitter aussi ses rooms (même logique que `DELETE /rooms/:code/participants/:id`).

## 2. Quitter une partie en cours n'est pas géré

- **Où** : `routes/participants.js` (`DELETE /rooms/:code/participants/:id`)
- **Problème** : si le dernier joueur quitte une room `playing`, elle est supprimée sans fin de partie.
- **Attendu** (`docs/INTENTION.md`, « Cycle de vie d'une room ») : calculer le récapitulatif et enregistrer un résultat par joueur avant de supprimer la room.

## 3. `maxPlayers` peut descendre sous le nombre de joueurs

- **Où** : `routes/rooms.js` (`PATCH /rooms/:code/settings`)
- **Problème** : avec 5 joueurs dans la room, l'hôte peut mettre `maxPlayers` à 2.
- **Piste** : refuser (409) si la nouvelle valeur est plus petite que le nombre de joueurs.

## 4. Exclusion possible pendant la partie

- **Où** : `routes/participants.js` (`PATCH /rooms/:code/participants/:id`)
- **Problème** : rien ne vérifie le statut de la room. À décider en équipe : voulu ou pas ?

## 5. La room peut dépasser `maxPlayers` (mineur)

- **Où** : `routes/participants.js` (`POST /rooms/:code/participants`)
- **Problème** : on compte les joueurs puis on crée le participant. Si deux joueurs rejoignent exactement en même temps, la room peut dépasser la limite.

## 6. Documentation pas à jour

- `README.md` dit encore « aucun code applicatif pour l'instant » et parle de MongoDB 8 alors que la CI utilise la 7.0.
- `docs/REQUIREMENTS.md` : rien n'est coché alors qu'une partie est faite (inscription, authentification, validation…).
