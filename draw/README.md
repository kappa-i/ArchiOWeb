# Module de dessin live

La feuille de dessin de Devin'Art, en temps réel. Elle tourne de deux façons :

- **dans l'API** (`npm run dev`) : on y arrive depuis la salle d'attente, il faut un compte et jouer dans la room ;
- **seule, pour tester** (`npm run draw`) : pas de MongoDB, pas de compte, juste un nom.

## Tester seule, sans compte

```sh
npm run draw
```

Puis ouvrir http://localhost:3001 dans **2 onglets** : ce qu'on dessine dans l'un apparaît en direct dans l'autre.

- Sur son téléphone (même Wi-Fi) : l'adresse « Sur ton téléphone » affichée dans le terminal.
- Choisir sa room et son nom dans l'URL : `/?room=ABC123&name=Tanguy` (sinon room `DEMO` et un nom au hasard).
- Le bouton 🔗 copie le lien d'invitation de la room.
- La manche, le mot et le minuteur sont une **démo locale** (chaque onglet a les siens) en attendant le vrai serveur.

Raccourcis : `B` pinceau, `E` gomme, `F` remplir, `S` formes, `1`–`4` tailles, `Ctrl/Cmd+Z` annuler, `Ctrl/Cmd+Y` rétablir, `Maj` pour un carré / cercle parfait.

## Salle d'attente

Contrairement au dessin, la salle d'attente utilise la **vraie API** (comptes, rooms, participants). Elle est servie par l'API elle-même sur `/play/lobby.html`, ce qui évite les problèmes de CORS.

```sh
npm run dev    # l'API (il faut MongoDB et le .env)
```

Puis ouvrir http://localhost:3000 (la racine redirige vers `/play/lobby.html`) :

1. Se connecter ou créer un compte. Un nouvel onglet reprend le dernier compte connecté sur le navigateur (pas besoin de se reconnecter). Ensuite, chaque onglet garde son propre compte : dans un 2e onglet, « Déconnexion » puis connexion avec un autre compte permet de jouer un 2e joueur.
2. Créer une room (on en devient l'hôte) ou rejoindre celle d'un ami avec son code. Le lien 🔗 (`lobby.html?code=K7PX2M`) fait entrer directement dans la salle d'attente de la room, après s'être connecté si besoin.
3. Dans la salle d'attente : la liste des joueurs se met à jour toutes les 2 secondes. L'hôte change les réglages (joueurs max, manches, durée d'un tour, difficulté des mots), exclut un joueur (deux clics sur la croix) et lance la partie à partir de 2 joueurs.
4. Partie lancée : compte à rebours chez tout le monde, puis direction l'écran de dessin de la room (`/play/`), connecté avec le compte de la salle d'attente. Le serveur fait jouer les tours (voir « Déroulement d'une partie ») ; à la fin, un écran de classement propose de revenir au menu.

Endpoints utilisés : `POST /users`, `POST /auth/login`, `GET /users/me`, `POST /rooms`, `GET /rooms/:code`, `PATCH /rooms/:code/settings`, `PATCH /rooms/:code`, `POST`, `GET`, `PATCH` et `DELETE /rooms/:code/participants`, `POST /rooms/:code/drawings/:id/guesses`.

## Fichiers

| Fichier              | Rôle                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `board.js`           | Moteur de dessin : rejoue les messages sur un canvas. Ne connaît ni l'interface ni le réseau |
| `network.js`         | Connexion WebSocket avec reconnexion automatique                                             |
| `app.js`             | Interface : outils, pointeur (souris, doigt, stylet), barre du haut, animations GSAP         |
| `index.html`         | La page                                                                                      |
| `style.css`          | Le style (responsive : ordinateur, tablette, téléphone en portrait et en paysage)            |
| `lobby.html`         | La salle d'attente : connexion, créer / rejoindre une room, joueurs, réglages, lancer        |
| `lobby.js`           | Salle d'attente : appels à l'API, rafraîchissement toutes les 2 secondes, compte à rebours   |
| `lobby.css`          | Style propre à la salle d'attente (le reste vient de `style.css`)                            |
| `logo.svg`           | Le logo de Devin'Art (aussi l'icône de l'onglet)                                             |
| `../lib/game.js`     | La partie côté serveur : tours, mot tiré, propositions, points, résultats                    |
| `../lib/realtime.js` | Serveur temps réel : relaie les messages aux joueurs de la même room                         |
| `../bin/start.js`    | L'API : branche le temps réel avec comptes (`attachRealtime(server, config.jwtSecret)`)      |
| `../bin/draw.js`     | Petit serveur de test : sert cette page + le temps réel sans compte (`npm run draw`)         |

## Messages temps réel

Connexion :

- dans l'API : `ws://<serveur>/ws?room=ABC123&token=<jeton JWT>`. La connexion est fermée (code `1008`) si le jeton est invalide, si la room n'existe pas ou si l'utilisateur ne joue pas dans la room (ou en a été exclu). Le pseudo affiché vient du compte.
- serveur de test : `ws://<serveur>/ws?room=ABC123&name=Tanguy`.

Les points sont entre 0 et 1 (fraction de la largeur et de la hauteur) : le dessin est le même sur tous les écrans. Les tailles sont en pixels d'une feuille de 1600 × 1200.

### Envoyés par le joueur qui dessine (relayés aux autres joueurs de la room)

| Message  | Contenu                                         | Quand                                            |
| -------- | ----------------------------------------------- | ------------------------------------------------ |
| `op`     | `op` : une opération complète (voir ci-dessous) | Début d'un trait, forme, remplissage, effacement |
| `points` | `id` du trait, `points` : `[[x, y], …]`         | Pendant le trait (par paquets toutes les 30 ms)  |
| `end`    | `id` du trait                                   | Fin du trait                                     |
| `undo`   | `id` de l'opération annulée                     | Annuler                                          |
| `redo`   | `id` de l'opération rétablie                    | Rétablir                                         |

Les opérations (`op.kind`) :

| `kind`   | Champs                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------- |
| `stroke` | `id`, `brush` (`pen`, `marker`, `crayon`, `spray`, `eraser`), `color`, `size`, `seed`, `points`       |
| `shape`  | `id`, `shape` (`line`, `rect`, `ellipse`, `triangle`, `star`, `heart`), `color`, `size`, `from`, `to` |
| `fill`   | `id`, `color`, `at` : le point cliqué                                                                 |
| `clear`  | `id`                                                                                                  |

`seed` sert au hasard du crayon et de la bombe : chaque joueur obtient exactement les mêmes grains.

### Envoyés par le serveur

| Message         | Contenu                                                                                           | À qui                    | Quand                                                        |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------ |
| `history`       | `messages` : tous les messages du dessin                                                          | Le joueur qui arrive     | En arrivant dans la room, et au début de chaque tour         |
| `presence`      | `players` : pseudos des joueurs connectés                                                         | Toute la room            | Quelqu'un arrive ou part                                     |
| `round-started` | `drawingId`, `drawer` (pseudo), `round`, `totalRounds`, `duration` (secondes), `hint` (`____-__`) | Toute la room            | Début d'un tour (aussi au joueur qui arrive pendant le tour) |
| `word-to-draw`  | `word`                                                                                            | Le dessinateur seulement | Début de son tour                                            |
| `guess`         | `player`, `text`                                                                                  | Toute la room            | Une proposition fausse (affichée dans le chat)               |
| `word-found`    | `player`, `points` (sans le mot)                                                                  | Toute la room            | Un joueur a trouvé                                           |
| `round-ended`   | `word`, `scores` : `[{ username, score }]` du meilleur au moins bon                               | Toute la room            | Temps écoulé ou tout le monde a trouvé                       |
| `game-ended`    | `ranking` : `[{ rank, username, score }]`                                                         | Toute la room            | Fin de la partie (la room est ensuite supprimée)             |
| `game-error`    | —                                                                                                 | Toute la room            | La partie s'est arrêtée à cause d'une erreur                 |

## Déroulement d'une partie (`lib/game.js`)

1. L'hôte lance la partie (`PATCH /rooms/:code`). 5 secondes plus tard, le premier tour commence.
2. **Une manche = chaque joueur dessine une fois**, dans l'ordre d'arrivée. Nombre de manches et durée d'un tour = réglages de la room.
3. À chaque tour, un mot est tiré au hasard dans la base, parmi ceux de la difficulté choisie par l'hôte (facile, moyen, difficile ou mélangé), jamais deux fois le même dans la partie. **Il faut avoir chargé les mots** : `npm run seed:words`. Seul le dessinateur peut dessiner (`canDraw()` dans `lib/realtime.js`).
4. Les autres proposent des mots avec **`POST /rooms/:code/drawings/:id/guesses`** (documenté dans `openapi.yml`). Majuscules, accents et espaces autour ne comptent pas, et « oe » vaut « œ » (`coeur` = `cœur`).
5. Points : celui qui trouve gagne `50 + 100 × temps restant / durée du tour` (entre 50 et 150), le dessinateur gagne 25 par joueur qui trouve.
6. Le tour se termine quand le temps est écoulé ou que tout le monde a trouvé : le dessin est enregistré (`Drawing.data`), le mot est révélé, pause de 4 secondes, tour suivant.
7. Fin de partie : un résultat par joueur (`Result`, utilisé par `GET /users/:id/stats`), le classement est envoyé, puis la room et tout son contenu sont supprimés.

Si un joueur quitte la room (ou supprime son compte) et qu'il reste moins de 2 joueurs, la partie se termine tout de suite : le joueur restant a son résultat, puis la room est supprimée avec tout son contenu.
