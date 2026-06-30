/* Génère les 2 fichiers d'exemple params/*.xlsx conformes aux schémas §6.2 / §6.3.
   Données ILLUSTRATIVES (à remplacer par les vrais barèmes OT Énergie). */
const XLSX = require('xlsx');
const fs = require('fs');

/* ----------------------- VALORISATION_TEMPLATE.xlsx (§6.2) ----------------------- */
const pollueurs = ['DRAPO', 'ENEMAT'];
const cees = ['Classique', 'CEE Précaire'];
const cdps = ['OUI', 'NON'];
const sautsList = ['2', '3', '4 et +'];
const tranches = [
  { label: 'Shab < 35',           fact: 0.5, palier: '<90' },
  { label: '35 ≤ Shab < 60',      fact: 0.7, palier: '<90' },
  { label: '60 ≤ Shab < 90',      fact: 1.0, palier: '<90' },
  { label: '90 ≤ Shab < 110',     fact: 1.3, palier: '>=90' },
  { label: '110 ≤ Shab ≤ 130',    fact: 1.6, palier: '>=90' },
  { label: 'Shab > 130',          fact: 2.0, palier: '>=90' },
];
const kwhcBase = { '2': 90000, '3': 130000, '4 et +': 170000 };

// Prix N (€/MWh cumac) — illustratif : dépend précarité, pollueur et palier <90 / >=90
// (valeurs choisies pour des primes d'exemple réalistes ; à remplacer par le vrai barème)
function valoN(pollueur, cee, palier) {
  let base = cee === 'CEE Précaire' ? 72 : 45;
  if (pollueur === 'ENEMAT') base += 4;          // mandataire un peu mieux-disant
  if (palier === '>=90') base -= 6;              // palier haute surface : prix unitaire plus bas
  return Math.round(base * 100) / 100;
}

// Ligne 0 = titre, ligne 1 (index 1) = en-têtes, données dès la ligne 2 (=ligne 3 du fichier)
const aoa = [];
aoa.push(['VALORISATION_TEMPLATE — barème CEE (exemple)']);                 // ligne 1 (titre)
aoa.push(['Nb sauts classe','kWhc','Fact correctif','Shab (m2)','','',      // ligne 2 (en-têtes)
          'Pollueur/mandataire','','','CDP','CEE','kWhc (final)','','Valo','Valo CEE']);

for (const poll of pollueurs)
  for (const cee of cees)
    for (const cdp of cdps)
      for (const sauts of sautsList)
        for (const tr of tranches) {
          const B = kwhcBase[sauts];
          const C = tr.fact;
          const L = Math.round(B * C / 1000 * 100) / 100;     // L = B × C / 1000
          const N = valoN(poll, cee, tr.palier);
          const O = Math.round(L * N * 100) / 100;            // O = L × N (pré-calculé)
          aoa.push([
            sauts, B, C, tr.label, '', '',
            poll, '', '', cdp, cee, L, '', N, O
          ]);
        }

const wbV = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbV, XLSX.utils.aoa_to_sheet(aoa), 'Feuil1');
XLSX.writeFile(wbV, 'params/VALORISATION_TEMPLATE.xlsx');
console.log('VALORISATION_TEMPLATE.xlsx :', aoa.length - 2, 'lignes de données');

/* ----------------------- Charges.xlsx (§6.3) ----------------------- */
// Structure transposée : catégories en colonnes (col A = libellés de ligne)
const cats   = ['', 'ITI','Fenetres','Combles','Rampants','Planchers','Radiateurs','Ballon Thermo','Ballon Hybrid','ITE','Toit Terrasse','VMC'];
const unites = ['Unité','M2','M2','M2','M2','M2','PC','PC','PC','M2','M2','PC'];
const achats = ['Px Achat HT', 28, 320, 12, 18, 22, 180, 650, 1200, 95, 70, 450];
const ventes = ['Prix vente HT', 55, 600, 25, 38, 45, 350, 1200, 2100, 180, 140, 850];

const wbC = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbC, XLSX.utils.aoa_to_sheet([cats, unites, achats, ventes]), 'Feuil1');
XLSX.writeFile(wbC, 'params/Charges.xlsx');
console.log('Charges.xlsx :', cats.length - 1, 'catégories');

/* ----------------------- Vérification du lookup (qualité §11) ----------------------- */
// Ex. DRAPO / Classique / CDP NON / 2 sauts / 60 ≤ Shab < 90  → O = L × N
const check = aoa.find(r => r[6]==='DRAPO' && r[10]==='Classique' && r[9]==='NON' && r[0]==='2' && r[3]==='60 ≤ Shab < 90');
console.log('Contrôle lookup [DRAPO/Classique/NON/2/60-90] : L=%s N=%s O=%s  (L×N=%s)',
  check[11], check[13], check[14], Math.round(check[11]*check[13]*100)/100);
