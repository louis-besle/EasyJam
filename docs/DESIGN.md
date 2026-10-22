# EasyJam — Design System

Système visuel de l'interface EasyJam : canvas noir, un seul accent orange, typographie Sora / Inter. Les valeurs sont centralisées dans les custom properties de `public/style.css` ; ce document sert de référence pour les composants et les évolutions.

## Principes

- Canvas noir, panneaux à peine plus clairs, un seul accent orange.
- Une action principale par écran ; le reste reste discret.
- Le contenu (pochette, titre, file) porte la hiérarchie visuelle.
- Mouvement court (130–200 ms), désactivé avec `prefers-reduced-motion`.
- Interface utilisable au clavier : focus visible, `aria-*` sur les boutons icônes, `Échap` ferme les panneaux mobiles.

## Couleurs

| Token | Valeur | Usage |
|---|---|---|
| `--canvas` | `#000000` | Fond de page |
| `--panel` | `#0d0d0d` | Panneaux file / chat |
| `--surface` | `#121212` | Cartes et surfaces secondaires |
| `--raised` | `#1f1f1f` | Éléments surélevés, badges |
| `--hover` | `#292929` | Hover, états actifs |
| `--field` | `#151515` | Champs de saisie |
| `--field-border` | `#242424` | Bordure des champs |
| `--hairline` | `#1a1a1a` | Séparateurs |
| `--text` | `#ffffff` | Titres, texte principal |
| `--text-body` | `#e0e0e0` | Corps de texte |
| `--text-2` | `#b8b8b8` | Métadonnées |
| `--text-3` | `#8a8a8a` | Texte discret |
| `--text-4` | `#6f6f6f` | Placeholders, labels |
| `--accent` | `#ff6b35` | Action principale, progression |
| `--accent-text` | `#ffc9ad` | Texte sur accent |
| `--accent-wash` | `rgba(255, 107, 53, 0.13)` | Fond accentué |
| `--accent-ring` | `rgba(255, 107, 53, 0.4)` | Focus ring |
| `--online` | `#4ade80` | Présence en ligne |
| `--danger` | `#ef4444` | Erreurs |

## Typographie

- **Display** : Sora 400–800, titres et wordmark.
- **UI** : Inter 400–700, navigation, boutons, métadonnées.
- **Tracking** : `--tracking-tight: -0.025em` sur les titres et labels.

| Rôle | Taille / graisse | Usage |
|---|---|---|
| Join title | Sora 36 / 700 | Titre de l'écran de connexion |
| Track title | Sora 30 / 700 | Titre du morceau en lecture |
| Next title | Sora 20 / 700 | Carte « Up next » |
| Panel title | Sora 18 / 700 | En-têtes de panneaux |
| Body | Inter 14 / 600 | Titres de cartes, boutons |
| Meta | Inter 12 / 400 | Artiste, horodatages |
| Label | Inter 10–12 / 700, majuscules | Sections (« NOW PLAYING », « IN THE JAM ») |

## Rayons et espacements

- **Rayons** : 6 px (contenu), 8 px (panneaux), 10 px (cartes), 500 px (champs), 9999 px (actions).
- **Base** : 4 px. Gouttière et padding de page : 24 px.
- **Hauteurs** : topbar 64 px, barre des utilisateurs 64 px.

## Layout

- Desktop (> 1180 px) : trois colonnes — file `372px`, lecteur `minmax(0, 1fr)`, chat `296px`.
- Tablette / mobile (≤ 1180 px) : le lecteur reste plein écran ; la file et le chat deviennent des panneaux coulissants pilotés par les boutons du header, avec backdrop et fermeture par `Échap`.
- Ajustements complémentaires à 860 px et 560 px ; mode `prefers-reduced-motion`.
- La barre des utilisateurs reste fixe en bas sur desktop.

## Composants

- **Topbar** : logo, recherche YouTube, compteur de connectés, pile d'avatars, menu utilisateur.
- **Panneaux** : fond `--panel`, bordure 1 px, rayon 8 px, en-tête avec titre et action discrète.
- **Lecteur** : pochette carrée (rayon 6 px), titre, artiste, ajouté par, barre de progression, contrôles, vote skip.
- **File** : carte « Up next » mise en avant, lignes « Then », historique « Just played ».
- **Chat** : messages courts, horodatage discret, champ arrondi et bouton d'envoi accent.
- **Boutons** : actions principales en pill blanche ou accent ; actions secondaires en texte.
- **Champs** : rayon 500 px, fond `--field`, focus `--accent-ring`.
- **Avatars** : cercles avec anneau coloré, initiales.
- **Drawers** : panneaux latéraux + backdrop, accessibles au clavier.

## Motion

- Courbe : `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`.
- Durées : `--fast: 130ms` pour les survols, `--base: 200ms` pour les ouvertures.
- Aucune animation si `prefers-reduced-motion: reduce`.

## Fichiers

- `public/style.css` : tokens et composants.
- `public/index.html` : structure de la SPA.
- `public/ui.js` : rendu DOM (lecteur, file, historique, chat, utilisateurs).
- `design-shots/` : captures de référence.
