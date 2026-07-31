// Tests de la VENTILATION DES PRIX PAR HABITATION (2026-07-31) :
// - ventilRepartition : répartition du déficit de marge pondérée par la capacité
//   prime CEE de chaque habitation, plafond ±30 %, baisse bidirectionnelle ;
// - prixEffectifs / setPrixManuel : résolution manuel (bleuté) > ventilé (rosé) > barème.
// Comme les autres suites : extraction des VRAIES fonctions d'index.html.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function grab(name){
  const idx = html.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' introuvable dans index.html');
  const open = html.indexOf('{', idx);
  let depth = 0, i = open;
  for (;;) { const c = html[i]; if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) break; } i++; }
  return html.slice(idx, i + 1);
}
const num = x => { const v = parseFloat(String(x).replace(',', '.')); return isFinite(v) ? v : 0; };
const round2 = x => Math.round(num(x) * 100) / 100;
const eur = x => round2(x).toFixed(2) + ' €';
const saveLS = () => {};
const ovKey = vt => vt.fileName || vt.label;
const state = { prixVentil: {}, prixManuel: {} };
eval(['ventilRepartition', 'prixEffectifs', 'setPrixManuel'].map(grab).join('\n'));

let pass = 0, fail = 0;
const t = (label, cond, detail) => { cond ? pass++ : fail++; console.log((cond ? '✅' : '❌') + ' ' + label + (cond ? '' : ' — ' + (detail || ''))); };
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 0.02);

// ── V2 : pondération par capacité prime ──
let r = ventilRepartition([
  { key: 'A', venteCat: 10000, capacite: 3000 },
  { key: 'B', venteCat: 10000, capacite: 1000 },
], 2000, 0.30);
t('capacité 3000/1000, déficit 2000 → A prend 1500', near(r.alloc[0].hausse, 1500), r.alloc[0].hausse);
t('… et B prend 500 (prorata prime, pas prorata vente)', near(r.alloc[1].hausse, 500), r.alloc[1].hausse);
t('déficit entièrement couvert (résiduel 0)', near(r.residuel, 0), r.residuel);

// ── V1 : le même poste peut finir à des k différents par habitation ──
t('taux de hausse DIFFÉRENTS entre habitations', Math.abs(r.alloc[0].k - r.alloc[1].k) > 0.05, r.alloc[0].k + ' vs ' + r.alloc[1].k);

// ── Débordement de la capacité : solde au prorata des ventes ──
r = ventilRepartition([
  { key: 'A', venteCat: 10000, capacite: 600 },
  { key: 'B', venteCat: 10000, capacite: 400 },
], 3000, 0.30);
t('capacités épuisées puis solde au prorata : A = 600+1000', near(r.alloc[0].hausse, 1600), r.alloc[0].hausse);
t('… B = 400+1000', near(r.alloc[1].hausse, 1400), r.alloc[1].hausse);

// ── Plafond +30 % par habitation, excédent redistribué ──
r = ventilRepartition([
  { key: 'A', venteCat: 1000, capacite: 5000 },
  { key: 'B', venteCat: 10000, capacite: 0 },
], 2000, 0.30);
t('A plafonnée à +30 % de 1000 = 300', near(r.alloc[0].hausse, 300), r.alloc[0].hausse);
t('excédent redistribué sur B (1700)', near(r.alloc[1].hausse, 1700), r.alloc[1].hausse);
t('plafond signalé sur A', r.alloc[0].plafond === true);

// ── Baisse bidirectionnelle : uniforme au prorata des ventes ──
r = ventilRepartition([
  { key: 'A', venteCat: 10000, capacite: 0 },
  { key: 'B', venteCat: 10000, capacite: 9999 },
], -1000, 0.30);
t('baisse : −500 chacun (uniforme, la capacité prime ne joue pas)', near(r.alloc[0].hausse, -500) && near(r.alloc[1].hausse, -500), r.alloc[0].hausse + '/' + r.alloc[1].hausse);

// ── Part sans vente : ignorée ──
r = ventilRepartition([{ key: 'A', venteCat: 0, capacite: 500 }, { key: 'B', venteCat: 5000, capacite: 0 }], 1000, 0.30);
t('habitation sans vente : hausse 0', r.alloc[0].hausse === 0);
t('tout va sur l’autre', near(r.alloc[1].hausse, 1000), r.alloc[1].hausse);

// ── C1 : résolution manuel > ventilé > barème ──
const vtA = { id: 1, fileName: 'a.pdf' }, vtB = { id: 2, fileName: 'b.pdf' };
const cc = { achat: 50, vente: 60 };
state.prixVentil = { 'a.pdf': { ITI: 70 } };
state.prixManuel = { 'a.pdf': { Fenetres: { vente: 1600 } } };
let p = prixEffectifs(vtA, 'ITI', cc);
t('ventilé : vente 70 (rosé), achat barème 50', p.vente === 70 && p.achat === 50 && p.srcVente === 'vent');
p = prixEffectifs(vtA, 'Fenetres', cc);
t('manuel : vente 1600 (bleuté)', p.vente === 1600 && p.srcVente === 'man');
p = prixEffectifs(vtB, 'ITI', cc);
t('AUTRE habitation : barème intact (aucune contamination)', p.vente === 60 && p.srcVente === '');
p = prixEffectifs(vtB, 'Fenetres', cc);
t('A3 : sans surcharge → strictement le barème', p.achat === 50 && p.vente === 60 && !p.srcAchat && !p.srcVente);
// manuel PAR-DESSUS ventilé
state.prixManuel['a.pdf'].ITI = { vente: 99 };
p = prixEffectifs(vtA, 'ITI', cc);
t('manuel gagne sur ventilé', p.vente === 99 && p.srcVente === 'man');

// ── N1/N4 : setPrixManuel pose et retire la surcharge d'UNE ligne ──
state.prixManuel = {};
setPrixManuel(vtA, 'Combles', 'vente', 88);
t('setPrixManuel pose la surcharge', state.prixManuel['a.pdf'].Combles.vente === 88);
t('… sans toucher l’autre habitation', !state.prixManuel['b.pdf']);
setPrixManuel(vtA, 'Combles', 'vente', null);
t('champ vidé : surcharge supprimée, magasin nettoyé', !state.prixManuel['a.pdf']);

// ── A1 : aucune de ces fonctions n'écrit dans chargesTable ──
const srcAll = ['ventilRepartition', 'prixEffectifs', 'setPrixManuel'].map(grab).join('\n');
t('aucune écriture dans chargesTable (barème)', !/chargesTable\s*\[/.test(srcAll) && !/chargesTable\s*=/.test(srcAll));

console.log('');
console.log(fail ? ('💥 ' + fail + ' échec(s) sur ' + (pass + fail)) : ('🎉 VENTILATION : ' + pass + '/' + pass + ' tests passent'));
process.exit(fail ? 1 : 0);
