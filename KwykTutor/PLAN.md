# Plan V15 — Prompts modulaires par type d'exercice

## Objectif
Remplacer le prompt monolithique (135 lignes envoyées systématiquement) par un systeme modulaire :
- Detection du type d'exercice via le DOM (fiable a 99%)
- Prompt = BASE courte + MODULE TYPE specifique + exemple JSON concret (few-shot)
- L'IA recoit moins d'instructions, plus ciblees, et un exemple a imiter

## Problemes resolus
1. L'IA ne devine plus le type → le code JS le detecte et impose le format
2. Prompt 3-4x plus court → moins de dilution d'attention
3. Exemples concrets (few-shot) → l'IA imite au lieu d'interpreter des regles
4. Un seul format JSON montre par requete → plus de confusion entre structures

## Types d'exercice detectes (DOM)

| Type | Detection DOM |
|---|---|
| `qcm_simple` | `input[type="radio"]` |
| `qcm_multiple` | `input[type="checkbox"]` |
| `input` | `input[type="text"]` ou `.mq-editable-field` |
| `tableau_signes` | Grille interactive signes Kwyk (a identifier dans le DOM) |
| `tableau_variations` | Grille interactive variations Kwyk (a identifier dans le DOM) |
| `tableau_valeurs` | `table.prettytable` avec `?` dans les cellules |
| `graphique` | Spans avec JSON Raphael `{"init":...,"plot":...}` |

## Architecture du prompt

```
getSystemPrompt(exerciseType)
    = getBasePrompt()           // ~30 lignes : regles JSON, formatage math universel
    + getTypePrompt(type)       // ~20 lignes : format de reponse + exemple JSON complet
```

## Phases

### Phase 1 — Detection de type amelioree
- [ ] Creer `classifyExercise(questions)` qui retourne le type precis
- [ ] Differencier tableau_signes / tableau_variations / tableau_valeurs dans le DOM
- [ ] Detecter les graphiques Raphael comme type a part
- [ ] Ajouter `exerciseType` dans l'objet `currentExercise`
- [ ] Logger le type detecte pour debug

### Phase 2 — Prompts modulaires
- [ ] Extraire `getBasePrompt()` : regles JSON + formatage math (commun a tous)
- [ ] Creer `getTypePrompt(type)` avec un module par type :
  - `qcm_simple` : format JSON + exemple concret
  - `qcm_multiple` : format JSON + exemple concret
  - `input` : format JSON + exemple concret
  - `tableau_signes` : regles signes + exemple JSON complet
  - `tableau_variations` : regles variations + exemple JSON complet
  - `tableau_valeurs` : regles calcul + exemple JSON concret
  - `graphique` : regles identification fonctions + exemple JSON
- [ ] Modifier `getSystemPrompt()` pour accepter le type et combiner base + type
- [ ] Fallback : si type inconnu → prompt actuel complet (securite)

### Phase 3 — Integration
- [ ] Passer `currentExercise.exerciseType` a `solveProblem()` → `getSystemPrompt(type)`
- [ ] Modifier `buildPrompt()` pour inclure le type detecte dans le message user
- [ ] Tester sur chaque type d'exercice
- [ ] Ajuster les exemples few-shot selon les resultats

### Phase 4 — Nettoyage
- [ ] Supprimer l'ancien prompt monolithique une fois tout valide
- [ ] Mettre a jour CLAUDE.md et README.md
