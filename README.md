# EasyJam

Jukebox YouTube collaboratif en temps réel pour LAN parties. Une file d'attente commune, un lecteur synchronisé, un chat et un vote de skip — sans compte ni cloud.

> Interface reconstruite d'après le système visuel **EasyJam · Redesign v1** (Figma) : canvas noir, accent orange `#ff6b35`, typographie Sora / Inter, layout 372 / 676 / 296.

## Avertissement

EasyJam est un **projet personnel et pédagogique**, sans aucune affiliation avec YouTube, Google ou Spotify.

- Aucun fichier audio n'est stocké ni distribué : l'application demande à `yt-dlp` l'URL d'un flux YouTube, que chaque navigateur lit directement.
- L'extraction de flux via `yt-dlp` n'est pas couverte par les CGU de YouTube ; l'usage reste sous la responsabilité de l'utilisateur.
- Utilisation prévue : **réseau local privé**, entre personnes qui se connaissent. Aucune instance publique n'est fournie ni maintenue.
- Les captures et données du dépôt sont fictives. Les marques et interfaces tierces citées appartiennent à leurs propriétaires.

## Prérequis

- [Node.js](https://nodejs.org/) (v20+)
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

## Usage privé

EasyJam est conçu pour un usage **strictement privé, sur un réseau local**, entre personnes qui se connaissent. Aucune instance publique n'est fournie, hébergée ou maintenue.

- Ne pas exposer l'application sur Internet.
- Pas d'authentification, pas de compte, pas de monétisation.
- L'application ne stocke, n'héberge et ne distribue aucun fichier audio : elle lit des flux servis par YouTube.
- L'extraction de ces flux via `yt-dlp` n'est pas couverte par les CGU de YouTube. Ce projet est un outil personnel ; son utilisation reste sous ta responsabilité.
- Privilégie des œuvres dont tu détiens les droits, ou des catalogues libres.

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
| **Responsive** | 3 colonnes sur desktop ; sur tablette/mobile le lecteur reste plein écran, la file et le chat s'ouvrent via deux boutons dans le header |

## Commandes

| Action | Effet |
|--------|-------|
| `Entrée` dans la recherche du haut | Lance la recherche, ou ajoute directement un lien YouTube |
| Clic sur un résultat | Ajoute le morceau à la file |
| Clic sur un morceau de « Just played » | Le remet dans la file d'attente |
| Clic sur la barre de progression | Seek (admin uniquement) |
| Clic sur l'icône haut-parleur | Mute / Unmute |
| `Entrée` / `Espace` sur un morceau de l'historique | Requeue au clavier |
| Boutons file / chat du header (tablette et mobile) | Ouvrent les panneaux coulissants ; `Échap`, le fond ou le bouton × les referment |

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
│   ├── ws-handler.test.js — Tests du protocole WebSocket
│   ├── ytdlp.test.js   — Tests du wrapper yt-dlp
│   ├── e2e/            — Tests navigateur + snapshots visuels
│   ├── load/           — Test de charge 10 clients WebSocket
│   └── helpers/        — Serveur de test isolé et détection navigateur
├── scripts/            — Mise à jour des baselines visuelles
├── .github/workflows/  — CI (tests unitaires + E2E + charge)
├── docs/
│   ├── DESIGN.md       — Référence du système visuel
├── design-shots/       — Captures des écrans de référence
├── package.json
└── README.md
```

## Tests

```powershell
npm test           # tests unitaires + WebSocket (state, ws-handler, yt-dlp)
npm run test:e2e   # tests navigateur + snapshots visuels
npm run test:visual # snapshots visuels uniquement
npm run test:load  # charge : 10 clients WebSocket simultanés
npm run test:all   # unitaires + E2E + charge
npm run check      # préflight rapide : unitaires + syntaxe des scripts front
```

Les tests E2E utilisent `puppeteer-core` avec un Chrome/Edge **déjà installé** (aucun Chromium téléchargé). Le navigateur est détecté automatiquement (Chrome ou Edge sous Windows, `google-chrome` / `chromium` sous Linux, Chrome ou Edge sous macOS). Pour imposer un binaire :

```powershell
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run test:e2e
```

Si aucun navigateur n'est trouvé, la suite E2E est marquée `skip` avec un message explicite plutôt que d'échouer. Le serveur de test est isolé : port éphémère, file de test temporaire, flux audio local et stubs `resolveYoutubeUrl` / `searchYoutube` (aucun appel réseau à YouTube).

### Snapshots visuels

Les références sont versionnées par plateforme dans `test/e2e/snapshots/<plateforme>/` (join, room, drawer mobile). Après un changement de design volontaire :

```powershell
npm run snapshots  # régénère les baselines de la plateforme courante
```

Sans baseline pour la plateforme courante, les tests visuels sont `skip` (utile en CI Linux si seules les baselines Windows sont présentes). La CI publie les captures courantes dans l'artefact `visual-snapshots`, ce qui permet de récupérer les images et de régénérer les baselines au besoin.

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute `npm test`, `npm run test:e2e` puis `npm run test:load` sur `ubuntu-latest` à chaque `push` et `pull_request`.

## Notes

- **Pas de déploiement public** : le projet est prévu pour tourner chez soi, sur le LAN, et n'est pas maintenu pour un hébergement accessible depuis Internet.
- Pas de base de données : la file **et la piste en cours avec sa position** sont persistées dans `queue.json`. Les utilisateurs, l'historique, le chat et les votes sont perdus au redémarrage du serveur.
- Au premier join après un redémarrage, la piste en cours reprend à sa position sauvegardée (URL de stream rafraîchie si nécessaire).
- Pas d'authentification : utilisation en LAN privé uniquement.
- Le premier utilisateur connecté devient admin ; l'admin suivant est élu automatiquement s'il part.
- Les URLs de stream YouTube expirent après ~6 h ; elles sont ré-résolues automatiquement au lancement d'un morceau si elles ont plus de 5 h, et à la demande si le navigateur signale une erreur de lecture.

## Licence

Le code est distribué sous licence [MIT](LICENSE). Les marques, interfaces et contenus tiers cités appartiennent à leurs propriétaires. EasyJam n'est affilié ni à YouTube, ni à Google, ni à Spotify.
