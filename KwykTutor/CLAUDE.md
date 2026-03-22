# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kwyk Tutor V17 is a Chrome Extension (Manifest V3) that provides AI-powered math tutoring on Kwyk.fr. It uses the Mistral AI API to solve exercises and can auto-fill answers.

**V17i key changes (simplification pipeline + corrections formatage):**

### Philosophie V17i — Simplicité avant tout

- **`buildIntervalFromSigns()` simplifié** : suppression de TOUTES les heuristiques complexes (alternance forcée, détection carrés, expansion signe unique, fusion interdites). Le code fait le minimum : normalise les signes, valide N+1, construit l'intervalle. Si les données IA sont incohérentes → `null` → fallback sur la réponse texte de l'IA.
- **Ne PAS vérifier les signes de l'IA** : ce n'est pas le rôle du code. Si l'IA donne des signes faux, c'est une limitation du modèle.
- **Le prompt demande la vraie réponse** dans `"reponse"` (plus de `"auto"` ou `"IGNORÉ"`), ce qui donne toujours un fallback exploitable.

### Bugs corrigés (V17i)

- **BUG critiques mal ordonnées par l'IA (fractions négatives):**
  L'IA confond l'ordre de `-9/7` vs `-3/2` → critiques et réponse texte inversées.
  **Fix:** `buildIntervalFromSigns()` trie les critiques par valeur numérique via `parseCriticalValue()`. Si l'ordre change → signes non fiables → retourne `null`. Nouveau helper `fixIntervalBounds()` corrige les bornes inversées dans la réponse texte IA (swap gauche/droite si gauche > droite, crochets suivent leurs valeurs).

- **BUG parenthèses inutiles `{-(2)}` dans ensembles:**
  `convertToLatex()` ne nettoyait pas `-(digit)` avec parenthèses superflues.
  **Fix:** Regex `/-\((\d+)\)(?!\/)/` → `-digit` et `/(?<!\/)\((\d+)\)(?!\/)/` → `digit` (protégé contre les fractions `(a)/(b)` par lookahead/lookbehind sur `/`).

- **BUG espaces dans ensembles `{ -2 }`:**
  Espaces autour des valeurs et du `;` dans les ensembles.
  **Fix:** `value.trim()` au début de `convertToLatex()` + `\s*;\s*` → `;` pour supprimer les espaces autour des séparateurs.

- **BUG classification manquée `6x(x²+5)<=0`:**
  Expressions avec `x(` ou `)x` non détectées comme inéquations.
  **Fix:** Ajout patterns `[x\d]\s*\(` et `\)\s*[x\d]` dans `classifyQuestion()`.

- **BUG double inéquation `-41<=-1+4x<=31` sans guidance:**
  L'IA n'avait pas d'exemple pour les doubles inéquations.
  **Fix:** Ajout EXEMPLE 3 dans le prompt `input` pour les doubles inéquations.

- **BUG système de mise à jour en boucle:**
  Après mise à jour, l'extension redemandait la MAJ en boucle.
  **Fix:** `checkRemoteConfig()` compare avec `LOCAL_VERSION` ET `kwykInstalledVersion` (stocké dans `chrome.storage.local`). `performInlineUpdate()` ne stocke la version que quand TOUS les fichiers sont mis à jour avec succès.

- **BUG prompt inéquation renvoyait `"auto"` au lieu de la vraie réponse:**
  Le prompt disait `"IGNORÉ (calculé auto)"` → l'IA écrivait littéralement "auto" dans MathQuill.
  **Fix:** Le prompt demande maintenant la vraie réponse dans `"reponse"` (ex: `[-1;(2)/(3)[`).

### Bugs conservés de V17h

- **`\left]`/`\right[` INTERDITS** dans `convertToLatex()` (MathQuill les rejette)
- **inject.js vérifie `mathField.latex()`** après insertion (success: false si vide)
- **Comparaison extraite du contexte** (override IA si différente)
- **Normalisation signes** : `valide/positif` → `+`, `invalide/négatif` → `-`
- **Validation N+1** signes pour N critiques
- **Singletons groupés** en `{v1;v2}` (évite regex greedy)
- **Retry LaTeX simplifié** dans `autoFillInput()` si MathQuill rejette

### Limitation connue du modèle

Mistral medium (`mistral-medium-latest`) fait des erreurs arithmétiques sur les calculs décimaux et les tests de signes (ex: tous les signes `"-"` alors qu'ils devraient alterner). Pas de fix côté code — les signes faux donnent une mauvaise réponse. Recommandation : `mistral-large-latest` pour plus de fiabilité.

### Règles MathQuill (NEVER violate)

1. **`\left]` et `\right[` sont INTERDITS** — MathQuill exige `\left` avec un délimiteur ouvrant (`(`, `[`) et `\right` avec un fermant (`)`, `]`). Les crochets inversés causent un stockage vide.
2. **`write()` vs `latex()`** : utiliser `latex()` par défaut (plus robuste pour fractions). `write()` uniquement quand le LaTeX contient `\mathbb` (sinon `latex()` convertit `\mathbb{R}` en ℝ Unicode).
3. **Toujours vérifier** `mathField.latex()` après insertion — si vide, le LaTeX a été rejeté.

### Versions précédentes (résumé consolidé V17c→V17h)

- **V17h** : Audit pipeline formatage, prompts niveau Seconde, heuristiques alternance/carrés (supprimées en V17i)
- **V17g** : Type `inequation` séparé, `buildIntervalFromSigns()` déterministe, `formatSolution()` post-processing
- **V17f** : `getBasePrompt()` refait (JSON only, ~12 lignes), `verifyAndCorrect` supprimé
- **V17c-e** : Unicode normalization `−`→`-`, AbortController, extraction consignes format, crochets strict/large, simplification unions, approche test direct pour inéquations

**V17 key changes:**
- Panel side positioning — user chooses left/right at first connection; changeable in options
- `panelSide` stored in `chrome.storage.sync`; `applyPanelSide(side)` adds/removes `body.kwyk-side-left`
- First-connection flow: no pseudo → pseudo prompt → side prompt; has pseudo but no side → side prompt only
- **BUG FIX `cleanJSON()`:** `\{` and `\}` (and all unknown LaTeX escapes) now doubled (`\\{`) instead of replaced with space — JSON.parse produces `\{x\}` correctly; only `"`, `\`, `/`, `u` are kept as valid JSON escapes (`b/f/n/r/t` excluded — would corrupt `\frac`, `\theta`, `\beta`)
- **BUG FIX `convertToLatex()`:** `{1, 2}` → `\{1, 2\}` — MathQuill's `latex()` setter treated `{x}` as invisible LaTeX grouping; now converted to `\{x\}` for visible braces

**V17b key changes (mode explication refondu):**
- JSON réponse IA : `notion`+`methode` remplacés par `regle` (une phrase) + `exemple` (énoncé + étapes) ; `etapes` devient `[{titre, calculs[]}]`
- `formatSolution()` : lit `regle` (fallback `notion`/`methode` pour rétrocompat) + `exemple`
- `mergeResults()` : fusionne `regle` avec ` | ` ; propage `exemple` du 1er résultat
- `parseFallback()` : extrait `regle` (regex `"regle"`) + fallback `notion`
- Nouveau helper `cleanText(text)` : supprime `××...××`, `**`, `__`, listes numérotées/à tirets
- Nouveau helper `renderSteps(etapes)` : aplatit `{calculs[]}` ou strings ; `"---"` → `<hr class="kwyk-step-sep">` ; dernière ligne en gras ; applique `cleanText()`
- Mode `explain` : règle + étapes + réponse encadrée en bas (tableau ou answer box)
- `getBasePrompt()` : règles strictes — `regle` = 1 phrase MAX 120 chars (propriété cours uniquement), `etapes` = calculs mathématiques uniquement (JAMAIS de phrase en français), interdit `××`/`**`, `"---"` pour séparer les phases ; conseils niveau Seconde (pas de dérivées, vocabulaire accessible)
- Mode `explain` : affiche règle + étapes uniquement (cadre vert de réponse supprimé)
- Ctrl+Enter : masque bouton ET panel (si visibles) → réaffiche le bouton seul (panel reste fermé) au second appui
- `tableau_variations` : exemples few-shot sans `f'(x)` → raisonnement par forme de la parabole/fonction
- Mode `explain` : règle (`.kwyk-rule-box`) + étapes numérotées avec titre italique + calculs empilés
- Mode `hint` → bouton renommé **"Règle"** : règle + exemple du cours (`.kwyk-exemple-box`) sans réponse de l'exercice
- CSS : `.kwyk-section-notion/formula/hint/title` supprimés → remplacés par `.kwyk-rule-box`, `.kwyk-exemple-box`, `.kwyk-step-titre`, `.kwyk-step-calculs`, `.kwyk-step-calc`, `.kwyk-step-calc-last`

**V16 key changes:**
- Modular prompt system — exercises are classified by type, only relevant prompt module (with few-shot example) is sent
- MathJax-aware label extraction (`extractLabelWithMath`) for QCM/checkbox options containing fractions, powers, etc.
- Global DOM fallback detection when Kwyk places inputs outside `.exercise_question` blocks
- Robust JSON parsing — handles AI text after closing ``` block
- `formatSolution()` normalizes unexpected response formats (array/object → string)
- Cheat mode blocked for tableau_signes, tableau_variations, tableau_valeurs (pedagogique mode suggested)
- User management system — UUID-based identification, pseudo, admin can enable/disable/rename/lock users
- Sign table prompt improvement — explicit verification rule for leading coefficient + second few-shot example
- Per-question type classification — each question in a multi-question exercise gets its own type and API call
- Shared context injection — Q2+ receives Q1's context so it knows the function/graph
- Per-question result display — each question tab shows its own API response (not merged)
- Variation table simple format — `values` contains only arrows (↗/↘) and separators (||), no numeric f-values
- `renderSimpleVariationTable()` for pure-arrow variation tables with proper column layout

## Architecture

```
popup.html/popup.js         → API status check + mode selector (pedagogique/triche) + link to options
options.html/options.js     → Config (API key, model, mode, cheat options, user pseudo, panelSide)
content.js (~4400 lines)    → Main logic, runs in Kwyk page (isolated world)
inject.js                   → Runs in page context (MAIN world) for MathQuill access
background.js               → Service worker: extension reload + tab management
styles.css                  → All UI styling (includes body.kwyk-side-left overrides)
update.html                 → Standalone update page (legacy, kept for reference)
```

**External admin tool (outside extension folder):**
```
C:\Users\morga\Documents\Code\Projet\Kwyk\adminV2.html
  → GitHub Gist management: blocked periods, blocked exercises (with mode), update config, changelog, update_enabled toggle, user management
```

**Communication flow:**
- `content.js ↔ inject.js`: via `window.postMessage` (different JS worlds)
- `content.js → background.js`: via `chrome.runtime.sendMessage`
- `options.js / popup.js → content.js`: via `chrome.storage.onChanged` events

**Why inject.js exists:** MathQuill (MQ) library is only accessible from page context. inject.js receives LaTeX via postMessage and calls either `MQ.latex(latex)` (default — more robust for fractions in intervals) or `MQ.write(latex)` when latex contains `\mathbb` (preserves `\mathbb{R}` — `latex()` would convert it to ℝ Unicode that Kwyk rejects). After insertion, inject.js vérifie `mathField.latex()` — si vide, renvoie `success: false` (V17h).

## Key content.js Structure

content.js is an IIFE containing all logic. Key sections in order:

1. **Config & state** (~line 95): `config` (includes `panelSide: null`), `currentExercise`, `cachedSolution`, `cheatModeActive`
2. **init()** (~line 815): Remote config check → load config → create UI → pseudo prompt → side prompt → normal init
3. **Update system** (~line 200): `performInlineUpdate()` — mandatory update blocks the panel
4. **showPseudoPrompt() / showSidePrompt()** (~line 476/546): First-connection flows — pseudo then side, or side alone
5. **applyPanelSide(side)** (~line 966): Adds/removes `body.kwyk-side-left` class for left/right positioning
6. **extractLabelWithMath()** (~line 630): Converts MathJax in QCM/checkbox labels to readable math text via `mathMLToText()`
5. **`buildIntervalFromSigns()`** (~line 1898): Construction déterministe d'intervalle à partir des données IA (critiques, interdites, signes, comparaison). Tri critiques par valeur numérique, normalisation signes, validation N+1, gestion singletons. Retourne `null` si critiques mal ordonnées ou signes incompatibles → fallback sur réponse texte IA corrigée par `fixIntervalBounds()`.
5b. **`fixIntervalBounds()`** (~line 1881): Corrige les bornes inversées dans un intervalle texte (gauche > droite → swap). Utilisé en fallback quand `buildIntervalFromSigns()` retourne `null`.
6. **V15: Exercise classification** (~line 1890): `classifyExercise()` — DOM + text + global fallback → returns exercise type
7. **Exercise detection** (~line 1975): `detectExercise()`, `analyzeQuestionBlock()`, hash-based change detection. Stores `currentExercise.exerciseType`
7. **Raphael graph extraction** (~line 2070): Parses JSON from SVG graph spans into `[Graphique X : y = expr]`
8. **V15: Modular prompts** (~line 2320): `getBasePrompt()` + `getTypePrompt(type)` + `getSystemPrompt(type)`
9. **API call** (~line 2560): `solveProblem()` → passes `exerciseType` to `getSystemPrompt()` → Mistral API
10. **JSON parsing** (~line 2625): Handles ```json blocks with text after closing ```, triple fallback
11. **formatSolution()** (~line 2761): Normalizes AI response — handles `r.reponse` as string, array, or object
12. **Display** (~line 2900): `displaySolution()`, `renderSignTable()`, `renderVariationTable()`
13. **Auto-fill** (~line 3100): `autoFillInput()` (avec retry LaTeX simplifié V17h), `autoFillRadio()`, `autoFillCheckbox()` — all use `extractLabelWithMath`
14. **Cheat mode** (~line 3150): `executeCheatMode()` with retry logic, auto-validate, auto-next. Blocked for tableau types.

## V15: Modular Prompt System

**Architecture:**
```
getSystemPrompt(exerciseType)
    = getBasePrompt()           → ~15 lines: JSON rules, math formatting (universal)
    + getTypePrompt(type)       → ~20 lines: response format + concrete few-shot JSON example
```

**Exercise types detected by `classifyExercise()`:**

| Type | Detection method |
|---|---|
| `qcm_simple` | DOM: `input[type="radio"]` |
| `qcm_multiple` | DOM: `input[type="checkbox"]` |
| `input` | DOM: `input[type="text"]` or `.mq-editable-field` |
| `tableau_signes` | Text keywords: "tableau de signes", "signe de" |
| `tableau_variations` | Text keywords: "tableau de variations", "variations de" |
| `tableau_valeurs` | Text marker: `[Tableau]` (injected by prettytable extraction) |
| `graphique` | Text marker: `[Graphique` (injected by Raphael extraction) |

**Detection priority:** graphique → tableau_signes → tableau_variations → tableau_valeurs → qcm_multiple → qcm_simple → input → global DOM fallback → unknown

**Global DOM fallback:** When no question has a known type, `classifyExercise` searches the entire page for `input[id^="id_answer_"]` checkboxes/radios/text fields and enriches the questions with found options.

**Cheat mode restrictions:** tableau_signes, tableau_variations, and tableau_valeurs are blocked in cheat mode (auto-fill unreliable for these). User is prompted to switch to pedagogique mode.

**Fallback:** If type is `unknown`, defaults to `input` prompt.

## V15: MathJax Label Extraction

`extractLabelWithMath(element)` clones the element, converts all `mjx-container` nodes to readable math via `mathMLToText()`, then returns `textContent`. Used in:
- `analyzeQuestionBlock()` — radio/checkbox label extraction for AI prompt
- `autoFillRadio()` / `autoFillCheckbox()` — label matching for auto-fill

This fixes exercises where QCM options contain fractions like `(53)/(2)` that were previously garbled by raw `textContent`.

## V15: Robust Response Parsing

- **JSON block extraction:** Cuts at first closing ``` instead of requiring it at end-of-string. Handles AI adding remarks/examples after the JSON block.
- **formatSolution() normalization:** When AI returns `r.reponse` as an array of objects (e.g., `[{symbole: ">"}]`), each element is extracted as an individual response string. Prevents "Solution IA vide" false positives.

## Update System

**Mandatory update flow:**
1. `checkRemoteConfig()` fetches GitHub Gist config
2. If `update_enabled !== false` and version mismatch → `window._kwykUpdateAvailable` is set
3. In `init()`, if update available: all panel content is hidden, only the update banner + changelog is shown
4. User must click "Mettre a jour" (inline File System Access API) to unlock the extension
5. After update: `chrome.storage.local` saves installed version, extension reloads via `background.js`

**Gist config fields:**
- `version` — latest version string
- `update_enabled` — boolean toggle (admin.html controls this)
- `changelog` — array of strings displayed under the update button
- `update_repo`, `update_branch`, `update_path`, `update_files` — GitHub source config
- `blocked_periods` — exam blocking periods
- `blocked_exercises` — array of `{id, mode}` objects (see Blocked Exercises section)
- `gist_token_rev` — GitHub PAT stocké inversé (anti-secret-scanning)

## Critical Conventions

**AI response format:** The system prompt requires JSON with `(num)/(den)` fractions (NOT `num/den`), `^` for powers, `√` for roots, `ℝ{x}` for excluded sets. Responses must be copy-paste ready for Kwyk.

**`convertToLatex()` — conversions appliquées (dans l'ordre) :**
1. `/[...]` → `/((...))` — crochets dans dénominateur
2. `(√n)/(d)` → `(1)/(d)√n` — racine au numérateur
3. `n*x` → `nx` — suppression `*`
4. `a/b` → `(a)/(b)` — normalisation fractions simples
5. `(a)/(b)` → `\frac{a}{b}` — fractions numériques
6. `(...)/(...)` → `\frac{...}{...}` — fractions générales
7. `√(...)` / `sqrt(...)` → `\sqrt{...}` — racines
8. `√n` → `\sqrt{n}` — racine simple
9. `^n` → `^{n}` — puissances
10. `ℝ{x}` → `\mathbb{R}\setminus\left\{x\right\}` — ensemble exclus
11. `ℝ` → `\mathbb{R}`
12. **`{1, 2}` → `\{1, 2\}`** — ensemble solution (toute valeur enveloppée dans `{}` sans accolades imbriquées)
13. `∅` → `\varnothing` — ensemble vide (V17g)

**⚠️ INTERDIT dans `convertToLatex()` (V17h):** NE JAMAIS ajouter `\left]`/`\right[` (crochets inversés). MathQuill les rejette → stockage vide → champ vide. Les crochets `]` et `[` restent en taille normale.

**Logging:** Always prefix with `[Kwyk Tutor]`: `console.log('[Kwyk Tutor] message')`

**Response parsing:** `formatSolution()` handles multiple response formats:
- `r.reponse` (string) → single answer
- `r.reponse` (array) → each element extracted as individual response (V15)
- `r.reponse` (object) → extracts symbole/valeur/reponse field (V15)
- `r.reponses` (string array) → QCM multiple, extracts letters
- `r.reponses` (object array with `{case, valeur}`) → table values, extracts individually

**Checkbox matching (autoFillCheckbox):** Tries full-text exact match first before splitting on commas. This prevents labels containing commas (e.g., "Ni constante, ni lineaire") from being split incorrectly.

**Sign/variation tables:** AI returns a `tableau` field at JSON root with `{type, headers, rows}` for structured display, plus individual `reponses[]` strings for cheat mode auto-fill.
- `type: "signes"` → flat sign table rendered by `renderSignTable()` (values: +, -, 0, ||). Label always shows "f(x)".
- Sign tables have ALWAYS exactly ONE row. Pattern: sign, 0, sign, 0, sign. For 1 critical value → 3 values, for 2 → 5 values.
- Sign rule for degree 2: if leading coefficient a > 0 → starts and ends with +; if a < 0 → starts and ends with -. The prompt includes an explicit verification rule and a second few-shot example with negative coefficient.
- `type: "variation"` → variation table rendered by `renderVariationTable()` / `renderSimpleVariationTable()`.
- **Variation table format (CRITICAL):** `values` contains ONLY arrows (↗/↘) and separators (||). NEVER numeric f-values.
  - Continuous function: `"values": ["↘", "↗"]` with headers `["x", "a", "b", "c"]`
  - Discontinuous (asymptote at x=0): `"values": ["↘", "||", "↘"]` with headers `["x", "-∞", "0", "+∞"]`
- `renderVariationTable()` detects simple format (all values are arrows/||) → routes to `renderSimpleVariationTable()`
- `renderSimpleVariationTable()` interleaves boundary columns and interval columns: `x | -∞ | (empty) | 0(sep) | (empty) | +∞`
- Headers containing fractions `(a)/(b)` are rendered as HTML fractions via `formatFractionHtml()`.

**Raphael graph exercises:** Kwyk uses Raphael SVG for graphs. The JSON config is embedded in `<span>` elements. `analyzeQuestionBlock()` extracts these and replaces them with clean `[Graphique A : y = expr]` text.

## Supported Exercise Types

- QCM simple (radio buttons) — cheat mode OK
- QCM multiple (checkboxes) — cheat mode OK
- Text input (plain + MathQuill) — cheat mode OK
- Sign tables, variation tables, value tables — pedagogique mode only (cheat blocked)
- Graphical representation exercises (Raphael SVG) — cheat mode OK

**NOT supported:** interactive graphical exercises (trace curves, place points), drag & drop

## DOM Selectors (Kwyk-specific)

- `.exercise_question` — question block
- `.mq-editable-field.input-kwyk` — MathQuill field
- `input[type="radio"][id^="id_answer_X_"]` — QCM radio
- `input[type="checkbox"][id^="id_answer_X_"]` — QCM checkbox
- `button.exercise_submit` / `button.exercise_next` — validate/next buttons
- `a.active[href^="?id="]` — lien de navigation actif → contient l'ID de l'exercice courant

**Exercise ID extraction:** L'URL ne change pas lors de la navigation entre exercices d'une série (SPA). L'ID courant est lu depuis `a.active[href^="?id="]` via `extractExerciseIdFromUrl()`. Fallback sur `window.location.search` si ce lien est absent.

## User Management System

**Architecture:**
- **Gist 1** (existing): `kwyk-config.json` — config, blocked periods, update (read-only from extension)
- **Gist 2** (`b2ab6441fd1de494a4c3b33af765dcac`): `kwyk-users.json` — user list (read+write from extension via token)

**User data structure in Gist:**
```json
{
  "uuid-xxx": {
    "name": "Pseudo",
    "enabled": true,
    "locked": false,
    "lastSeen": "2026-03-12T..."
  }
}
```

**Flow:**
1. First launch: UUID generated via `crypto.randomUUID()`, stored in `chrome.storage.local`
2. If no pseudo set → panel shows pseudo prompt (blocks all other functionality)
3. On pseudo submit → registered in Gist 2 via GitHub API (PATCH)
4. On each init → `checkUserAccess()` reads Gist 2:
   - User not found → allowed by default
   - `enabled: false` → blocked ("Accès désactivé, contactez l'administrateur")
   - Admin renamed pseudo → local pseudo updated
   - `locked: true` → pseudo field disabled in options
5. `lastSeen` updated on each visit

**Heartbeat supprimé:** Le système de heartbeat (`sendHeartbeat`, `startHeartbeat`, `lastPing`) a été supprimé pour éviter les rate limits GitHub. Plus aucune requête automatique vers le Gist users depuis l'extension.

**Admin controls (adminV2.html):**
- Toggle user enabled/disabled
- Rename user pseudo
- Lock/unlock pseudo modification
- Delete user (immediate save)
- Bouton "🔄 Rafraîchir" — recharge la liste manuellement (plus d'auto-refresh)
- Global "💾 Tout sauvegarder" saves config (Gist 1) + users (Gist 2)

**Token:** Classic GitHub PAT with `gist` scope only. Stocké **inversé** dans `kwyk-config.json` sous la clé `gist_token_rev` pour éviter la détection automatique de GitHub (secret scanning). admin.html inverse le token à la sauvegarde et le ré-inverse à l'affichage. content.js lit `gist_token_rev` et le ré-inverse en mémoire (`split('').reverse().join('')`). Ne jamais stocker le token en clair dans le Gist.

## Blocked Exercises

**Format dans `kwyk-config.json`:**
```json
{
  "blocked_exercises": [
    { "id": 35850955, "mode": "both" },
    { "id": 35850956, "mode": "triche" },
    { "id": 35850957, "mode": "pedagogique" }
  ]
}
```

**Rétrocompatibilité:** Les anciens IDs simples (nombre) sont traités comme `mode: "both"`.

**Modes de blocage:**
- `"both"` → bloqué en pédagogique ET triche → message: `🚫 Exercice bloqué !`
- `"triche"` → bloqué en triche uniquement → message: `🚫 Exercice bloqué en mode triche. Passe en mode pédagogique !`
- `"pedagogique"` → bloqué en pédagogique uniquement → message: `🚫 Exercice bloqué en mode pédagogique. Passe en mode triche !`

**Comportement par mode:**
- **Mode triche** : la section triche reste visible, le switch se désactive, message affiché dans `kwyk-cheat-status`
- **Mode pédagogique** : message affiché dans la zone de réponse (`kwyk-response`), boutons cachés

**Vérification dans `executeCheatMode`:** Le check `checkUnsupportedExercise()` est effectué **en tout premier**, avant d'acquérir le verrou `cheatModeRunning`. Cela empêche l'IA d'être appelée même lors du passage automatique d'un exercice à l'autre.

**Admin (adminV2.html):** Chaque exercice bloqué affiche un `<select>` pour choisir le mode. Le formulaire d'ajout inclut aussi ce sélecteur.

## Cheat Mode — Notifications UI

**`updateCheatStatus(text, type)`** — amélioré :
- `type: 'loading'` → affiche un spinner animé (`.kwyk-spinner`) à côté du texte
- Si panneau fermé + `loading` ou `error` → ouvre le panneau automatiquement
- Si panneau fermé + `success` ou `error` → affiche un toast `#kwyk-toast` (3 secondes, slide-in)

**Messages d'état en mode triche:**
- `"Appel IA en cours..."` — pendant la requête Mistral
- `"Remplissage des réponses..."` — pendant l'auto-fill
- `"✓ Réponse remplie !"` / `"✓ N réponses remplies !"` — succès
- `"🚫 Exercice bloqué !"` (ou avec indication du mode) — exercice admin-bloqué
- `"Tableaux non supportés en mode triche. Utilise le mode pédagogique !"` — tableau type

**CSS ajouté dans `styles.css`:**
- `@keyframes kwyk-spin` + `.kwyk-spinner` — cercle tournant bleu
- `@keyframes kwyk-toast-in` + `#kwyk-toast` — toast slide-in bas-droite
- `.kwyk-cheat-status` passe en `display: flex` pour aligner spinner et texte

**Supprimé:** Le div `#kwyk-unsupported` et ses styles CSS (`.kwyk-unsupported-warning`, `.kwyk-unsupported-joke`) ont été retirés. Les messages d'exercices non supportés/bloqués s'affichent désormais directement dans `#kwyk-response` via une bulle `.kwyk-bubble.error`.

## Multi-Question Exercises

**Per-question classification:**
- `classifyQuestion(question)` — classifies a single question by its context text and DOM type
- `classifyExercise()` — calls `classifyQuestion()` for each question, stores `q.questionType` individually
- Global type = first question's type (for initial display). No "mixed" type exists.

**Separate API calls for mixed types:**
- If questions have different `questionType` values → `solveProblem()` launches one `solveOneQuestion()` per question in parallel via `Promise.all`
- Each question gets its own type-specific system prompt via `getSystemPrompt(q.questionType)`
- `extractSharedContext(questions)` → returns Q1's full context as shared context for Q2+
- Q2+ receives: `Contexte commun à l'exercice (question précédente): [Q1 context]` prepended to its prompt
- This ensures Q2 knows the function/graph from Q1 (e.g., f(x)=1/x from Raphael JSON)

**Per-question result display:**
- After mixed API calls, `mergeResults()` stores individual solutions in `merged.solution._perQuestion[]`
- `displaySolutionForQuestion(index)` uses `_perQuestion[index]` if available, else falls back to merged result
- Q1 tab shows Q1's answer (QCM), Q2 tab shows Q2's answer (variation table) — no cross-contamination

## Remote Blocking

Extension checks a GitHub Gist for blocked periods (exams) and update status. Config URL is hardcoded in content.js. Admin manages this via `adminV2.html`.

## User Preferences

- Always ask before coding ("Demande moi avant de coder" — from README)
- Update README after significant changes
- Project language is French
