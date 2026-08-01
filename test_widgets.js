// Tests du module WIDGETS CONFIGURABLES (Paramètres → 🧩 Widgets).
// Comme test_extraction.js : on extrait les VRAIES fonctions d'index.html (aucune copie),
// on les évalue avec des stubs minimaux, et on vérifie moteur d'expression, liste blanche,
// cycles, division par zéro, et l'ÉQUIVALENCE des formules usine avec le moteur de calcul.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

const start = html.indexOf('const WIDGETS_VERSION');
const end = html.indexOf('function kpiCell(o)');
if (start < 0 || end < 0 || end <= start) { console.error('💥 Module widgets introuvable dans index.html'); process.exit(1); }
const src = html.slice(start, end);

// Stubs des dépendances runtime (jamais appelées par ces tests, sauf num/round2/eur/saveLS)
const num = x => { const v = parseFloat(String(x).replace(',', '.')); return isFinite(v) ? v : 0; };
const round2 = x => Math.round(num(x) * 100) / 100;
const eur = x => round2(x).toFixed(2) + ' €';
const saveLS = () => {};
const state = { widgetConfig: null, settings: {} };
eval(src + '\n;globalThis.WIDGETS_USINE = WIDGETS_USINE; globalThis.WIDGET_VARS = WIDGET_VARS;');

let pass = 0, fail = 0;
const t = (label, cond, detail) => { cond ? pass++ : fail++; console.log((cond ? '✅' : '❌') + ' ' + label + (cond ? '' : (' — ' + (detail || '')))); };
const evalStr = (f, vars) => wfEvalAst(wfParse(f), id => (vars && vars[id] !== undefined) ? vars[id] : null);

// ── E1 : arithmétique, priorités, parenthèses, unaire, normalisation × ÷ − et virgule ──
t('2 + 3 * 4 = 14 (priorité)', evalStr('2 + 3 * 4') === 14);
t('(2 + 3) * 4 = 20 (parenthèses)', evalStr('(2 + 3) * 4') === 20);
t('-5 + 10 = 5 (moins unaire)', evalStr('-5 + 10') === 5);
t('10 ÷ 4 = 2.5 (÷ normalisé)', evalStr('10 ÷ 4') === 2.5);
t('7 − 2 × 3 = 1 (− et × typographiques)', evalStr('7 − 2 × 3') === 1);
t('1,5 + 1 = 2.5 (virgule décimale)', evalStr('1,5 + 1') === 2.5);
t('identifiant résolu', evalStr('a * 2 + b', { a: 10, b: 1 }) === 21);

// ── Erreurs de syntaxe : messages français clairs ──
const perr = f => { try { wfParse(f); return null; } catch (e) { return e.message; } };
t('« 2 + » → formule incomplète', /incomplète/.test(perr('2 +')));
t('« (2+3 » → parenthèse fermante manquante', /Parenthèse fermante/.test(perr('(2+3')));
t('« 2 3 » → symbole en trop', /en trop/.test(perr('2 3')));
t('« 1.2.3 » → nombre invalide', /Nombre invalide/.test(perr('1.2.3')));
t('formule vide refusée', /vide/.test(perr('   ')));

// ── E4 : division par zéro → null (affiché « — »), propagation, jamais NaN ──
t('1 / 0 → null', evalStr('1 / 0') === null);
t('(1/0) + 5 → null (propagation)', evalStr('(1/0) + 5') === null);
t('wgFmt(null) → « — »', wgFmt({ format: 'eur', dec: 2 }, null) === '—');

// ── Format : les DÉCIMALES configurées sont respectées (bug corrigé 2026-07-31) ──
const nb = String.fromCharCode(8239), nbsp = String.fromCharCode(160);
const clean = s => s.replace(new RegExp('[' + nb + nbsp + ']', 'g'), ' ');
t('€ avec 0 décimale → « 2 226 € »', clean(wgFmt({ format: 'eur', dec: 0 }, 2225.92)) === '2 226 €', wgFmt({ format: 'eur', dec: 0 }, 2225.92));
t('€ avec 2 décimales → « 2 225,92 € »', clean(wgFmt({ format: 'eur', dec: 2 }, 2225.92)) === '2 225,92 €', wgFmt({ format: 'eur', dec: 2 }, 2225.92));
t('€ sans dec défini → 2 décimales', clean(wgFmt({ format: 'eur' }, 1500)) === '1 500,00 €', wgFmt({ format: 'eur' }, 1500));
t('% avec 1 décimale → « 25,4 % »', clean(wgFmt({ format: 'pct', dec: 1 }, 25.37)) === '25,4 %', wgFmt({ format: 'pct', dec: 1 }, 25.37));
t('nombre avec 0 décimale → « 12 »', clean(wgFmt({ format: 'num', dec: 0 }, 12.4)) === '12', wgFmt({ format: 'num', dec: 0 }, 12.4));

// ── Widget « Taux de marge » d'usine : marge / vente × 100 ──
const tm = WIDGETS_USINE.find(w => w.niveau === 'hab' && w.id === 'tauxMarge');
t('widget Taux de marge présent, visible, au format %', !!tm && tm.visible === true && tm.format === 'pct');
t('Taux de marge : 730/2000 → 36,5 %', Math.abs(evalStr(tm.formule, { margeCommerciale: 730, prixVenteHT: 2000 }) - 36.5) < 1e-9);
t('Taux de marge : vente 0 → null (« — »)', evalStr(tm.formule, { margeCommerciale: 730, prixVenteHT: 0 }) === null);

// ── E2 : liste blanche — variable inconnue rejetée ──
const v1 = wfValidate('foo + 1', 'hab', '∅');
t('variable inconnue rejetée', v1.ok === false && /Variable inconnue/.test(v1.error), v1.error);
t('formule usine margeBrute validée', wfValidate('primeCEE - (chargesTravaux + auditVT + fraisVtIte + regieCommerciale)', 'hab', 'margeBrute').ok === true);
// nbHabitations est volontairement disponible AUX DEUX niveaux depuis 2026-08-01
// (moyenne par logement calculable partout) ; les Σ restent réservés à l'habitation.
t('nbHabitations acceptée au niveau hab', wfValidate('nbHabitations + 1', 'hab', '∅').ok === true);
t('nbHabitations acceptée au niveau proj', wfValidate('nbHabitations + 1', 'proj', '∅').ok === true);
t('Σ refusé au niveau projet', wfValidate('sigmaMarge + 1', 'proj', '∅').ok === false);

// ── E3 : cycles refusés avec chaîne, auto-référence moteur autorisée ──
state.widgetConfig = null; wcInit();
state.widgetConfig.defs['hab:wa'] = { id: 'wa', niveau: 'hab', label: 'A', formule: 'wb + 1', custom: true, visible: true, ordre: 500 };
state.widgetConfig.defs['hab:wb'] = { id: 'wb', niveau: 'hab', label: 'B', formule: 'wa + 1', custom: true, visible: true, ordre: 510 };
const vc = wfValidate('wb + 1', 'hab', 'wa');
t('cycle wa→wb→wa refusé', vc.ok === false && /circulaire/.test(vc.error), vc.error);
t('chaîne du cycle affichée (→)', vc.ok === false && /→/.test(vc.error), vc.error);
state.widgetConfig.defs['hab:wa'].formule = 'shab + 1';   // cycle cassé pour la suite
t('référence widget sans cycle acceptée', wfValidate('wb + 1', 'hab', 'wc2').ok === true);
t('auto-référence = grandeur moteur (pas un cycle)', wfValidate('chargesTravaux * 2', 'hab', 'chargesTravaux').ok === true);

// ── M1 / R2 : l'usine reproduit les 12 widgets actuels, et chaque formule usine
//    ÉQUIVAUT au champ moteur correspondant (préuve d'identité en config par défaut) ──
state.widgetConfig = null; wcInit();
t('usine : 16 widgets Habitations (12 + 4 ratios masqués)', WIDGETS_USINE.filter(w => w.niveau === 'hab').length === 16);
t('usine : 16 widgets Projet (12 + 4 ratios masqués)', WIDGETS_USINE.filter(w => w.niveau === 'proj').length === 16);
t('usine : 6 visibles Habitations (5 historiques + Taux de marge)', WIDGETS_USINE.filter(w => w.niveau === 'hab' && w.visible).length === 6);
t('usine : 8 visibles Projet (7 historiques + Taux de marge)', WIDGETS_USINE.filter(w => w.niveau === 'proj' && w.visible).length === 8);
// ── Widgets SUPPLÉMENTAIRES livrés masqués (ratios prêts à l'emploi) ──
// Aucun marqueur « exemple » : une fois activés, ce sont des widgets comme les autres.
const supp = ['coutM2','primeM2','poidsProjet','ecartObjectif','margeParLogement'];
const suppUsine = WIDGETS_USINE.filter(w => supp.includes(w.id));
t('8 widgets supplémentaires livrés (4 par niveau)', suppUsine.length === 8, suppUsine.length);
t('tous MASQUÉS par défaut', suppUsine.every(w => w.visible === false),
  suppUsine.filter(w => w.visible).map(w => w.id).join(','));
t('aucune mention « exemple » dans leurs libellés ou descriptions',
  suppUsine.every(w => !/exemple/i.test(w.label + ' ' + (w.desc || ''))));
t('aucun marqueur exemple dans le module', !/exemple\s*:\s*true/.test(src));
t('aucun badge « exemple » dans l’interface des Paramètres', !/>exemple<\/span>/.test(src));
const suppInvalides = suppUsine.map(w => ({ w, r: wfValidate(w.formule, w.niveau, w.id) })).filter(x => !x.r.ok);
t('toutes leurs formules sont valides à leur niveau', suppInvalides.length === 0,
  suppInvalides.map(x => x.w.niveau + '/' + x.w.id + ' : ' + x.r.error).join(' · '));
t('le poids projet reste réservé au niveau habitation',
  !!wcUsine('hab', 'poidsProjet') && !wcUsine('proj', 'poidsProjet'));
t('calculable : coût au m² = 1750 ÷ 95', Math.abs(evalStr('coutRevient / shab', { coutRevient: 1750, shab: 95 }) - 18.42) < 0.01);
t('calculable : écart à l’objectif = marge − seuil', evalStr('margeCommerciale - seuilMarge', { margeCommerciale: 250, seuilMarge: 437 }) === -187);
// Taux de marge placé juste après la Marge Commerciale, avant la Décision
t('Taux de marge après Marge Commerciale (hab)', wcUsine('hab','tauxMarge').ordre > wcUsine('hab','margeCommerciale').ordre && wcUsine('hab','tauxMarge').ordre < wcUsine('hab','decision').ordre);
t('Taux de marge après Marge Commerciale (proj)', wcUsine('proj','tauxMarge').ordre > wcUsine('proj','margeCommerciale').ordre && wcUsine('proj','tauxMarge').ordre < wcUsine('proj','decision').ordre);
// Réciprocité montant ⇄ pourcentage : t = marge/vente×100 et marge = coût×t/(100−t)
const cibleDepuisTaux = (cout, t) => Math.round(cout * t / (100 - t) * 100) / 100;
const margeVoulue = cibleDepuisTaux(15000, 25);
t('taux 25 % sur coût 15 000 € → marge 5 000 €', margeVoulue === 5000, margeVoulue);
t('… et 5 000 / (15 000 + 5 000) redonne bien 25 %', Math.abs(margeVoulue / (15000 + margeVoulue) * 100 - 25) < 1e-9);
t('clé d’override du Taux de marge = w_tauxMarge', wgOvField(wcUsine('hab','tauxMarge')) === 'w_tauxMarge');
t('clé d’override d’un natif adossé au moteur inchangée', wgOvField(wcUsine('hab','margeCommerciale')) === 'marge');
t('aucune formule modifiée en config usine', ['hab', 'proj'].every(n => wcList(n, true).every(d => !wcIsFmod(d))));

// Jeu de valeurs moteur COHÉRENT (mêmes définitions que calcVT) :
const mock = {
  chargesTravaux: 1000, auditVT: 100, fraisVtIte: 50, regieCommerciale: 120,
  coutRevient: 1270, prixVenteHT: 2000, primeCEE: 1500,
  margeBrute: 230, resteACharge: 500, margeCommerciale: 730,
};
const champVar = { chargesTravaux: 'chargesTravaux', venteTravaux: 'prixVenteHT', audit: 'auditVT', vtIte: 'fraisVtIte', regie: 'regieCommerciale', coutRevient: 'coutRevient', prime: 'primeCEE', margeBrute: 'margeBrute', reste: 'resteACharge', marge: 'margeCommerciale' };
// Widgets adossés à une grandeur moteur (champ). « Taux de marge » est dérivé (pas de
// champ moteur homonyme) : son équivalence est testée à part, plus bas.
WIDGETS_USINE.filter(w => !w.special && w.champ).forEach(w => {
  const got = evalStr(w.formule, mock);
  const attendu = mock[champVar[w.champ]];
  t('formule usine ≡ moteur : ' + w.niveau + '/' + w.id, Math.abs(got - attendu) < 1e-9, got + ' ≠ ' + attendu);
});

// ── Éditable / lecture seule par widget (2026-08-01) ──
state.widgetConfig = null; wcInit();
t('usine : Prime CEE en lecture seule (hab)', wcEditable(wcUsine('hab', 'primeCEE')) === false);
t('usine : Prime CEE en lecture seule (proj)', wcEditable(wcUsine('proj', 'primeCEE')) === false);
t('usine : Marge Commerciale éditable', wcEditable(wcUsine('hab', 'margeCommerciale')) === true);
t('usine : tous les autres widgets éditables',
  WIDGETS_USINE.filter(w => w.id !== 'primeCEE').every(w => wcEditable(w)),
  WIDGETS_USINE.filter(w => w.id !== 'primeCEE' && !wcEditable(w)).map(w => w.id).join(','));
t('un widget rendu non éditable est bien verrouillé',
  (() => { const d = state.widgetConfig.defs['hab:resteACharge']; d.editable = false; return wcEditable(d) === false; })());
state.widgetConfig.defs['hab:resteACharge'].editable = true;
// Migration : une config SANS le champ reprend la valeur d'usine (comportement d'avant)
state.widgetConfig = { version: 1, defs: {
  'hab:primeCEE':        { id:'primeCEE', niveau:'hab', label:'Prime CEE', formule:'', special:'bareme', champ:'prime', visible:true, ordre:10 },
  'hab:margeCommerciale':{ id:'margeCommerciale', niveau:'hab', label:'Marge Commerciale', formule:'prixVenteHT - coutRevient', champ:'marge', visible:true, ordre:40 },
  'hab:perso1':          { id:'perso1', niveau:'hab', label:'Perso', formule:'shab * 2', custom:true, visible:true, ordre:900 },
} };
wcInit();
t('migration : Prime CEE sans champ → lecture seule (comme avant)', wcEditable(state.widgetConfig.defs['hab:primeCEE']) === false);
t('migration : Marge Commerciale sans champ → éditable (comme avant)', wcEditable(state.widgetConfig.defs['hab:margeCommerciale']) === true);
t('migration : widget personnalisé → éditable par défaut', wcEditable(state.widgetConfig.defs['hab:perso1']) === true);
state.widgetConfig = null; wcInit();

// ── ƒ modifiée détectée, retour usine individuel ──
state.widgetConfig.defs['hab:margeBrute'].formule = 'primeCEE - coutRevient';
t('ƒ modifiée détectée', wcIsFmod(state.widgetConfig.defs['hab:margeBrute']) === true);
wcResetOne('hab', 'margeBrute');
t('⟳ usine restaure la formule', wcIsFmod(state.widgetConfig.defs['hab:margeBrute']) === false);

// ── Bouclier couche 2 : formule cassée détectée ──
state.widgetConfig.defs['hab:margeBrute'].formule = 'primeCEE - (inconnu';
const shield = wgShieldChecks();
t('bouclier : formule invalide signalée', shield.fails.length === 1 && /Marge Brute/.test(shield.fails[0]), shield.fails.join(' | '));
wcResetOne('hab', 'margeBrute');

/* ── CONTRÔLE DE COHÉRENCE DU CATALOGUE (2026-08-01) ──────────────────────────
   Trois invariants qui doivent tenir en permanence :
   1. toute variable proposée dans la palette est réellement calculée par le moteur ;
   2. toute formule d'usine n'utilise que des variables existantes à son niveau ;
   3. rien n'est proposé à un niveau où il ne serait pas calculable. */
const grabFn = name => {
  const i = html.indexOf('function ' + name + '(');
  const o = html.indexOf('{', i);
  let d = 0, j = o;
  for (;;) { const c = html[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } j++; }
  return html.slice(i, j + 1);
};
const sumChecked = (vt, cat) => ({ ITE: 10, ITI: 20, Combles: 30, Plancher: 40, Fenetres: 5 })[cat] || 0;
const vtAudits = () => 1, totalAudits = () => 3, habitations = () => [{ shab: 95 }, { shab: 68 }], seuilMargePour = c => c * 0.25;
const m2 = v => round2(v) + ' m²';
state.settings = { auditVT: 450, vtIte: 200, regiePct: 10 };
eval(grabFn('_sigmaCache') + '\n' + grabFn('wgBaseVars'));
globalThis._sigmaSeed = { coutRevient: 20000, venteTravaux: 30000, prime: 25000, marge: 10000, shab: 163, nbHab: 2 };
const resM = { chargesTravaux: 1000, venteTravaux: 2000, audit: 450, vtIte: 200, regie: 100, coutRevient: 1750, prime: 1500, margeBrute: -250, reste: 500, marge: 250, seuil: 437 };
const vtM = { shab: 95, sauts: 2, fileName: 'a.pdf' };
const VH = wgBaseVars('hab', { vt: vtM, res: resM });
const VP = wgBaseVars('proj', { blocks: [{ vt: vtM, res: resM }], tot: resM });
const orphelinesH = wgVarsFor('hab').filter(v => VH[v.id] === undefined).map(v => v.id);
const orphelinesP = wgVarsFor('proj').filter(v => VP[v.id] === undefined).map(v => v.id);
t('catalogue : toute variable Habitations est calculée', orphelinesH.length === 0, orphelinesH.join(', '));
t('catalogue : toute variable Projet est calculée', orphelinesP.length === 0, orphelinesP.join(', '));
t('catalogue : 3 familles au maximum', [...new Set(WIDGET_VARS.map(v => v.fam))].length <= 3, [...new Set(WIDGET_VARS.map(v => v.fam))].join(' | '));
// Audit de pertinence (2026-08-01) : aucune variable qui recalcule un montant déjà exposé,
// aucune surface par catégorie (inutilisable sans son montant), aucune donnée hors ratio.
const RETIREES = ['montantAuditVT','montantVtIte','tauxRegie','surfIte','surfIti','surfCombles','surfPlancher','surfFenetres','nbAudits','sautsClasse','sigmaShab','sigmaNbHabitations'];
const encore = RETIREES.filter(id => WIDGET_VARS.some(v => v.id === id));
t('catalogue : variables redondantes ou inutilisables retirées', encore.length === 0, encore.join(', '));
t('aucune formule usine ne référence une variable retirée',
  WIDGETS_USINE.filter(w => !w.special).every(w => !RETIREES.some(id => new RegExp('\b' + id + '\b').test(w.formule))));
t('quote-part habitation = Shab ÷ Σ Shab × 100', Math.abs(VH.quotePart - 95 / 163 * 100) < 0.01, VH.quotePart);
t('quote-part vaut 100 % au niveau projet', VP.quotePart === 100, VP.quotePart);
t('nombre d’habitations disponible aux deux niveaux', VH.nbHabitations === 2 && VP.nbHabitations === 2);
t('objectif de marge disponible pour l’écart à la cible', VH.seuilMarge === 437 && VP.seuilMarge !== undefined);
t('catalogue : chaque variable a libellé et infobulle', WIDGET_VARS.every(v => v.label && v.tip));
// Formules d'usine : toutes valides avec le catalogue de leur niveau
state.widgetConfig = null; wcInit();
const invalides = WIDGETS_USINE.filter(w => !w.special)
  .map(w => ({ w, r: wfValidate(w.formule, w.niveau, w.id) })).filter(x => !x.r.ok);
t('toutes les formules usine sont valides à leur niveau', invalides.length === 0,
  invalides.map(x => x.w.niveau + '/' + x.w.id + ' : ' + x.r.error).join(' · '));
// Nouveaux apports
t('surface isolée = somme des 5 catégories (105 m²)', VH.surfaceIsolee === 105, VH.surfaceIsolee);
t('Shab au niveau PROJET = somme des habitations (163)', VP.shab === 163, VP.shab);
t('Σ coût de revient projet accessible depuis une habitation', VH.sigmaCoutRevient === 20000, VH.sigmaCoutRevient);
t('Σ nombre d’habitations accessible depuis une habitation', VH.sigmaNbHabitations === 2, VH.sigmaNbHabitations);
t('poids d’une habitation calculable : coutRevient ÷ sigmaCoutRevient × 100',
  Math.abs(evalStr('coutRevient / sigmaCoutRevient * 100', VH) - 8.75) < 1e-9, evalStr('coutRevient / sigmaCoutRevient * 100', VH));
t('Σ réservé au niveau habitation (absent au projet)', wgVarsFor('proj').every(v => !v.id.startsWith('sigma')));

// ── Infobulle : la formule EST affichée, avec libellés puis valeurs ──
const tipDef = { id: 'margeCommerciale', niveau: 'hab', label: 'Marge Commerciale', formule: 'prixVenteHT - coutRevient', champ: 'marge' };
const astTip = wfParse(tipDef.formule);
t('rendu formule en libellés métier',
  wfRender(astTip, id => (WIDGET_VARS.find(v => v.id === id) || {}).label || id) === 'Prix de vente HT − Coût de revient',
  wfRender(astTip, id => id));
t('rendu formule en valeurs', wfRender(astTip, id => String(VH[id])) === '2000 − 1750');
t('parenthèses réintroduites si nécessaire',
  wfRender(wfParse('(a + b) * c'), id => id) === '(a + b) × c', wfRender(wfParse('(a + b) * c'), id => id));
t('formule réduite à une seule grandeur = pas de formule affichée', wfEstSimple(wfParse('chargesTravaux')) === true);
t('formule composée = formule affichée', wfEstSimple(astTip) === false);

/* ── CASCADE DES FORMULES MODIFIÉES (bug corrigé le 2026-08-01) ────────────────
   Modifier la formule d'un widget doit se répercuter sur tous ceux qui l'utilisent.
   Avant le correctif, un widget natif non modifié lisait la valeur du MOTEUR et
   ignorait la nouvelle formule de son amont : l'écran devenait incohérent. */
state.widgetConfig = null; wcInit();
const ctxC = { vt: { shab: 95, fileName: 'a.pdf' }, res: {
  chargesTravaux: 1000, venteTravaux: 2000, audit: 450, vtIte: 200, regie: 100,
  coutRevient: 1750, prime: 1500, margeBrute: -250, reste: 500, marge: 250, seuil: 437, ov: {} } };
const valC = id => wgValue('hab', state.widgetConfig.defs['hab:' + id], ctxC, {});
t('config usine : coût de revient = valeur moteur (1750)', valC('coutRevient') === 1750, valC('coutRevient'));
t('config usine : marge commerciale = valeur moteur (250)', valC('margeCommerciale') === 250, valC('margeCommerciale'));
// On retire la régie de la formule du coût de revient : 1750 → 1650
state.widgetConfig.defs['hab:coutRevient'].formule = 'chargesTravaux + auditVT + fraisVtIte';
t('formule modifiée : le coût de revient suit (1650)', valC('coutRevient') === 1650, valC('coutRevient'));
t('CASCADE : la marge commerciale suit aussi (2000 − 1650 = 350)', valC('margeCommerciale') === 350, valC('margeCommerciale'));
t('le widget impacté porte le marqueur ƒ', wcIsFmodDeep(state.widgetConfig.defs['hab:margeCommerciale'], 'hab') === true);
t('un widget NON impacté reste au calcul moteur', wcIsFmodDeep(state.widgetConfig.defs['hab:resteACharge'], 'hab') === false);
t('la détection profonde distingue modifié et impacté',
  wcIsFmod(state.widgetConfig.defs['hab:margeCommerciale']) === false && wcIsFmodDeep(state.widgetConfig.defs['hab:margeCommerciale'], 'hab') === true);
// Robustesse : une référence circulaire ne doit pas faire boucler la détection
state.widgetConfig.defs['hab:cyc1'] = { id:'cyc1', niveau:'hab', label:'C1', formule:'cyc2 + 1', custom:true, visible:false, ordre:800 };
state.widgetConfig.defs['hab:cyc2'] = { id:'cyc2', niveau:'hab', label:'C2', formule:'cyc1 + 1', custom:true, visible:false, ordre:810 };
t('cycle : la détection profonde termine sans boucler', wcIsFmodDeep(state.widgetConfig.defs['hab:cyc1'], 'hab') === false);
delete state.widgetConfig.defs['hab:cyc1']; delete state.widgetConfig.defs['hab:cyc2'];
state.widgetConfig = null; wcInit();
t('retour usine : marge commerciale de nouveau au moteur (250)', valC('margeCommerciale') === 250, valC('margeCommerciale'));

// ── A2 : aucun eval() ni new Function dans le module ──
t('aucun eval() dans le module widgets', !/\beval\s*\(/.test(src));
t('aucun new Function dans le module widgets', !/new\s+Function/.test(src));

console.log('');
console.log(fail ? ('💥 ' + fail + ' échec(s) sur ' + (pass + fail)) : ('🎉 WIDGETS : ' + pass + '/' + pass + ' tests passent'));
process.exit(fail ? 1 : 0);
