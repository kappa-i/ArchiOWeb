# ArchiOWeb API

API REST (Express 5 + MongoDB 8) du projet ArchiOWeb — COMEM+, HEIG-VD 2026-2027.

- Consigne : https://github.com/mediacomem/comem-archioweb
- API déployée (Render + MongoDB Atlas) : https://devinart-8z4w.onrender.com (documentation)
- Jouer en ligne : https://devinart-8z4w.onrender.com/play/lobby.html

> Hébergement gratuit : le serveur s'endort après ~15 minutes sans visite, la première visite prend alors ~30 secondes.

## Prérequis

- Node.js ≥ 22.9
- MongoDB 8.0 (pas la 9), installé selon le [guide du cours](https://github.com/MediaComem/comem-archioweb/blob/main/guides/install-mongodb.md) — sous Windows : installateur officiel + MongoDB Shell

## Installation

```sh
npm ci
cp .env.example .env
```

### Secret JWT (obligatoire)

L'API signe les jetons de connexion avec un secret. Sans lui, `npm run dev` refuse de démarrer.

1. Générer un secret :

   ```sh
   node -p "crypto.randomBytes(32).toString('base64')"
   ```

2. Le coller dans le fichier `.env` :

   ```
   JWT_SECRET=le_résultat_de_la_commande
   ```

Chaque membre de l'équipe a son propre secret dans son `.env` (jamais commité). `npm test` n'en a pas besoin : il utilise un secret de test.

## Charger la liste de mots

Les mots à dessiner sont dans [`data/words.js`](data/words.js) (trois difficultés : `easy`, `medium`, `hard`). Pour les enregistrer dans la base :

```sh
npm run seed:words
```

On peut relancer la commande sans risque : elle ne crée pas de doublons. Après avoir modifié `data/words.js`, il suffit de la relancer.

## Lancer l'API

```sh
npm run dev
```

Puis ouvrir http://localhost:3000 (documentation de l'API).

## Lancer les tests

MongoDB doit tourner en local (sur `127.0.0.1:27017`), puis :

```sh
npm test
```

Les tests utilisent leur propre base, `archioweb-test`, vidée avant chaque test : la base de développement n'est pas touchée. La commande affiche aussi la couverture du code (au moins 75 % des lignes, sinon elle échoue).

Sur GitHub, la CI (`.github/workflows/ci.yml`) lance les mêmes tests à chaque pull request, avec MongoDB 7.0 : la 8.0 ne démarre pas sur les machines de GitHub (bug [SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)). Le code est compatible avec les deux versions.

## Tester le module de dessin

Le dessin en temps réel se teste sans MongoDB ni compte :

```sh
npm run draw
```

Puis ouvrir http://localhost:3001 dans 2 onglets : ce qu'on dessine dans l'un apparaît dans l'autre. Détails dans [`draw/README.md`](draw/README.md).

## Jouer (salle d'attente + dessin)

Tout passe par l'API : lancer `npm run dev`, puis ouvrir http://localhost:3000/play/lobby.html dans 2 onglets, avec un compte différent dans chacun. Quand l'hôte lance la partie, tout le monde arrive sur l'écran de dessin de la room, en temps réel. Détails dans [`draw/README.md`](draw/README.md).

## Organisation

- [`docs/INTENTION.md`](docs/INTENTION.md) — document d'intention (domaine, endpoints, rôles)
- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) — checklist des exigences de la consigne

## Équipe

_À compléter_
