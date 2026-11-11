# ArchiOWeb API

API REST (Express 5 + MongoDB 8) du projet ArchiOWeb — COMEM+, HEIG-VD 2026-2027.

- Consigne : https://github.com/mediacomem/comem-archioweb
- API déployée : _lien Render à ajouter_

> Projet en cours de mise en place : aucun code applicatif pour l'instant.

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

## Lancer l'API

```sh
npm run dev
```

Puis ouvrir http://localhost:3000 (documentation de l'API).

## Organisation

- [`docs/INTENTION.md`](docs/INTENTION.md) — document d'intention (domaine, endpoints, rôles)
- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) — checklist des exigences de la consigne

## Équipe

_À compléter_
