/* ============================================================================
   TESTS — Étape 7 « Proposition de travaux »
   Usage : node test_proposition.js

   Anti-dérive : les fonctions ne sont PAS recopiées ici, elles sont EXTRAITES
   d'index.html (bloc délimité par les marqueurs ETAPE 7) et exécutées telles
   quelles. Un test qui passe prouve donc quelque chose sur le code livré, pas
   sur une copie périmée — c'est la leçon retenue sur test_logic.js, qui avait
   silencieusement gardé un trancheOfLabel obsolète.

   Ce que ces tests verrouillent :
   1. La LISTE BLANCHE du PDF. Le state contient des revenus de ménage, des
      marges, des prix d'achat et une clé API. Rien de tout cela ne doit pouvoir
      atteindre un document client, même si quelqu'un ajoute une colonne demain.
   2. L'exclusion réversible : une ligne grisée sort des totaux ET du PDF.
   3. Les deux modes de chiffrage (barème / Prime CEE + RAC).
   4. Le libellé de lot : jamais de tiret orphelin quand l'occupant est vide.
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const DEB = HTML.indexOf('/* ===== DEBUT BLOC ETAPE 7');
const FIN = HTML.indexOf('/* ===== FIN BLOC ETAPE 7');
if (DEB < 0 || FIN < 0) { console.error('❌ Bloc étape 7 introuvable dans index.html'); process.exit(1); }
let BLOC = HTML.slice(DEB, FIN);

// Le générateur PDF n'est pas testé ici (il l'est visuellement + par son propre
// harnais) : on neutralise sa dépendance jsPDF, absente en Node nu.
BLOC = BLOC.replace(/const\s*\{\s*jsPDF\s*\}\s*=\s*require\([^)]*\)\s*;?/g, '')
           .replace(/require\(['"]jspdf[^)]*\)\s*;?/g, 'null;');

let ok = 0, ko = 0;
const T = (label, cond, detail) => {
  if (cond) { ok++; console.log('✅ ' + label); }
  else { ko++; console.log('❌ ' + label + (detail !== undefined ? '  → ' + detail : '')); }
};

/* --- Contexte minimal : les helpers de l'app, copiés à l'identique --- */
const PRELUDE = `
function num(x){ if(x===null||x===undefined||x==='') return 0;
  const n = parseFloat(String(x).replace(/\\s/g,'').replace(',','.')); return isNaN(n)?0:n; }
function round2(x){ return Math.round(num(x)*100)/100; }
function eur(x){ return (Math.round(num(x)*100)/100).toFixed(2)+' €'; }
function esc(s){ return String(s==null?'':s); }
function ovKey(vt){ return vt.fileName || vt.label; }
function habitations(){ return state.vts.filter(v=>v.role==='habitation'); }
function iteVts(){ return state.vts.filter(v=>v.role==='ite'); }
function calcVT(vt){ return { prime: vt._prime||0 }; }
function calcTravaux(vt){ return { lignes: vt._lignes||[] }; }
var HistoryStore = { _lsAll(){ return []; } };
var FROZEN = null, window = { jspdf:null };
var document = { getElementById(){return null;}, querySelector(){return null;},
                 querySelectorAll(){return [];}, addEventListener(){},
                 createElement(){ return { style:{}, classList:{add(){},remove(){},contains(){return false;}},
                   appendChild(){}, querySelector(){return null;}, addEventListener(){} }; },
                 body:{ appendChild(){} } };
function saveLS(){}
`;
const ctx = { console: { log(){}, warn(){}, error(){} }, Math, Date, JSON, String, Number,
              Object, Array, RegExp, isNaN, parseFloat, parseInt,
              URL: { createObjectURL(){return '';}, revokeObjectURL(){} } };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(PRELUDE, ctx);
try { vm.runInContext(BLOC, ctx, { filename: 'index.html#etape7' }); }
catch (e) { console.error('❌ Le bloc étape 7 ne s\'évalue pas : ' + e.message); process.exit(1); }

/* --- State piégé : truffé de ce qui ne doit JAMAIS sortir --- */
const STATE = `
state = {
  nomDossier:'Immeuble de test', vts:[],
  settings:{ caNom:'Jean DUPONT', caTel:'01.00.00.00.00', caMobile:'',
    tvaDefaut:5.5, validiteMois:2, acomptePct:30,
    otEmail:'contact@otenenergie.fr', otSite:'www.otenergie.fr', otTel:'Tél. : 01.85.90.60.67',
    otAdr1:'33 rue de Piscop', otAdr2:'95350 SAINT-BRICE SOUS FORET', otLegal:'SAS au capital de 50.000€',
    apiKey:'sk-or-CLE-SECRETE', seuilGo:987654, regiePct:12 },
  prop:{ mode:'bareme', tvaPct:5.5, cgvIncluses:false,
    devis:{ numero:'OTE-2026-001', dateEmission:'2026-07-28', validiteMois:2, refProjet:'Test' },
    chantier:{ adresse:'1 rue de Test', cp:'75001', ville:'PARIS' },
    bailleur:{ typeProprietaire:'SCI', personneMorale:'SCI TEST', nom:'TESTARD', prenom:'',
               tel:'0600000000', email:'', adresseFacturation:'' },
    autoFields:{}, conflits:{}, manuel:false,
    chargeAffaires:{ nom:'Jean DUPONT', tel:'', mobile:'' },
    conditions:{ offrePrevoit:'Étude technique', garantieMois:12, delai:'2 à 4 semaines', acomptePct:30 },
    sections:[
      { id:'s1', kind:'ite', vtKey:'', refLot:'', occupant:'', titreLibre:'', tvaPct:null,
        racTTC:0, primeCee:0, primeForced:false, notes:'',
        lignes:[{ id:'l1', cat:'ITE', designation:'Isolation par l\\'extérieur', unite:'m²',
                  qte:100, puHT:200, disabled:false, manuelle:false }], collapsed:false },
      { id:'s2', kind:'hab', vtKey:'v1', refLot:'Lot A1', occupant:'M. RICHARD Marie', titreLibre:'',
        tvaPct:null, racTTC:6500, primeCee:4322, primeForced:false, notes:'',
        lignes:[
          { id:'l2', cat:'ITI', designation:'Isolation des murs', unite:'m²', qte:50, puHT:210, disabled:false, manuelle:false },
          { id:'l3', cat:'Combles', designation:'Isolation des combles', unite:'m²', qte:40, puHT:90, disabled:false, manuelle:false },
          { id:'lX', cat:'ITI', designation:'LIGNE_EXCLUE_TEMOIN', unite:'m²', qte:99, puHT:999, disabled:true, manuelle:false }
        ], collapsed:false },
      { id:'s3', kind:'hab', vtKey:'v2', refLot:'Lot A2', occupant:'', titreLibre:'', tvaPct:20,
        racTTC:0, primeCee:6916, primeForced:false, notes:'',
        lignes:[{ id:'l4', cat:'Fenetres', designation:'Menuiseries', unite:'m²', qte:10, puHT:1500, disabled:false, manuelle:false }],
        collapsed:false }
    ], notes:'' } };
`;
vm.runInContext(STATE, ctx);
const run = expr => vm.runInContext(expr, ctx);

console.log('\n— LISTE BLANCHE DU PDF —');
const model = run('propBuildPdfModel()');
// NB : `primeCee` est LÉGITIME dans model.totaux — le bloc totaux du devis OT l'affiche
// explicitement, en rouge et en négatif. Ce qui est interdit, c'est la prime portée par
// une SECTION (donnée de pilotage interne) et tout ce qui relève du calcul de marge.
const INTERDITS = ['apiKey','seuilGo','regiePct','marge','margeBrute','coutRevient','achat',
                   'revenus','revMenages','cdp','go','decision','disabled','cat','vtKey',
                   'primeForced','racTTC','notes_internes'];
const fuites = [];
(function scan(o, p){ if (o === null || typeof o !== 'object') return;
  for (const k of Object.keys(o)) { if (INTERDITS.includes(k)) fuites.push(p+'.'+k); scan(o[k], p+'.'+k); } })(model, 'model');
T('aucune clé interdite dans le modèle PDF', fuites.length === 0, fuites.join(', '));
T('la prime CEE des sections ne fuit pas (seul le total la porte)',
  model.sections.every(s => s.primeCee === undefined));
T('la prime CEE figure bien dans le bloc totaux', typeof model.totaux.primeCee === 'number');
const brut = JSON.stringify(model);
T('la clé API n\'apparaît pas', !brut.includes('sk-or-CLE-SECRETE'));
T('le seuil GO/NO-GO n\'apparaît pas', !brut.includes('987654'));
T('le pourcentage de régie n\'apparaît pas', !/"regiePct"/.test(brut));

console.log('\n— EXCLUSION RÉVERSIBLE —');
T('la ligne exclue est absente du PDF', !brut.includes('LIGNE_EXCLUE_TEMOIN'));
const stAvant = run('propSectionSousTotal(state.prop.sections[1])');
T('sous-total hors ligne exclue = 50×210 + 40×90 = 14100', stAvant === 14100, stAvant);
run('state.prop.sections[1].lignes[2].disabled = false');
const stApres = run('propSectionSousTotal(state.prop.sections[1])');
T('réactivation : le sous-total remonte de 99×999', round(stApres - stAvant) === round(99*999), stApres - stAvant);
run('state.prop.sections[1].lignes[2].disabled = true');

console.log('\n— TOTAUX —');
const t = run('propTotaux()');
T('base HT = 20000 + 14100 + 15000', t.baseHT === 49100, t.baseHT);
T('TVA mixte 5,5 % et 20 % = 1875,50 + 3000', t.baseTVA === round(34100*0.055 + 15000*0.20), t.baseTVA);
T('TTC = HT + TVA', t.baseTTC === round(t.baseHT + t.baseTVA), t.baseTTC);
T('prime CEE cumulée = 4322 + 6916', t.primeCee === 11238, t.primeCee);
T('reste à charge = TTC − prime', t.resteTTC === round(t.baseTTC - t.primeCee), t.resteTTC);

console.log('\n— LIBELLÉ DE LOT —');
T('lot avec occupant → « Lot A1 — M. RICHARD Marie »',
  run('propSectionSousTitre(state.prop.sections[1])') === 'Lot A1 — M. RICHARD Marie');
T('lot sans occupant → « Lot A2 » sans tiret orphelin',
  run('propSectionSousTitre(state.prop.sections[2])') === 'Lot A2');
run("state.prop.sections[2].refLot=''");
T('ni référence ni occupant → libellé vide, pas de tiret',
  run('propSectionSousTitre(state.prop.sections[2])') === '');
run("state.prop.sections[2].refLot='Lot A2'");

console.log('\n— MODES DE CHIFFRAGE —');
const barHT = run('propSectionSousTotal(state.prop.sections[1])');
run("state.prop.mode='rac'");
const racHT = run('propSectionSousTotal(state.prop.sections[1])');
const cible = 4322 + 6500;
T('mode barème ≠ mode RAC sur un lot à reste à charge', barHT !== racHT, barHT + ' vs ' + racHT);
T('mode RAC : le TTC reconstitué approche Prime + RAC (écart < 1 €)',
  Math.abs(round(racHT * 1.055) - cible) < 1, round(racHT * 1.055) + ' vs ' + cible);
T('mode RAC : la section ITE reste au barème',
  run('propSectionSousTotal(state.prop.sections[0])') === 20000);
run("state.prop.mode='bareme'");
T('retour au barème : sous-total identique à l\'origine',
  run('propSectionSousTotal(state.prop.sections[1])') === barHT);

console.log('\n— DÉSIGNATIONS COMMERCIALES —');
const sigles = model.sections.some(s => s.lignes.some(l => /\b(ITE|ITI|BMD\d+|Rampants)\b/.test(l.designation)));
T('aucun sigle technique dans les désignations du PDF', !sigles);

function round(x){ return Math.round(x * 100) / 100; }

console.log('\n' + (ko ? '❌ ' + ko + ' ÉCHEC(S) — ' : '🎉 ') + ok + '/' + (ok + ko) + ' tests passent');
process.exit(ko ? 1 : 0);
