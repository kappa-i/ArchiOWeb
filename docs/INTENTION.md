# Document d'intention

> À remplir en semaine 3 (cf. roadmap de la consigne). Plus il est précis, plus le développement sera simple.

## Nom du projet

_TBD_

## Quoi / pourquoi / pour qui

Un jeu multijoueur de dessin à deviner, tour par tour. À chaque tour, un joueur dessine un mot secret pendant que les autres le voient se construire en direct et tentent de le deviner le plus vite possible. Plus on trouve tôt, plus on marque de points.

## Équipe et rôles

| Membre | Rôle principal |
| ------ | -------------- |
|        |                |
|        |                |
|        |                |

## Modèle de domaine

| Collection       | Champs (type, contraintes)                                                                                            | Références                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **users**        | username (unique, requis), email (unique, requis), password_hash (requis), created_at                                 | —                                                                     |
| **hotes**        | nb_rooms_creees (défaut 0)                                                                                            | user → users (1 pour 1)                                               |
| **participants** | score (défaut 0), joined_at                                                                                           | user → users (1 pour 1), room → rooms (vide si hors partie)           |
| **rooms**        | code (unique, requis), statut (`waiting` / `playing` / `finished`), created_at                                        | hote → hotes (requis)                                                 |
| **parametres**   | nb_joueurs_max (défaut 8, max 8), nb_manches (défaut 3), duree_tour_sec (défaut 80), langue (défaut `fr`), created_at | room → rooms (requis)                                                 |
| **mots**         | libelle (requis), langue (requis), difficulte · couple (libelle, langue) unique                                       | —                                                                     |
| **room_mots**    | — · couple (room, mot) unique                                                                                         | room → rooms, mot → mots                                              |
| **dessins**      | numero_manche (requis), data (traits en JSON ou URL d'image), started_at, ended_at                                    | room → rooms, participant → participants (le dessinateur), mot → mots |
| **guesses**      | contenu (requis), est_correct (défaut false), points (défaut 0), created_at                                           | dessin → dessins, participant → participants                          |

Chaque document a un `_id` (ObjectId) généré par MongoDB. Les références contiennent l'`_id` du document visé ; MongoDB ne les vérifie pas, c'est l'API qui doit valider que les ressources liées existent.

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
