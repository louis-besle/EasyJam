# EasyJam

Streaming musical collaboratif en temps réel pour LAN parties. ~10 utilisateurs, une file d'attente commune, un chat, et des tournois de musique.

## Prérequis

- [Node.js](https://nodejs.org/) (v18+)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — extraction des flux YouTube

```powershell
pip install yt-dlp
```

## Installation

```powershell
cd EasyJam
npm install
```

## Lancement

```powershell
node server/index.js
```

Ouvrir `http://localhost:3215` dans le navigateur.

## Accès depuis le réseau local

Trouver l'IP locale du PC hôte :

```powershell
ipconfig
```

Les autres ouvrent `http://<IP>:3215` (ex: `http://192.168.1.42:3215`).

## Fonctionnalités

| Fonction | Détail |
|----------|--------|
| **Streaming YouTube** | Recherche intégrée ou collage de lien. Chaque client stream directement depuis YouTube |
| **Synchro temps réel** | Play / Pause / Seek synchronisé entre tous les clients via WebSocket |
| **File d'attente collaborative** | Tout le monde peut ajouter des morceaux. L'admin contrôle la lecture |
| **Vote skip** | Les non-admin peuvent voter pour passer un morceau (majorité simple) |
| **Chat** | Limité à 25 messages, persisté le temps de la session |
| **Pseudo** | Choix à la première connexion, éditable dans la barre en bas |
| **Volume individuel** | Chaque utilisateur règle son propre volume, sauvegardé |
| **Tournoi de musique** | Bracket 16 morceaux : extrait 15s → vote → vainqueur → round suivant |

## Commandes

| Touche | Action |
|--------|--------|
| `Enter` (dans la recherche) | Cherche ou ajoute le lien direct |
| Clic sur la barre de progression | Seek (admin seulement) |
| Clic sur l'icône haut-parleur | Mute / Unmute |

## Stack

- **Backend** : Node.js + Express + ws (WebSocket)
- **Frontend** : HTML / CSS / JS vanilla (pas de build step)
- **Audio** : HTML5 `<audio>`, stream direct depuis YouTube
- **Extraction** : yt-dlp (child_process)

## Structure des fichiers

```
EasyJam/
├── server/
│   ├── index.js        — Point d'entrée (Express + WebSocket)
│   ├── state.js        — État de la room (file, lecture, votes, etc.)
│   ├── ws-handler.js   — Routage des messages WebSocket
│   ├── ytdlp.js        — Wrapper yt-dlp (résolution URL + recherche)
│   ├── tournament.js   — Machine à états du tournoi
│   └── timer.js        — Timer pour auto-skip
├── public/
│   ├── index.html      — SPA
│   ├── style.css       — ~1500 lignes, thème dark, accent coral
│   ├── app.js          — Client WebSocket + orchestration
│   ├── player.js       — Wrapper HTML5 Audio (synchro, autoplay recovery)
│   ├── ui.js           — Fonctions de rendu DOM
│   └── tournament.js   — Client tournoi (bracket, votes, matchs)
├── test/
│   └── state.test.js   — Tests unitaires (Node test runner)
│   └── ytdlp.test.js
├── docs/
├── package.json
└── README.md
```

## Tests

```powershell
npm test
```

## Notes

- Pas de base de données — l'état est perdu au redémarrage du serveur
- Pas d'authentification — utilisation en LAN privé uniquement
- Les URLs de stream YouTube expirent après ~6h (régénérées automatiquement)
