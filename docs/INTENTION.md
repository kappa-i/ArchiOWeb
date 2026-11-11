# Document d'intention

> À remplir en semaine 3 (cf. roadmap de la consigne). Plus il est précis, plus le développement sera simple.

## Sommaire

1. [Nom du projet](#nom-du-projet)
2. [Quoi / pourquoi / pour qui](#quoi--pourquoi--pour-qui)
3. [Équipe et rôles](#équipe-et-rôles)
4. [Modèle de domaine](#modèle-de-domaine)
5. [Règles d'autorisation](#règles-dautorisation)
6. [Endpoints prévus](#endpoints-prévus)
7. [Temps réel](#temps-réel)
8. [Fonctionnalités mobiles (optionnel)](#fonctionnalités-mobiles-optionnel)

---

## Nom du projet

_À définir._

## Quoi / pourquoi / pour qui

Un jeu multijoueur de dessin à deviner, tour par tour.

- À chaque tour, **un joueur dessine** un mot secret.
- Les **autres joueurs** voient le dessin se construire en direct et tentent de **deviner le mot** le plus vite possible.
- **Plus on trouve tôt, plus on marque de points.**

## Équipe et rôles

| Membre | Rôle principal |
| ------ | -------------- |
|        |                |
|        |                |
|        |                |

## Modèle de domaine

Chaque document a un `_id` (ObjectId) généré par MongoDB. Les références contiennent l'`_id` du document visé ; MongoDB ne les vérifie pas, c'est l'API qui doit valider que les ressources liées existent.

### Vue d'ensemble

| Collection     | Rôle                                   | Références                      |
| -------------- | -------------------------------------- | ------------------------------- |
| `users`        | Comptes des joueurs                    | —                               |
| `hotes`        | Utilisateur qui crée des rooms         | `users`                         |
| `participants` | Utilisateur qui joue dans une room     | `users`, `rooms`                |
| `rooms`        | Partie                                 | `hotes`                         |
| `parametres`   | Réglages d'une room                    | `rooms`                         |
| `mots`         | Dictionnaire de mots à dessiner        | —                               |
| `room_mots`    | Mots retenus pour une room             | `rooms`, `mots`                 |
| `dessins`      | Un dessin = un tour d'un joueur        | `rooms`, `participants`, `mots` |
| `guesses`      | Propositions des joueurs sur un dessin | `dessins`, `participants`       |

### `users`

| Champ           | Contraintes    |
| --------------- | -------------- |
| `username`      | requis, unique |
| `email`         | requis, unique |
| `password_hash` | requis         |
| `created_at`    | —              |

### `hotes`

| Champ             | Contraintes / référence |
| ----------------- | ----------------------- |
| `user`            | → `users` (1 pour 1)    |
| `nb_rooms_creees` | défaut `0`              |

### `participants`

| Champ       | Contraintes / référence         |
| ----------- | ------------------------------- |
| `user`      | → `users` (1 pour 1)            |
| `room`      | → `rooms` (vide si hors partie) |
| `score`     | défaut `0`                      |
| `joined_at` | —                               |

### `rooms`

| Champ        | Contraintes / référence            |
| ------------ | ---------------------------------- |
| `hote`       | → `hotes`, requis                  |
| `code`       | requis, unique                     |
| `statut`     | `waiting` / `playing` / `finished` |
| `created_at` | —                                  |

### `parametres`

| Champ            | Contraintes / référence |
| ---------------- | ----------------------- |
| `room`           | → `rooms`, requis       |
| `nb_joueurs_max` | défaut `8`, max `8`     |
| `nb_manches`     | défaut `3`              |
| `duree_tour_sec` | défaut `80`             |
| `langue`         | défaut `fr`             |
| `created_at`     | —                       |

### `mots`

| Champ        | Contraintes |
| ------------ | ----------- |
| `libelle`    | requis      |
| `langue`     | requis      |
| `difficulte` | —           |

Le couple (`libelle`, `langue`) est unique.

### `room_mots`

| Champ  | Référence |
| ------ | --------- |
| `room` | → `rooms` |
| `mot`  | → `mots`  |

Le couple (`room`, `mot`) est unique.

### `dessins`

| Champ           | Contraintes / référence           |
| --------------- | --------------------------------- |
| `room`          | → `rooms`                         |
| `participant`   | → `participants` (le dessinateur) |
| `mot`           | → `mots`                          |
| `numero_manche` | requis                            |
| `data`          | traits en JSON ou URL d'image     |
| `started_at`    | —                                 |
| `ended_at`      | —                                 |

### `guesses`

| Champ         | Contraintes / référence |
| ------------- | ----------------------- |
| `dessin`      | → `dessins`             |
| `participant` | → `participants`        |
| `contenu`     | requis                  |
| `est_correct` | défaut `false`          |
| `points`      | défaut `0`              |
| `created_at`  | —                       |

## Règles d'autorisation

| Opération | Qui peut |
| --------- | -------- |
|           |          |

## Endpoints prévus

| Méthode | URL | Description | Auth |
| ------- | --- | ----------- | ---- |
|         |     |             |      |

## Temps réel

_Quels événements sont poussés aux clients via WebSocket, à qui, et quand ?_

## Fonctionnalités mobiles (optionnel)

_Géolocalisation, photos, etc._
