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
9. [Idées pour plus tard](#idées-pour-plus-tard)

---

## Nom du projet

**Devin'Art**

## Quoi / pourquoi / pour qui

Un jeu multijoueur de dessin à deviner, tour par tour.

- À chaque tour, **un joueur dessine** un mot secret.
- Les **autres joueurs** voient le dessin se construire en direct et tentent de **deviner le mot** le plus vite possible.
- **Plus on trouve tôt, plus on marque de points.**

### Règles du jeu

- Le jeu est **entièrement en français**.
- Le **mot à dessiner** est tiré **au hasard** par le serveur parmi la liste fixe de mots.
- **Points de celui qui devine** : plus il trouve tôt dans le temps imparti (`duree_tour_sec`), plus il gagne de points. Rien si le temps est écoulé.
- **Points du dessinateur** : il gagne aussi des points chaque fois qu'un joueur trouve son mot.

### Cycle de vie d'une room

1. Un utilisateur crée la room : il en est l'**hôte**, statut `waiting`.
2. Les joueurs rejoignent avec le code, l'hôte règle les paramètres puis lance la partie : statut `playing`.
3. **Fin de partie** (toutes les manches jouées, ou le dernier joueur quitte une partie en cours) :
   - le serveur calcule le **récapitulatif de fin de partie** (classement, points, mots trouvés…) et l'envoie à tous ;
   - il enregistre **un résultat par joueur** dans `resultats` (gardé pour le profil) ;
   - il **supprime** la room et tout son contenu (paramètres, participants, mots, dessins, propositions).
4. Si le **dernier joueur quitte une room qui n'a pas commencé**, elle est supprimée directement, sans résultats.
5. Si l'**hôte quitte** alors qu'il reste des joueurs, le rôle d'hôte passe automatiquement au joueur arrivé le plus tôt.

### Statistiques du profil

Calculées par l'API (agrégation MongoDB) à partir de la collection `resultats` :

| Catégorie   | Statistiques                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Joueur      | Parties jouées, victoires, taux de victoire, meilleur score, score moyen, total de points, dernière partie |
| Devineur    | Mots trouvés, fois où il a trouvé en premier, temps moyen pour trouver un mot                              |
| Dessinateur | Dessins réussis (au moins un joueur a trouvé), points gagnés en dessinant                                  |

## Équipe et rôles

| Membre  | Rôle principal |
| ------- | -------------- |
| Gabriel | _à répartir_   |
| Nuno    | _à répartir_   |
| Teicir  | _à répartir_   |
| Tanguy  | _à répartir_   |

## Modèle de domaine

Chaque document a un `_id` (ObjectId) généré par MongoDB. Les références contiennent l'`_id` du document visé ; MongoDB ne les vérifie pas, c'est l'API qui doit valider que les ressources liées existent.

### Vue d'ensemble

| Collection     | Rôle                                                                 | Références                      |
| -------------- | -------------------------------------------------------------------- | ------------------------------- |
| `users`        | Comptes des joueurs                                                  | —                               |
| `hotes`        | Utilisateur qui crée des rooms                                       | `users`                         |
| `participants` | Joueur dans une room                                                 | `users`, `rooms`                |
| `rooms`        | Partie                                                               | `hotes`                         |
| `parametres`   | Réglages d'une room                                                  | `rooms`                         |
| `mots`         | Dictionnaire de mots à dessiner                                      | —                               |
| `room_mots`    | Mots retenus pour une room                                           | `rooms`, `mots`                 |
| `dessins`      | Un dessin = un tour d'un joueur                                      | `rooms`, `participants`, `mots` |
| `guesses`      | Propositions des joueurs sur un dessin                               | `dessins`, `participants`       |
| `resultats`    | Résultat d'un joueur pour une partie terminée (gardé pour le profil) | `users`                         |

Toutes les collections sauf `users`, `hotes`, `mots` et `resultats` sont **temporaires** : leur contenu est supprimé à la fin de la partie.

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

| Champ       | Contraintes / référence                     |
| ----------- | ------------------------------------------- |
| `user`      | → `users`, requis                           |
| `room`      | → `rooms`, requis                           |
| `score`     | défaut `0`                                  |
| `exclu`     | défaut `false` (`true` si l'hôte l'a exclu) |
| `joined_at` | —                                           |

Le couple (`user`, `room`) est unique : un utilisateur ne peut être qu'une fois dans la même room.

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
| `created_at`     | —                       |

### `mots`

| Champ        | Contraintes    |
| ------------ | -------------- |
| `libelle`    | requis, unique |
| `difficulte` | —              |

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

### `resultats`

Un document par joueur et par partie terminée. Il n'est jamais supprimé (sauf si l'utilisateur supprime son compte).

| Champ             | Contraintes / référence                             |
| ----------------- | --------------------------------------------------- |
| `user`            | → `users`, requis                                   |
| `score`           | requis — points obtenus dans la partie              |
| `rang`            | requis — place à la fin de la partie (1 = victoire) |
| `mots_trouves`    | défaut `0` — mots devinés                           |
| `premiers`        | défaut `0` — fois où il a trouvé en premier         |
| `temps_total_sec` | défaut `0` — temps cumulé pour trouver ses mots     |
| `dessins_faits`   | défaut `0` — nombre de fois où il a dessiné         |
| `dessins_reussis` | défaut `0` — dessins trouvés par au moins un joueur |
| `points_dessin`   | défaut `0` — points gagnés en dessinant             |
| `date`            | requis — date de fin de la partie                   |

## Règles d'autorisation

Principes :

- **Tout le monde doit avoir un compte** pour jouer (créer ou rejoindre une room).
- **Rejoindre une room** se fait uniquement avec le **code** de la room (pas de liste publique pour l'instant).
- **Inviter** des joueurs = l'hôte leur partage le code de la room (rien de plus côté API).
- Un joueur peut **quitter** la room de lui-même.
- Un joueur **exclu** par l'hôte ne peut **pas revenir** dans la room.
- L'**hôte** est aussi un joueur : il dessine et devine comme les autres.
- Les **mots** forment une liste fixe chargée au départ : personne ne peut les modifier via l'API (pas de rôle administrateur).

| Opération                               | Qui peut                                    |
| --------------------------------------- | ------------------------------------------- |
| S'inscrire, se connecter                | Tout le monde                               |
| Modifier / supprimer son compte         | L'utilisateur lui-même                      |
| Créer une room                          | Utilisateur connecté (il en devient l'hôte) |
| Rejoindre une room avec son code        | Utilisateur connecté, sauf s'il a été exclu |
| Quitter une room                        | Le joueur lui-même (y compris l'hôte)       |
| Modifier les paramètres de la room      | Hôte de la room                             |
| Inviter des joueurs (partager le code)  | Hôte de la room                             |
| Exclure un joueur                       | Hôte de la room                             |
| Lancer la partie                        | Hôte de la room                             |
| Dessiner pendant son tour               | Participant désigné comme dessinateur       |
| Proposer un mot (guess)                 | Participant de la room, sauf le dessinateur |
| Ajouter / modifier / supprimer des mots | Personne (liste fixe)                       |

## Endpoints prévus

> **Proposition à valider en équipe.**

Légende de la colonne Auth :

- **—** : aucune authentification.
- **Compte** : utilisateur connecté (jeton JWT).
- **Joueur** : utilisateur connecté qui participe à la room.
- **Hôte** : utilisateur connecté qui est l'hôte de la room.

### Utilisateurs et authentification

| Méthode  | URL                  | Description                                                                           | Auth   |
| -------- | -------------------- | ------------------------------------------------------------------------------------- | ------ |
| `POST`   | `/users`             | S'inscrire                                                                            | —      |
| `POST`   | `/auth/login`        | Se connecter (renvoie un JWT)                                                         | —      |
| `GET`    | `/users/me`          | Voir son profil                                                                       | Compte |
| `PATCH`  | `/users/me`          | Modifier son profil (nom d'utilisateur, e-mail, mot de passe)                         | Compte |
| `DELETE` | `/users/me`          | Supprimer son compte                                                                  | Compte |
| `GET`    | `/users/:id/stats`   | Statistiques d'un joueur (voir « Statistiques du profil »), calculées par agrégation  | —      |
| `GET`    | `/users/leaderboard` | Classement des joueurs — **paginé**, filtre optionnel `periode` (semaine, mois, tout) | —      |

### Rooms

| Méthode | URL                       | Description                                                             | Auth   |
| ------- | ------------------------- | ----------------------------------------------------------------------- | ------ |
| `POST`  | `/rooms`                  | Créer une room (code généré, paramètres par défaut, l'hôte y participe) | Compte |
| `GET`   | `/rooms/:code`            | Voir une room (statut, paramètres)                                      | Joueur |
| `PATCH` | `/rooms/:code/parametres` | Modifier les paramètres (seulement avant le début)                      | Hôte   |
| `PATCH` | `/rooms/:code`            | Lancer la partie (`statut` → `playing`)                                 | Hôte   |

### Participants

| Méthode  | URL                             | Description                                                    | Auth               |
| -------- | ------------------------------- | -------------------------------------------------------------- | ------------------ |
| `POST`   | `/rooms/:code/participants`     | Rejoindre la room                                              | Compte             |
| `GET`    | `/rooms/:code/participants`     | Liste des joueurs et de leurs scores                           | Joueur             |
| `PATCH`  | `/rooms/:code/participants/:id` | Exclure un joueur (`exclu` → `true`, il ne pourra pas revenir) | Hôte               |
| `DELETE` | `/rooms/:code/participants/:id` | Quitter la room (voir « Cycle de vie d'une room »)             | Le joueur lui-même |

Il n'y a pas d'endpoint pour supprimer une room : elle est supprimée automatiquement (voir « Cycle de vie d'une room »).

### Dessins et propositions

Les dessins sont créés par le serveur au début de chaque tour (mot tiré au hasard). Les traits arrivent en temps réel par WebSocket et sont enregistrés à la fin du tour.

| Méthode | URL                                | Description                                          | Auth                        |
| ------- | ---------------------------------- | ---------------------------------------------------- | --------------------------- |
| `GET`   | `/rooms/:code/dessins`             | Dessins de la partie                                 | Joueur                      |
| `GET`   | `/rooms/:code/dessins/:id`         | Un dessin (le mot n'est visible qu'à la fin du tour) | Joueur                      |
| `POST`  | `/rooms/:code/dessins/:id/guesses` | Proposer un mot                                      | Joueur (pas le dessinateur) |
| `GET`   | `/rooms/:code/dessins/:id/guesses` | Propositions faites sur un dessin                    | Joueur                      |

Les **mots** ne sont pas exposés par l'API : la liste est fixe et doit rester secrète pour les joueurs.

## Temps réel

> **Proposition à valider en équipe.**

Chaque joueur ouvre une connexion WebSocket en envoyant son jeton JWT. Il reçoit ensuite uniquement les messages de **sa** room.

### Messages envoyés par le client

| Message  | Qui l'envoie   | Contenu                               |
| -------- | -------------- | ------------------------------------- |
| `stroke` | Le dessinateur | Un trait (points, couleur, épaisseur) |

### Messages envoyés par le serveur

| Message              | Envoyé à                 | Quand                                                                |
| -------------------- | ------------------------ | -------------------------------------------------------------------- |
| `player-joined`      | Toute la room            | Un joueur rejoint la room                                            |
| `player-excluded`    | Toute la room            | L'hôte exclut un joueur                                              |
| `player-left`        | Toute la room            | Un joueur quitte la room                                             |
| `host-changed`       | Toute la room            | L'hôte est parti : nom du nouvel hôte                                |
| `parametres-updated` | Toute la room            | L'hôte modifie les paramètres                                        |
| `game-started`       | Toute la room            | L'hôte lance la partie                                               |
| `round-started`      | Toute la room            | Début d'un tour : qui dessine, durée (sans le mot)                   |
| `word-to-draw`       | Le dessinateur seulement | Début de son tour : le mot à dessiner                                |
| `stroke`             | Toute la room sauf lui   | Le dessinateur a tracé un trait                                      |
| `guess`              | Toute la room            | Une proposition fausse (texte affiché dans le chat)                  |
| `word-found`         | Toute la room            | Un joueur a trouvé (son nom et ses points, **sans** le mot)          |
| `round-ended`        | Toute la room            | Fin du tour : le mot est révélé, scores mis à jour                   |
| `game-ended`         | Toute la room            | Fin de la partie : récapitulatif (classement, points, mots trouvés…) |

## Fonctionnalités mobiles (optionnel)

_Aucune pour l'instant._

## Idées pour plus tard

- **Galerie des dessins** : liste paginée des dessins des parties terminées, filtrable par joueur ou difficulté du mot. ⚠️ Demanderait de garder les dessins après la partie (aujourd'hui ils sont supprimés).
