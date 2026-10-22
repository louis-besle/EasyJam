# EasyJam

Jukebox YouTube collaboratif en temps réel pour LAN parties. Une file d'attente commune, un lecteur synchronisé, un chat et un vote de skip — sans compte ni cloud.

> Interface reconstruite d'après le système visuel **EasyJam · Redesign v1** (Figma) : canvas noir, accent orange `#ff6b35`, typographie Sora / Inter, layout 372 / 676 / 296.

## Prérequis

- [Node.js](https://nodejs.org/) (v18+)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — extraction des flux YouTube

```powershell
pip install yt-dlp
```

> **Important** : garde yt-dlp à jour (`python -m pip install -U yt-dlp`). Une version ancienne produit des URLs YouTube que le navigateur ne peut pas lire (lecture bloquée à 0:00).

## Installation

```powershell
cd EasyJam
npm install
```

## Lancement

```powershell
npm start
```

ou directement :

```powershell
node server/index.js
```

Ouvrir `http://localhost:3215` dans le navigateur.

## Accès depuis le réseau local

Trouver l'IP locale du PC hôte :

```powershell
ipconfig
```

Les autres ouvrent `http://<IP>:3215` (ex. `http://192.168.1.42:3215`).

## Fonctionnalités

| Fonction | Détail |
|----------|--------|
| **Streaming YouTube** | Recherche depuis la barre du haut ou collage d'un lien. Chaque client streame directement depuis YouTube |
| **Synchro temps réel** | Play / Pause / Seek synchronisés entre tous les clients via WebSocket |
| **File d'attente collaborative** | Tout le monde peut ajouter un morceau. L'admin contrôle la lecture |
| **Up next** | Le prochain morceau est mis en avant, le reste de la file s'affiche en dessous |
| **Just played** | L'historique reste visible : un clic sur un morceau le remet dans la file |
| **Vote skip** | Les non-admin votent pour passer le morceau (majorité simple), les compteurs sont remis à zéro à chaque changement |
| **Chat** | 25 messages conservés le temps de la session |
| **Réactions** | Emojis flottants envoyés à toute la room |
| **Paroles** | Récupération des paroles du morceau en cours |
| **Pseudo** | Choix à la première connexion, modifiable via le menu du header ou la barre du bas |
| **Volume individuel** | Chaque utilisateur règle son volume, sauvegardé dans le navigateur |
| **Responsive** | 3 colonnes sur desktop, 2 sur tablette, une colonne sur mobile (lecteur en premier) |

## Commandes

| Action | Effet |
|--------|-------|
| `Entrée` dans la recherche du haut | Lance la recherche, ou ajoute directement un lien YouTube |
| Clic sur un résultat | Ajoute le morceau à la file |
| Clic sur un morceau de « Just played » | Le remet dans la file d'attente |
| Clic sur la barre de progression | Seek (admin uniquement) |
| Clic sur l'icône haut-parleur | Mute / Unmute |
| `Entrée` / `Espace` sur un morceau de l'historique | Requeue au clavier |

## Design

Le thème est centralisé dans les custom properties de `public/style.css` :

- **Surfaces** : `#000000` (canvas), `#0d0d0d` (panneaux), `#1f1f1f` (éléments surélevés)
- **Accent** : `#ff6b35`, texte accent `#ffc9ad`
- **Texte** : `#ffffff`, `#e0e0e0`, `#b8b8b8`, `#8a8a8a`
- **Rayons** : 6 px (contenu), 8 px (panneaux), 500 px (champs), 9999 px (actions)
- **Typo** : Sora 700 pour les titres, Inter 400/500/700 pour l'UI
- **Tracking** : `--tracking-tight: -0.025em` pour les labels

## Stack

- **Backend** : Node.js + Express + ws (WebSocket)
- **Frontend** : HTML / CSS / JS vanilla, sans build step
- **Audio** : HTML5 `<audio>`, stream direct depuis YouTube
- **Extraction** : yt-dlp (child_process)

## Structure des fichiers

```
EasyJam/
├── server/
│   ├── index.js        — Point d'entrée (Express + WebSocket + API paroles)
│   ├── state.js        — État de la room (file, lecture, votes, historique, chat)
│   ├── ws-handler.js   — Routage des messages WebSocket
│   ├── ytdlp.js        — Wrapper yt-dlp (résolution URL + recherche)
│   └── timer.js        — Timer pour l'auto-skip
├── public/
│   ├── index.html      — SPA (Join + Now Playing)
│   ├── style.css       — Design system EasyJam (tokens, composants, responsive)
│   ├── app.js          — Client WebSocket + orchestration
│   ├── player.js       — Wrapper HTML5 Audio (synchro, autoplay recovery)
│   └── ui.js           — Rendu DOM (lecteur, file, historique, chat, utilisateurs)
├── test/
│   ├── state.test.js   — Tests de l'état de la room
│   └── ytdlp.test.js   — Tests du wrapper yt-dlp
├── docs/
├── package.json
└── README.md
```

## Tests

```powershell
npm test
```

## Notes

- Pas de base de données : la file d'attente est persistée dans `queue.json`, le reste (utilisateurs, historique, chat, votes) est perdu au redémarrage du serveur.
- Pas d'authentification : utilisation en LAN privé uniquement.
- Le premier utilisateur connecté devient admin ; l'admin suivant est élu automatiquement s'il part.
- Les URLs de stream YouTube expirent après ~6 h ; elles sont régénérées à chaque ajout ou redémarrage.
