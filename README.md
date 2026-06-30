# Revue Projet OT — Pré-chiffrage CEE / Coup de Pouce

Application web **mono-fichier** (`index.html`), **vanilla JS**, **100 % client-side**.
Petite sœur d'**AuditVT Comparator** (même équipe). **Identité visuelle reprise d'AuditVT** :
thème clair (fond `#F4F7FC`, primaire bleu `#1B3F8B`), header en dégradé bleu, fonts **Montserrat + Nunito**,
boutons et badges « statut » identiques. Aucun backend,
aucune base de données. Tout fonctionne **hors-ligne** sauf l'unique appel d'extraction IA (OpenRouter).

> Objectif : avant d'engager des moyens sur un dossier de rénovation énergétique, produire un
> **pré-chiffrage rapide** — extraire les surfaces de travaux des Visites Techniques (VT) PDF,
> calculer la **valorisation CEE**, estimer **charges & marges**, et trancher **GO / NO-GO**.

---

## 1. Installation & lancement

Aucune installation, aucun build. Ouvrir `index.html` dans un navigateur récent
(Chrome / Edge / Firefox). Les librairies sont chargées via CDN (épinglées) :

| Librairie | Version | Rôle |
|-----------|---------|------|
| pdf.js (Mozilla) | 3.11.174 | Extraction du texte des VT PDF (`extractPdfText`) |
| SheetJS (xlsx) | 0.18.5 | Parsing des 2 fichiers de paramètres `.xlsx` |
| OpenRouter | API | Unique appel IA : extraction structurée VT → JSON |

> Pour un usage 100 % hors-ligne (hors appel IA), télécharger les 2 librairies en local
> et remplacer les URL CDN par des chemins relatifs.

---

## 2. Première configuration (onglet ⚙️ Paramètres)

1. **Clé API OpenRouter** + **modèle d'extraction** (voir §6).
2. **VALORISATION_TEMPLATE.xlsx** → table de lookup CEE (récap : nb lignes + pollueurs détectés).
3. **Charges.xlsx** → barème de prix unitaires (tableau affiché).
4. **Montant fixe Audit VT** (€/habitation), **% Régie commerciale** (défaut 12), **Seuil GO/NO-GO**.

Tous les paramètres + les 2 tables parsées sont **persistés en `localStorage`**.

> 🔒 **Sécurité** : la clé API est stockée **en clair** dans le `localStorage` du navigateur (comme AuditVT).
> **Usage local uniquement** — ne pas déployer publiquement avec une clé partagée. La clé n'est **jamais journalisée**.

---

## 3. Usage — les 5 étapes (wizard)

### Étape 1 — Chargement des VT
- Choisir le **cas de figure** :

| Cas | Bien | VT |
|-----|------|----|
| 1 | Appartement / logement simple | 1 VT (Habitation) |
| 2 | Maison / pavillon | 1 VT **ITE dédiée** + 1 VT intérieure (Habitation) |
| 3 | Immeuble | 1 VT **ITE façade** + N VT appartements (1 par habitation) |

- Glisser-déposer les PDF, attribuer à chacun son **rôle** : *Habitation* ou *VT ITE dédiée*.
- **Règle ITE** : quand une VT ITE dédiée existe, elle **domine** et fournit les mesures de l'ITE
  globale ; les infos ITE des VT d'appartements ne priment pas. La VT ITE **n'est pas une habitation** :
  pas de questions par-habitation, **pas de montant fixe Audit VT**.

### Étape 2 — Valorisation CEE
- **Questions générales** (toutes VT) : *Pollueur/mandataire* (liste lue depuis le template, non codée en dur).
- **Questions par habitation** : *Type de revenus* (Classique / Précaire), *Coup de Pouce* (Oui/Non),
  *Nb de sauts de classe* (2 / 3 / 4 et +), *Shab* (extraite, modifiable).
- La prime est un **lookup déterministe** dans le template (voir §5.1) — **l'IA ne calcule jamais ce montant**.

### Étape 3 — Extraction des données VT & sélection
- Bouton **« Extraire toutes les VT »** (ou par VT). L'IA renvoie un JSON structuré (§5.2).
- 5 catégories : **ITE, ITI, Combles, Plancher, Fenêtres**, détaillées par instance/pièce
  (description, pièce, surface nette, surface brute).
- **Cases à cocher** : décocher = exclure du calcul (ex. WC, salle de bains). Tout coché par défaut.
- **Tout est éditable** : si l'extraction échoue, Shab et surfaces restent saisissables à la main
  (ajout/suppression de lignes possible).
- Toggle **surface nette / brute** appliqué à tous les calculs.
- Assertion *« toutes parois détectées »* : alerte si une paroi repérée dans le texte est absente de l'extraction.

### Étape 4 — Calculs charges & marges
Pour chaque catégorie cochée (en M²) :
- **Coût de revient HT** = Σ ( surface × *Px Achat HT* )
- **Prix de vente HT** = Σ ( surface × *Prix vente HT* )

Puis : **+ Audit VT** (fixe, par habitation — pas pour la VT ITE) **+ Régie** (12 %, paramétrable, des charges).
- **Reste à charge ménage** = Prix de vente HT − Prime CEE
- **Marge** = Prix de vente HT − Coût de revient total (travaux + Audit VT + 12 %)
- **GO / NO-GO** selon le seuil de marge.
- **Cas immeuble** : récap par habitation **et** total agrégé (+ bloc ITE globale).
- Lignes optionnelles **PC** (radiateurs, ballons, VMC, rampants, toit-terrasse) saisissables manuellement (quantité).

### Étape 5 — Rapport
- **« Rapport Excel (.xlsx) »** (unique bouton) : classeur téléchargeable `rapport-revue-projet-ot.xlsx` — une feuille
  **Synthèse** (1 ligne par habitation/VT + total, valeurs numériques exploitables) **+ une feuille détaillée par VT**.

---

## 4. Réutilisation du code AuditVT

- ✅ **Repris/adapté** : `extractPdfText`, la détection d'instances/parois (`instanceHints`,
  anti-cross-talk ITE/ITI & combles/plancher, assertion « toutes parois détectées »), le pattern d'UI d'affichage.
- ❌ **Non repris** : le `callAI` orienté-**verdicts** et toute la logique de **comparaison/référentiel**.
  Ici l'appel IA est une **extraction structurée pure** (VT → JSON, §5.2). Le gros fichier prod
  (~11 800 lignes) **n'a pas été refactoré** — la fonction d'extraction a été réimplémentée proprement.

---

## 5. Schémas de données & logique

### 5.1 — `VALORISATION_TEMPLATE.xlsx` (lookup déterministe)
Onglet `Feuil1`, en-têtes **ligne 2**, données dès la **ligne 3**. Colonnes utilisées (par position) :

| Col | Rôle |
|-----|------|
| A | Nb sauts classe (`2` / `3` / `4 et +`) |
| B | kWhc (base) · C | Fact correctif |
| D | Shab (libellé de tranche) |
| G | Pollueur/mandataire |
| J | CDP (`OUI`/`NON`) · K | CEE (`Classique`/`CEE Précaire`) |
| L | kWhc final (= B × C / 1000) |
| N | Valo (€/unité) · O | **Valo CEE** (= L × N) |

**Algorithme** : tranche Shab (`<35`, `35–60`, `60–90`, `90–110`, `110–130`, `>130`) → ligne unique
matchant *Pollueur + CEE + CDP + Nb sauts + tranche*. Prime = **colonne O** ; si O vide → recalcul `O = L × N`
(et `L = B × C / 1000` si besoin). Aucune ligne → **erreur claire « hors barème »** (rien d'inventé).

### 5.2 — Objet d'extraction (sortie IA)
```json
{
  "shab_m2": 0,
  "categories": {
    "ITE":      [{ "description": "", "piece": "", "surface_nette": 0, "surface_brute": 0 }],
    "ITI":      [{ "description": "", "piece": "", "surface_nette": 0, "surface_brute": 0 }],
    "Combles":  [{ "description": "", "piece": "", "surface_nette": 0, "surface_brute": 0 }],
    "Plancher": [{ "description": "", "piece": "", "surface_nette": 0, "surface_brute": 0 }],
    "Fenetres": [{ "description": "", "piece": "", "surface_nette": 0, "surface_brute": 0 }]
  }
}
```
Parsing **sûr** : retrait des fences ```` ```json ````, `try/catch`, catégorie absente → `[]`.

### 5.3 — `Charges.xlsx` (prix unitaires)
Onglet `Feuil1`, **transposé** : ligne 1 = catégories (col A = libellés), ligne 2 = Unité (`M2`/`PC`),
ligne 3 = `Px Achat HT`, ligne 4 = `Prix vente HT`.
Catégories : `ITI, Fenetres, Combles, Rampants, Planchers, Radiateurs, Ballon Thermo, Ballon Hybrid, ITE, Toit Terrasse, VMC`.
**Mapping** extrait → charges : `ITE→ITE, ITI→ITI, Combles→Combles, Plancher→Planchers, Fenetres→Fenetres`.

---

## 6. Modèles OpenRouter recommandés

Extraction sur **texte** (pas image) → un bon modèle texte FR à sortie JSON suffit. Sélecteur ouvert
(slug modifiable sans toucher au code). `thinking` désactivé (`reasoning.enabled=false`), `temperature=0`,
`response_format: json_object`. Endpoint : `https://openrouter.ai/api/v1/chat/completions`.

1. `google/gemini-2.5-flash-lite` — **défaut**, le moins cher.
2. `google/gemini-2.5-flash` / `google/gemini-3-flash-preview` — fallback qualité.
3. `openai/gpt-5-mini` — alternative autre fournisseur.

> ⚠️ Vérifier les slugs exacts au moment de l'usage (l'écosystème bouge ; `gemini-2.5-flash` est
> annoncé en fin de vie sur Vertex pour oct. 2026). Le champ « Autre (slug) » permet d'en changer librement.

---

## 7. Limites connues & points ouverts

- **Localisation IDF / Autre** : champ **retiré** (aucune dimension IDF dans le template v1, donc sans impact CEE).
  À réintroduire si OT Énergie fournit un barème différencié IDF.
- **Lignes en PC** (radiateurs, ballons, VMC) + **Rampants / Toit-Terrasse** : non auto-extraites de la
  géométrie → **saisie manuelle optionnelle** (quantité). *Périmètre à confirmer.*
- **Seuil GO/NO-GO** : valeur de marge paramétrable, **valeur métier à définir** avec OT Énergie (défaut 0).
- **Régie 12 %** : appliquée aux **charges travaux** (paramétrable).
- **Export rapport** : HTML imprimable + bouton « Imprimer en PDF » (choix par défaut).
- **Sécurité** : clé API en clair dans `localStorage` — usage local, jamais journalisée.

---

## 8. Fichiers du projet

```
revue-projet-ot/
├── index.html                          ← l'application complète (mono-fichier)
├── README.md
├── params/
│   ├── VALORISATION_TEMPLATE.xlsx       ← exemple (144 lignes : 2 pollueurs × … )
│   └── Charges.xlsx                     ← exemple (11 catégories)
├── gen_params.js                        ← (dev) génère les 2 xlsx d'exemple
└── test_logic.js                        ← (dev) valide parse + lookup + calcul (node test_logic.js)
```

> Les `.xlsx` de `params/` sont des **exemples illustratifs** (valeurs inventées, cohérentes : O = L × N).
> Les remplacer par les vrais barèmes OT Énergie via l'onglet Paramètres.

**Tests** : `node test_logic.js` (nécessite `npm install xlsx`) — vérifie 144 lignes, pollueurs lus
dynamiquement, 3 combinaisons connues (O = L × N), erreur hors-barème, unicité, mapping charges, et la
chaîne de calcul coût de revient / reste à charge / marge.
