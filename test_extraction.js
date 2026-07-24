/* SUITE DE RÉGRESSION EXTRACTION — rejoue les parseurs déterministes de l'app sur des VT
   réelles anonymisées (tests/fixtures/), avec résultats attendus figés.
   PRINCIPE ANTI-DÉRIVE : les fonctions sont EXTRAITES d'index.html à l'exécution (pas de
   copies locales qui vieillissent — cf. test_logic.js qui avait gardé un trancheOfLabel
   périmé). Chaque bug UAT sur une extraction doit ajouter ici sa VT anonymisée + ses
   valeurs attendues : le bug ne peut plus revenir.
   Usage : node test_extraction.js   (0 = tout passe) */
const fs = require('fs');
const path = require('path');

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('❌ ÉCHEC:', msg); failures++; process.exitCode = 1; }
  else console.log('✅', msg);
};
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.01 : eps);

/* ---- Extraction des fonctions RÉELLES depuis index.html (brace matching) ---- */
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
function grabFn(name) {
  const marker = 'function ' + name + '(';
  const idx = html.indexOf(marker);
  if (idx < 0) throw new Error('Fonction introuvable dans index.html : ' + name);
  let i = html.indexOf('{', idx), depth = 0;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}') { depth--; if (!depth) return html.slice(idx, j + 1); }
  }
  throw new Error('Accolades non fermées pour ' + name);
}
function grabConst(name) {
  const m = html.match(new RegExp('const ' + name + ' = [^\\n]*;'));
  if (!m) throw new Error('Constante introuvable dans index.html : ' + name);
  return m[0];
}
const FNS = ['num', 'normalizeVtText', 'shabToTranche', 'trancheOfLabel', 'isHeatedAdjacent',
             'parseVtTemplate', 'parseVtLateraux', 'parseVtIteTotal', 'parseVtOuvertures',
             'catSurfaceSum', 'tplInstance', 'ensureCategoryTotal'];
const CONSTS = ['OUV_TYPES', 'OUV_CARDINAL', 'OUV_SECTION_END'];
eval(CONSTS.map(grabConst).join('\n') + '\n' + FNS.map(grabFn).join('\n'));

/* ---- Unités : tranches Shab (bug UAT « >130 hors barème » du 24/07) ---- */
console.log('— TRANCHES SHAB (code réel d\'index.html) —');
for (const [label, exp] of [['Shab < 35', 0], ['35 ≤ Shab < 60', 1], ['60 ≤ Shab < 90', 2],
                            ['90 ≤ Shab < 110', 3], ['110 ≤ Shab ≤ 130', 4],
                            ['130 < Shab', 5], ['> 130', 5], ['Shab > 130', 5]]) {
  assert(trancheOfLabel(label) === exp, '« ' + label + ' » -> tranche ' + exp);
}

/* ---- Filet fenêtres = PLANCHER, jamais destructeur (bug UAT du 24/07) ---- */
console.log('— FILET ensureCategoryTotal —');
{
  const keep = { Fenetres: [{ surface_nette: 10 }, { surface_nette: 7.18 }] };
  ensureCategoryTotal(keep, 'Fenetres', 7.59, 'Menuiseries');
  assert(keep.Fenetres.length === 2, 'détail supérieur au récap : GARDÉ (2 lignes)');
  const floor = { Fenetres: [{ surface_nette: 3 }] };
  ensureCategoryTotal(floor, 'Fenetres', 7.59, 'Menuiseries');
  assert(floor.Fenetres.length === 1 && near(floor.Fenetres[0].surface_nette, 7.59),
         'détail inférieur au récap : remplacé par la ligne totale 7,59');
}

/* ---- VT réelles anonymisées : immeuble A (3 habitations empilées) ---- */
const EXPECTED = {
  vt_immeuble_a_hab1: { ouvertures: 4,  sumOuv: 7.71,  iti: 56.30, ouvrantsRecap: 7.71,
                        plancherBasNA: false, plancherBasSurf: 53.80, plancherHautNA: true },
  vt_immeuble_a_hab2: { ouvertures: 3,  sumOuv: 16.70, iti: 24.39, ouvrantsRecap: 16.70,
                        plancherBasNA: true, plancherHautNA: false, combles: 52.07 },
  vt_immeuble_a_hab3: { ouvertures: 10, sumOuv: 17.18, iti: 35.17, ouvrantsRecap: 7.59,
                        plancherBasNA: true, plancherHautNA: false, combles: 20.80 },
};
for (const [name, exp] of Object.entries(EXPECTED)) {
  console.log('— VT ' + name + ' —');
  const text = fs.readFileSync(path.join(__dirname, 'tests', 'fixtures', name + '.txt'), 'utf8');
  const ouv = parseVtOuvertures(text);
  const lat = parseVtLateraux(text);
  const tpl = parseVtTemplate(text);
  assert(ouv && ouv.length === exp.ouvertures, exp.ouvertures + ' ouvertures parsées (' + (ouv ? ouv.length : 0) + ')');
  assert(near(ouv.reduce((s, r) => s + r.surface, 0), exp.sumOuv), 'surface ouvertures = ' + exp.sumOuv + ' m²');
  assert(ouv.every(r => r.nombre >= 1 && r.surface > 0 && r.type), 'chaque ligne a type, nombre, surface');
  assert(lat && near(lat.iti, exp.iti), 'récap ITI = ' + exp.iti + ' m²');
  assert(lat && near(lat.ouvrants, exp.ouvrantsRecap), 'récap ouvrants = ' + exp.ouvrantsRecap + ' m²');
  const basNA = !!(tpl && tpl.plancherBas && isHeatedAdjacent(tpl.plancherBas.type));
  assert(basNA === exp.plancherBasNA, 'plancher bas ' + (exp.plancherBasNA ? 'SANS OBJET (chauffé dessous)' : 'déperditif'));
  if (!exp.plancherBasNA && exp.plancherBasSurf !== undefined)
    assert(tpl.plancherBas && near(tpl.plancherBas.surface, exp.plancherBasSurf), 'plancher bas = ' + exp.plancherBasSurf + ' m²');
  const hautNA = !!(tpl && tpl.plancherHaut && isHeatedAdjacent(tpl.plancherHaut.type));
  assert(hautNA === exp.plancherHautNA, 'plancher haut ' + (exp.plancherHautNA ? 'SANS OBJET' : 'déperditif'));
  if (!exp.plancherHautNA && exp.combles !== undefined)
    assert(tpl.plancherHaut && near(num(tpl.plancherHaut.sol) + num(tpl.plancherHaut.rampant), exp.combles),
           'combles (sol+rampant) = ' + exp.combles + ' m²');
}

/* ---- Hab 3 : le récap ouvrants (7,59) sous-compte les Velux — le tableau détaillé fait foi ---- */
console.log('— COHÉRENCE : détail > récap sur hab3 (Velux hors récap) —');
{
  const text = fs.readFileSync(path.join(__dirname, 'tests', 'fixtures', 'vt_immeuble_a_hab3.txt'), 'utf8');
  const ouv = parseVtOuvertures(text);
  const sum = ouv.reduce((s, r) => s + r.surface, 0);
  assert(sum > parseVtLateraux(text).ouvrants, 'détail (' + sum.toFixed(2) + ') > récap — le parseur de lignes protège du récap faux');
}

console.log(failures ? ('\n💥 ' + failures + ' échec(s)') : '\n🎉 EXTRACTION : TOUS LES TESTS PASSENT');
