# Plan de développement Kwyk Tutor V12

## Vue d'ensemble
Version majeure avec améliorations UX, statistiques, et support étendu.

---

## Phase 1 : Corrections de bugs critiques
**Priorité : HAUTE | Durée estimée : 1-2h**

### 1.1 Fix MathQuill
- [ ] Revoir la détection des champs MathQuill (multiples sélecteurs)
- [ ] Fix notation ensemble ℝ\{x} qui ne s'affiche pas
- [ ] Améliorer communication content script ↔ inject script
- [ ] Ajouter logs détaillés pour debug

### 1.2 Fix timeout script injecté
- [ ] Augmenter timeout ou ajouter retry
- [ ] Fallback plus intelligent

---

## Phase 2 : Architecture et stockage
**Priorité : HAUTE | Durée estimée : 1h**

### 2.1 Module de stockage (storage.js)
- [ ] Créer fichier storage.js dédié
- [ ] Fonctions : saveExercise(), getExercise(), saveStats(), getStats()
- [ ] Limite de taille : garder seulement les 100 derniers exercices
- [ ] Structure données :
  ```js
  {
    exercises: { hash: solution },  // Cache exercices
    stats: { total, success, failed, avgTime },
    settings: { theme, sounds, shortcuts }
  }
  ```

### 2.2 Système de hash pour exercices
- [ ] Créer hash unique par exercice (texte + type)
- [ ] Vérifier cache avant appel API

---

## Phase 3 : Sélection du modèle IA
**Priorité : MOYENNE | Durée estimée : 30min**

### 3.1 Options de modèle
- [ ] Ajouter sélecteur dans options.html
- [ ] Modèles disponibles :
  - mistral-small-latest (rapide, économique)
  - mistral-medium-latest (équilibré)
  - mistral-large-latest (précis, coûteux)
- [ ] Sauvegarder préférence

---

## Phase 4 : Statistiques
**Priorité : MOYENNE | Durée estimée : 1-2h**

### 4.1 Collecte des stats
- [ ] Compteur exercices résolus
- [ ] Compteur succès/échecs
- [ ] Temps moyen par exercice
- [ ] Exercices par type (QCM, input, etc.)

### 4.2 Affichage dans l'UI
- [ ] Section "Stats" dans le panneau
- [ ] Mini graphique ou barres de progression
- [ ] Bouton reset stats

---

## Phase 5 : Thème sombre
**Priorité : BASSE | Durée estimée : 30min**

### 5.1 Toggle thème
- [ ] Ajouter bouton toggle dans l'UI
- [ ] CSS variables pour couleurs
- [ ] Sauvegarder préférence
- [ ] Thème clair par défaut

---

## Phase 6 : Raccourcis clavier
**Priorité : MOYENNE | Durée estimée : 30min**

### 6.1 Raccourci principal
- [ ] Ctrl+Enter : ouvrir/fermer l'interface
- [ ] Listener global sur la page
- [ ] Éviter conflits avec Kwyk

---

## Phase 7 : Notifications sonores
**Priorité : BASSE | Durée estimée : 15min**

### 7.1 Beep simple
- [ ] Son succès (exercice validé)
- [ ] Son erreur (optionnel)
- [ ] Toggle on/off dans settings
- [ ] Utiliser Web Audio API (pas de fichier)

---

## Phase 8 : Support tableaux de variation
**Priorité : HAUTE | Durée estimée : 2-3h**

### 8.1 Analyse des tableaux
- [ ] Détecter structure tableau HTML
- [ ] Extraire les cases à remplir
- [ ] Envoyer structure à l'IA

### 8.2 Remplissage des tableaux
- [ ] Mapper réponses IA → cases tableau
- [ ] Gérer signes (+, -, 0)
- [ ] Gérer flèches (↗, ↘)

---

## Phase 9 : Optimisations
**Priorité : BASSE | Durée estimée : 1h**

### 9.1 Performance
- [ ] Lazy loading de l'UI
- [ ] Debounce détection exercice
- [ ] Réduire taille du code

### 9.2 Cache intelligent
- [ ] Détecter exercices similaires
- [ ] Réutiliser solutions proches

---

## Ordre d'implémentation recommandé

1. **Phase 1** - Fix bugs (obligatoire)
2. **Phase 2** - Architecture stockage (fondation)
3. **Phase 3** - Sélection modèle (rapide à faire)
4. **Phase 6** - Raccourcis clavier (rapide)
5. **Phase 7** - Sons (rapide)
6. **Phase 4** - Statistiques (fun)
7. **Phase 5** - Thème sombre (cosmétique)
8. **Phase 8** - Tableaux de variation (complexe)
9. **Phase 9** - Optimisations (polish)

---

## Fichiers à créer/modifier

| Fichier | Action | Description |
|---------|--------|-------------|
| storage.js | CRÉER | Module de stockage |
| sounds.js | CRÉER | Module sons |
| stats.js | CRÉER | Module statistiques |
| content.js | MODIFIER | Intégrer modules, fix bugs |
| inject.js | MODIFIER | Fix MathQuill |
| options.html | MODIFIER | Ajouter sélecteur modèle |
| options.js | MODIFIER | Sauvegarder modèle |
| styles.css | MODIFIER | Thème sombre, stats UI |
| manifest.json | MODIFIER | Permissions storage |

---

## Commandes de test

```bash
# Vérifier structure
ls -la kwyk-V12/

# Tester extension
# 1. chrome://extensions
# 2. Charger l'extension non empaquetée
# 3. Aller sur kwyk.fr
```

---

## Notes

- Toujours tester après chaque phase
- Garder V11 comme backup
- Commiter après chaque phase fonctionnelle
