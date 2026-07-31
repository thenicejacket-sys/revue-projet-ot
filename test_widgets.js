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
t('widget Taux de marge présent, masqué par défaut', !!tm && tm.visible === false && tm.format === 'pct');
t('Taux de marge : 730/2000 → 36,5 %', Math.abs(evalStr(tm.formule, { margeCommerciale: 730, prixVenteHT: 2000 }) - 36.5) < 1e-9);
t('Taux de marge : vente 0 → null (« — »)', evalStr(tm.formule, { margeCommerciale: 730, prixVenteHT: 0 }) === null);

// ── E2 : liste blanche — variable inconnue rejetée ──
const v1 = wfValidate('foo + 1', 'hab', '∅');
t('variable inconnue rejetée', v1.ok === false && /Variable inconnue/.test(v1.error), v1.error);
t('formule usine margeBrute validée', wfValidate('primeCEE - (chargesTravaux + auditVT + fraisVtIte + regieCommerciale)', 'hab', 'margeBrute').ok === true);
t('nbHabitations refusée au niveau hab', wfValidate('nbHabitations + 1', 'hab', '∅').ok === false);
t('nbHabitations acceptée au niveau proj', wfValidate('nbHabitations + 1', 'proj', '∅').ok === true);

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
t('usine : 12 widgets Habitations', WIDGETS_USINE.filter(w => w.niveau === 'hab').length === 12);
t('usine : 12 widgets Projet', WIDGETS_USINE.filter(w => w.niveau === 'proj').length === 12);
t('usine : 5 visibles Habitations (comme aujourd’hui)', WIDGETS_USINE.filter(w => w.niveau === 'hab' && w.visible).length === 5);
t('usine : 7 visibles Projet (comme aujourd’hui)', WIDGETS_USINE.filter(w => w.niveau === 'proj' && w.visible).length === 7);
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

// ── A2 : aucun eval() ni new Function dans le module ──
t('aucun eval() dans le module widgets', !/\beval\s*\(/.test(src));
t('aucun new Function dans le module widgets', !/new\s+Function/.test(src));

console.log('');
console.log(fail ? ('💥 ' + fail + ' échec(s) sur ' + (pass + fail)) : ('🎉 WIDGETS : ' + pass + '/' + pass + ' tests passent'));
process.exit(fail ? 1 : 0);
