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

## 3. ~~`maxPlayers` peut descendre sous le nombre de joueurs~~ — corrigé

- **Où** : `routes/rooms.js` (`PATCH /rooms/:code/settings`)
- **Problème** : avec 5 joueurs dans la room, l'hôte pouvait mettre `maxPlayers` à 2.
- **Correction** : refusé avec **409** si la nouvelle valeur est plus petite que le nombre de joueurs (les valeurs hors limites restent en 422).

## 4. ~~Exclusion possible pendant la partie~~ — corrigé

- **Où** : `routes/participants.js` (`PATCH /rooms/:code/participants/:id`)
- **Problème** : rien ne vérifiait le statut de la room.
- **Correction** : on ne peut exclure que dans la salle d'attente (**409** `The game has already started` pendant la partie). Un joueur qui gêne pendant la partie peut toujours partir de lui-même.

## 5. ~~La room peut dépasser `maxPlayers`~~ — corrigé

- **Où** : `routes/participants.js` (`POST /rooms/:code/participants`)
- **Problème** : on comptait les joueurs puis on créait le participant. Si deux joueurs rejoignaient exactement en même temps, la room pouvait dépasser la limite.
- **Correction** : après avoir créé le participant, on regarde sa place dans l'ordre d'arrivée. S'il est en trop, il est supprimé et reçoit **409** `The room is full`.

## 6. ~~Documentation pas à jour~~ — corrigé

- `README.md` parlait seulement de MongoDB 8 alors que la CI utilise la 7.0 : nouvelle section « Lancer les tests » qui explique pourquoi (la 8.0 ne démarre pas sur les machines de GitHub).
- `docs/REQUIREMENTS.md` : les cases sont cochées selon ce qui est fait.

## 7. ~~« coeur » refusé pour le mot « cœur »~~ — corrigé

- **Où** : `lib/game.js` (`simplify`, utilisé par `POST /rooms/:code/drawings/:id/guesses`)
- **Problème** : « œ » n'est pas une lettre accentuée, `simplify` le gardait tel quel. Un joueur qui tapait `coeur`, `oeuf` ou `oeil` avait faux.
- **Correction** : « œ » est remplacé par « oe » avant de comparer.

## 8. ~~Rooms abandonnées~~ — corrigé

- **Où** : `lib/realtime.js`, `lib/rooms.js`, `routes/rooms.js`, `routes/participants.js`
- **Problème** : un joueur qui fermait son onglet sans cliquer « Quitter » restait dans la room pour toujours (si c'était l'hôte, plus personne ne pouvait lancer la partie). On pouvait aussi être dans plusieurs rooms à la fois.
- **Correction** :
  - la salle d'attente et l'écran de dessin restent connectés en temps réel ; quand la dernière page d'un joueur se ferme et qu'il ne revient pas dans les **30 secondes**, il est retiré de la room (`removeAbsentPlayer`, mêmes règles que « Quitter » : nouvel hôte, room supprimée si vide, fin de partie s'il reste moins de 2 joueurs) ;
  - créer ou rejoindre une room fait quitter les autres (`leaveAllRooms`) ;
  - au démarrage du serveur (ex. Render qui se réveille), les parties interrompues sont terminées et les joueurs des salles d'attente qui ne reviennent pas sont retirés (`cleanUpRoomsAtStartup`).

## 9. ~~Tour bloqué quand un joueur part pendant la partie~~ — corrigé

- **Où** : `lib/game.js`
- **Problème** : si le dessinateur partait, les autres attendaient la fin du temps devant une feuille vide. Et « tout le monde a trouvé » comptait aussi les joueurs partis, donc le tour ne se terminait jamais en avance.
- **Correction** : si le dessinateur part, le tour se termine tout de suite (`handlePlayerLeft`) ; « tout le monde a trouvé » ne compte que les joueurs encore là (`everyoneFound`).
