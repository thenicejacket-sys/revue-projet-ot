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
             'catSurfaceSum', 'tplInstance', 'ensureCategoryTotal',
             'isoJoin', 'isoFromBlock', 'parseVtIsolation', 'applyIsolationStates',
             'applyMatrix', 'mulMatrix'];
const CONSTS = ['OUV_TYPES', 'OUV_CARDINAL', 'OUV_SECTION_END',
                'ISO_MARK', 'ISO_NUMLINE', 'ISO_SURF3', 'ISO_SECTION_END'];
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

/* ---- ÉTAT ISOLATION (colonne du 27/07) : lecture déterministe des colonnes « Isolation »
   ---- Ancrage de non-régression : la somme des façades parsées DOIT égaler le récap ITI.
   ---- Si elle diverge, c'est qu'un bloc façade a été perdu (piège /^ACC[ÈE]S/i qui matchait
   ---- « accessible » et coupait le tableau : 2 façades sur 7 disparaissaient sur hab1). */
console.log('— ÉTAT ISOLATION (parseVtIsolation) —');
const ISO_EXPECTED = {
  vt_immeuble_a_hab1: { nbFacades: 7, sumFacades: 56.30,
                        facadeEtat: 'Moins de 5 ans ITI (Isolation thermique intérieure) 400 Laine de roche',
                        plancherBas: '', plancherHaut: '' },
  vt_immeuble_a_hab2: { nbFacades: 5, sumFacades: 24.39,
                        facadeEtat: 'Plus de 10 ans ITI (Isolation thermique intérieure) 100 Laine de verre',
                        plancherBas: '',
                        plancherHaut: 'Soufflé laine de roche ou ouate de cellulose Isolation présente Entre 2000 et 2009 240 mm' },
  vt_immeuble_a_hab3: { nbFacades: 5, sumFacades: 35.17,
                        facadeEtat: 'Plus de 10 ans ITI (Isolation thermique intérieure) 100 Laine de verre',
                        plancherBas: '', plancherHaut: '' },
};
for (const [name, exp] of Object.entries(ISO_EXPECTED)) {
  const text = fs.readFileSync(path.join(__dirname, 'tests', 'fixtures', name + '.txt'), 'utf8');
  const iso = parseVtIsolation(text);
  const sum = iso.facades.reduce((s, f) => s + f.surface, 0);
  assert(iso.facades.length === exp.nbFacades,
         name + ' : ' + exp.nbFacades + ' façades lues (' + iso.facades.length + ')');
  assert(near(sum, exp.sumFacades), name + ' : somme façades = récap ITI (' + exp.sumFacades + ' m²)');
  assert(iso.facades.every(f => f.etat === exp.facadeEtat), name + ' : état isolation façades = « ' + exp.facadeEtat + ' »');
  assert(iso.plancherBas === exp.plancherBas,
         name + ' : plancher bas ' + (exp.plancherBas ? '= « ' + exp.plancherBas + ' »' : 'non renseigné dans la VT'));
  assert(iso.plancherHaut === exp.plancherHaut,
         name + ' : plancher haut ' + (exp.plancherHaut ? 'renseigné' : 'non renseigné dans la VT'));
}

/* ---- Injection dans les lignes extraites : appariement par surface + repli commun ---- */
console.log('— INJECTION applyIsolationStates —');
{
  const text = fs.readFileSync(path.join(__dirname, 'tests', 'fixtures', 'vt_immeuble_a_hab2.txt'), 'utf8');
  const vt = { text, extraction: { categories: {
    ITI: [ { surface_nette: 4.66 }, { surface_nette: 6.50 }, { surface_nette: 99 } ],
    Combles: [ { surface_nette: 52.07 } ],
    Plancher: [], ITE: [], Fenetres: [ { surface_nette: 5 } ] } } };
  applyIsolationStates(vt);
  const c = vt.extraction.categories;
  assert(c.ITI[0].etat_isolation === ISO_EXPECTED.vt_immeuble_a_hab2.facadeEtat, 'ITI apparié par surface (4,66)');
  assert(c.ITI[2].etat_isolation === ISO_EXPECTED.vt_immeuble_a_hab2.facadeEtat,
         'ITI non apparié : repli sur l\'état commun à toutes les façades');
  assert(c.Combles[0].etat_isolation === ISO_EXPECTED.vt_immeuble_a_hab2.plancherHaut, 'Combles = cellule plancher haut');
  assert(!c.Fenetres[0].etat_isolation, 'Fenêtres jamais renseignées (hors périmètre)');
}
{
  // La VT ne dit rien -> AUCUNE valeur inventée (c'est ce qui rend véridique la mention
  // « État isolation non renseigné dans la VT » du rectangle d'information globale).
  const vt = { text: 'PLANCHER BAS\n Type   Surface \n Terre plein \n 40.00m2 \n Commentaire plancher bas : Ras \n',
               extraction: { categories: { ITI: [], Combles: [], Plancher: [ { surface_nette: 40 } ], ITE: [], Fenetres: [] } } };
  applyIsolationStates(vt);
  assert(!vt.extraction.categories.Plancher[0].etat_isolation, 'VT muette : etat_isolation reste vide, rien n\'est inventé');
}

/* ---- MATRICES PDF (vignettes photos du 27/07) : la composition save/transform doit être
   ---- exacte. Le bug d'origine : ne lire QUE le dernier « transform » avant l'ordre de
   ---- peinture. Les pages qui en empilent deux (p.26 de la VT Derouet 3) donnaient alors une
   ---- découpe blanche, en silence. Ces asserts verrouillent l'algèbre du correctif. */
console.log('— MATRICES PDF (vignettes) —');
{
  const I = [1,0,0,1,0,0];
  assert(applyMatrix(I, 7, 9).join() === '7,9', 'identité : le point ne bouge pas');
  const t = [1,0,0,1,10,20];                       // translation
  assert(applyMatrix(t, 1, 2).join() === '11,22', 'translation (10,20)');
  const s = [2,0,0,3,0,0];                         // échelle
  assert(applyMatrix(s, 4, 5).join() === '8,15', 'échelle ×2 / ×3');
  // Composition : échelle PUIS translation. Lire seulement la dernière matrice donnerait
  // (10,20) — c'est exactement l'erreur que le correctif supprime.
  const c = mulMatrix(s, t);
  assert(applyMatrix(c, 1, 1).join() === '12,23', 'échelle puis translation = (12,23)');
  assert(applyMatrix(mulMatrix(I, c), 1, 1).join() === '12,23', 'composer avec l\'identité ne change rien');
  // Carré unité d'une image posée en (530,104) taille 198×148 (cas réel p.26, paysage)
  const img = mulMatrix([198,0,0,148,530,104], I);
  const pts = [[0,0],[1,0],[0,1],[1,1]].map(p => applyMatrix(img, p[0], p[1]));
  const xs = pts.map(p=>p[0]), ys = pts.map(p=>p[1]);
  assert(Math.min.apply(null,xs) === 530 && Math.max.apply(null,xs) === 728, 'image p.26 : x de 530 à 728');
  assert(Math.min.apply(null,ys) === 104 && Math.max.apply(null,ys) === 252, 'image p.26 : y de 104 à 252');
}

console.log(failures ? ('\n💥 ' + failures + ' échec(s)') : '\n🎉 EXTRACTION : TOUS LES TESTS PASSENT');
