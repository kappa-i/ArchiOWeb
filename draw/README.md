# Module de dessin live

La feuille de dessin de Devin'Art, en temps réel. Elle marche **sans le reste du back** : pas de MongoDB, pas de compte, pas de logique des tours.

## Tester en local

```sh
npm run draw
```

Puis ouvrir http://localhost:3001 dans **2 onglets** : ce qu'on dessine dans l'un apparaît en direct dans l'autre.

- Sur son téléphone (même Wi-Fi) : l'adresse « Sur ton téléphone » affichée dans le terminal.
- Choisir sa room et son nom dans l'URL : `/?room=ABC123&name=Tanguy` (sinon room `DEMO` et un nom au hasard).
- Le bouton 🔗 copie le lien d'invitation de la room.
- La manche, le mot et le minuteur sont une **démo locale** (chaque onglet a les siens) en attendant le vrai serveur.

Raccourcis : `B` pinceau, `E` gomme, `F` remplir, `S` formes, `1`–`4` tailles, `Ctrl/Cmd+Z` annuler, `Ctrl/Cmd+Y` rétablir, `Maj` pour un carré / cercle parfait.

## Fichiers

| Fichier              | Rôle                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `board.js`           | Moteur de dessin : rejoue les messages sur un canvas. Ne connaît ni l'interface ni le réseau |
| `network.js`         | Connexion WebSocket avec reconnexion automatique                                             |
| `app.js`             | Interface : outils, pointeur (souris, doigt, stylet), barre du haut, animations GSAP         |
| `index.html`         | La page                                                                                      |
| `style.css`          | Le style (responsive : ordinateur, tablette, téléphone en portrait et en paysage)            |
| `../lib/realtime.js` | Serveur temps réel : relaie les messages aux joueurs de la même room                         |
| `../bin/draw.js`     | Petit serveur de test : sert cette page + le temps réel (`npm run draw`)                     |

## Messages temps réel

Connexion : `ws://<serveur>/ws?room=ABC123&name=Tanguy`.

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

| Message    | Contenu                                  | Quand                                                          |
| ---------- | ---------------------------------------- | -------------------------------------------------------------- |
| `history`  | `messages` : tous les messages du dessin | En arrivant dans la room (ou dessin effacé par `resetDrawing`) |
| `presence` | `players` : noms des joueurs connectés   | Quelqu'un arrive ou part                                       |

La page sait déjà réagir à `round-started` (`duration`, `drawer`), `word-to-draw` (`word`) et `round-ended` (`word`) de `docs/INTENTION.md` : la démo locale s'arrête dès que le serveur les envoie.

## Brancher sur le vrai back (plus tard)

1. Dans `bin/start.js` : `attachRealtime(server)` après `http.createServer(app)`.
2. Dans `lib/realtime.js` : identifier le joueur avec son **jeton JWT** (`?token=` dans l'URL) au lieu de `?name=`, et refuser s'il ne joue pas dans la room.
3. Dans `lib/realtime.js` : `canDraw()` répond `true` seulement pour le dessinateur du tour.
4. La logique des tours utilise les fonctions de `lib/realtime.js` :
   - `broadcast(code, message)` pour envoyer `round-started`, `word-found`… ;
   - `resetDrawing(code)` au début d'un tour ;
   - `getDrawing(code)` à la fin du tour, pour enregistrer le dessin.
