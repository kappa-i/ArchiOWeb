# Bugs connus

Bugs et incohérences repérés en relisant le code, à corriger plus tard.

## 1. ~~Supprimer son compte casse les rooms où on joue~~ — corrigé

- **Où** : `routes/users.js` (`DELETE /users/me`)
- **Problème** : on supprimait le `User`, mais pas ses `Participant` ni son `Host`. `GET /rooms/:code/participants` plantait alors (**500**) pour toute la room.
- **Correction** : avant de supprimer le compte, l'utilisateur quitte toutes ses rooms avec la même logique que `DELETE /rooms/:code/participants/:id` (fonction `removePlayer` dans `lib/rooms.js`).

## 2. ~~Quitter une partie en cours n'est pas géré~~ — corrigé

- **Où** : `routes/participants.js` (`DELETE /rooms/:code/participants/:id`)
- **Problème** : si le dernier joueur quittait une room `playing`, elle était supprimée sans fin de partie, et ses dessins et propositions restaient dans la base.
- **Correction** : pendant une partie, s'il reste moins de 2 joueurs, la partie se termine tout de suite (`finishGame` dans `lib/game.js`) : résultat pour le joueur restant, message `game-ended`, puis la room est supprimée avec tout son contenu. Vaut aussi quand un joueur supprime son compte.

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

- `README.md` parle de MongoDB 8 alors que la CI utilise la 7.0.
- `docs/REQUIREMENTS.md` : presque rien n'est coché alors qu'une partie est faite (inscription, authentification, validation…).
