# Kwyk Tutor - Extension Chrome

Assistant pedagogique pour les exercices de maths sur Kwyk.fr

## Fonctionnalites

- **Detection automatique** des exercices sur Kwyk (QCM, saisie libre, etc.)
- **Mode pedagogique** : donne la solution complete avec explications
- **Interface integree** : panneau lateral discret sur la page Kwyk
- **Conversation** : pose des questions supplementaires si besoin

## Installation

### 1. Telecharger l'extension

Telecharge ou clone ce dossier sur ton ordinateur.

### 2. Generer les icones

1. Ouvre le fichier `icons/generate-icons.html` dans ton navigateur
2. Clique sur chaque bouton "Telecharger"
3. Enregistre les fichiers dans le dossier `icons/`
4. Renomme-les : `icon16.png`, `icon48.png`, `icon128.png`

### 3. Installer dans Chrome

1. Ouvre Chrome
2. Va dans `chrome://extensions/`
3. Active le **Mode developpeur** (en haut a droite)
4. Clique sur **Charger l'extension non empaquetee**
5. Selectionne le dossier `Kwyk` contenant les fichiers

### 4. Configurer la cle API Mistral

1. Va sur [console.mistral.ai](https://console.mistral.ai/)
2. Cree un compte gratuit
3. Va dans "API Keys"
4. Cree une nouvelle cle
5. Dans Chrome, clique sur l'icone Kwyk Tutor
6. Va dans **Options**
7. Colle ta cle API
8. Clique sur **Tester la connexion** puis **Sauvegarder**

## Utilisation

1. Va sur [kwyk.fr](https://www.kwyk.fr) et connecte-toi
2. Ouvre un exercice dans tes devoirs
3. Clique sur le bouton violet "?" en bas a droite
4. L'exercice est automatiquement detecte
5. Utilise les boutons :
   - **Explique-moi** : comprendre les concepts
   - **Indice** : obtenir un coup de pouce
   - **Reponse** : voir la solution avec explication detaillee
6. Pose des questions personnalisees dans le champ de texte

## Modes

### Mode Pedagogique
- Le tuteur donne la solution complete avec explications
- Tous les boutons sont visibles (Explique-moi, Indice, Reponse)

## Structure des fichiers

```
Kwyk/
├── manifest.json      # Configuration de l'extension
├── content.js         # Script injecte dans Kwyk
├── styles.css         # Styles du panneau d'aide
├── options.html       # Page d'options
├── options.js         # Script des options
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # Ce fichier
```

## Depannage

### Le bouton n'apparait pas sur Kwyk
- Verifie que tu es sur une page `/devoirs/`
- Recharge la page (F5)
- Verifie que l'extension est activee dans `chrome://extensions/`

### Erreur de cle API
- Verifie que ta cle est correcte (commence par `sk-`)
- Teste la connexion dans les options
- Verifie ton credit sur console.mistral.ai

### L'exercice n'est pas detecte
- Certains types d'exercices peuvent ne pas etre reconnus
- Tu peux quand meme poser des questions en decrivant l'exercice

## Philosophie

Cette extension est concue pour t'aider a **apprendre**, pas pour tricher.
Le mode pedagogique est la par defaut pour t'accompagner dans tes exercices.

Bonne chance dans tes exercices de maths !

## Regles importantes
Mets à jour ce fichier après chaque changement significatif
Demande moi avant de coder.
---

Cree par Morgan Bouchon - 2026
