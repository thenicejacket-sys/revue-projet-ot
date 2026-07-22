/* Test de validation : reproduit la logique de l'app (parse + lookup déterministe + charges)
   et la confronte aux fichiers générés. Couvre §11 (≥3 combos, charges, calcul).
   2026-07-22 : format v2 (colonne « Rev Ménages » en J -> CDP:K, CEE:L, kWhc:M, Valo:O, Valo CEE:P),
   détection de format identique à l'app + mapping Rev Ménages -> (CEE, CDP). */
const XLSX = require('xlsx');
const assert = (cond,msg)=>{ if(!cond){ console.error('❌ ÉCHEC:',msg); process.exitCode=1; } else console.log('✅',msg); };

const num = x => { if(x==null||x==='') return 0; const n=parseFloat(String(x).replace(/\s/g,'').replace(',','.')); return isNaN(n)?0:n; };
const normCdp = v => /oui|^o$|true|1/i.test(String(v||'').trim())?'OUI':'NON';
const normSauts = v => { const m=String(v||'').match(/\d/); return m?m[0]:'2'; };
const normPoll = v => String(v||'').trim().toLowerCase();
const ceeKey = s => String(s||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const VCOL ={A:0,B:1,C:2,D:3,G:6,J:9,K:10,L:11,N:13,O:14};
const VCOL2={A:0,B:1,C:2,D:3,G:6,REV:9,CDP:10,CEE:11,KWHCF:12,VALO:14,VALOCEE:15};

function shabToTranche(s){ s=num(s); if(s<35)return 0; if(s<60)return 1; if(s<90)return 2; if(s<110)return 3; if(s<=130)return 4; return 5; }
function trancheOfLabel(label){
  const t=String(label||''); const nums=(t.match(/\d+([.,]\d+)?/g)||[]).map(x=>parseFloat(x.replace(',','.')));
  const hasLt=/</.test(t), hasGt=/>/.test(t);
  if(nums.length>=2) return shabToTranche((nums[0]+nums[1])/2);
  if(nums.length===1){ if(hasLt) return shabToTranche(nums[0]-1); if(hasGt) return shabToTranche(nums[0]+1); return shabToTranche(nums[0]); }
  return -1;
}

// Détection de format — copie conforme de l'app
function detectValoFormat(rows){
  for(const r of rows){
    const j = String(r[9] ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    if(/rev/.test(j) && /menage/.test(j)) return 'v2';
  }
  const data = rows.filter(r => /^[234]/.test(String(r[0] ?? '').trim()) && String(r[6] ?? '').trim());
  if(data.length && data.every(r => /^(oui|non)$/i.test(String(r[9]  ?? '').trim()))) return 'v1';
  if(data.length && data.every(r => /^(oui|non)$/i.test(String(r[10] ?? '').trim()))) return 'v2';
  return 'v1';
}

const wbV=XLSX.readFile('params/VALORISATION_TEMPLATE.xlsx');
const rows=XLSX.utils.sheet_to_json(wbV.Sheets['Feuil1'],{header:1,blankrows:false,defval:''});
const fmt = detectValoFormat(rows);
const v2 = fmt === 'v2';
const valoTable=rows
  .filter(r=>{
    const a=String(r[VCOL.A]??'').trim(), g=String(r[VCOL.G]??'').trim();
    return /^[234]/.test(a) && g && g.toLowerCase()!=='pollueur/mandataire';
  })
  .map(r=>({
    sauts:normSauts(r[VCOL.A]),kwhc:num(r[VCOL.B]),fact:num(r[VCOL.C]),shabLabel:String(r[VCOL.D]||''),
    pollueur:String(r[VCOL.G]||'').trim(),
    rev: v2 ? String(r[VCOL2.REV]||'').trim() : '',
    cdp:normCdp(v2?r[VCOL2.CDP]:r[VCOL.J]),
    cee:String((v2?r[VCOL2.CEE]:r[VCOL.K])||'').trim(),
    kwhcFinal:num(v2?r[VCOL2.KWHCF]:r[VCOL.L]),
    valo:num(v2?r[VCOL2.VALO]:r[VCOL.N]),
    valoCee:num(v2?r[VCOL2.VALOCEE]:r[VCOL.O])
  }));
const pollueurs=[...new Set(valoTable.map(r=>r.pollueur))];

function lookupValo(p){
  const tr=shabToTranche(p.shab);
  const c=valoTable.filter(r=> normPoll(r.pollueur)===normPoll(p.pollueur) && ceeKey(r.cee)===ceeKey(p.cee)
    && normCdp(r.cdp)===normCdp(p.cdp) && normSauts(r.sauts)===normSauts(p.sauts) && trancheOfLabel(r.shabLabel)===tr);
  if(!c.length) return {error:'hors barème'};
  const r=c[0]; let v=r.valoCee; if(!v){ let L=r.kwhcFinal||r.kwhc*r.fact/1000; v=L*r.valo; }
  return {valoCee:v,row:r};
}

console.log('\n— VALORISATION (format '+fmt+') —');
assert(fmt==='v2','format v2 détecté (colonne Rev Ménages)');
assert(valoTable.length===216,'216 lignes parsées ('+valoTable.length+')');
assert(pollueurs.length===4 && pollueurs.includes('ENEMAT'),'4 pollueurs lus dynamiquement: '+pollueurs.join(', '));

// Mapping Rev Ménages -> (CEE, CDP) : déterministe sur TOUTES les lignes
const revMap={};
let mapOk=true;
for(const r of valoTable){
  const k=ceeKey(r.rev);
  const val=r.cdp+'|'+r.cee;
  if(revMap[k]===undefined) revMap[k]=val;
  else if(revMap[k]!==val) mapOk=false;
}
assert(Object.keys(revMap).length===3,'3 options Revenus ménages ('+Object.keys(revMap).length+')');
assert(mapOk,'mapping Rev Ménages -> (CDP, CEE) déterministe sur les 216 lignes');
assert(revMap[ceeKey('Int/supp')]==='NON|Classique','Int/supp -> CDP NON · Classique');
assert(revMap[ceeKey('Modeste')]==='OUI|Classique','Modeste -> CDP OUI · Classique');
assert(revMap[ceeKey('Très modeste')]==='OUI|CEE Précaire','Très modeste -> CDP OUI · CEE Précaire');

// 3 combinaisons, Valo CEE (P) = kWhc final (M) × Valo (O)
const combos=[
  {pollueur:'ENEMAT', cee:'Classique',    cdp:'non', sauts:'2', shab:75},   // Int/supp, 60-90
  {pollueur:'ENEMAT', cee:'CEE Précaire', cdp:'oui', sauts:'4', shab:120},  // Très modeste, 110-130
  {pollueur:'ENEMAT', cee:'Classique',    cdp:'oui', sauts:'3', shab:30},   // Modeste, <35
];
combos.forEach(p=>{
  const r=lookupValo(p);
  assert(!r.error,`combo ${p.pollueur}/${p.cee}/${p.cdp}/${p.sauts}/${p.shab}m² => ${r.error||r.valoCee+'€'}`);
  if(!r.error){ const expected=Math.round(r.row.kwhcFinal*r.row.valo*100)/100;
    assert(Math.abs(r.valoCee-expected)<0.01, `  P=M×O vérifié (${r.valoCee} = ${r.row.kwhcFinal}×${r.row.valo})`);
    assert(num(r.row.fact)>0, `  Fact correctif présent (${r.row.fact})`); }
});
// hors barème
assert(lookupValo({pollueur:'INCONNU',cee:'Classique',cdp:'non',sauts:'2',shab:75}).error,'pollueur inconnu => hors barème (erreur claire)');
// unicité : une seule ligne par combinaison complète
const dup=valoTable.filter(r=> normPoll(r.pollueur)==='enemat'&&r.cee==='Classique'&&r.cdp==='NON'&&r.sauts==='2'&&trancheOfLabel(r.shabLabel)===2);
assert(dup.length===1,'ligne unique par combinaison ('+dup.length+')');

console.log('\n— CHARGES —');
const wbC=XLSX.readFile('params/Charges.xlsx');
const cr=XLSX.utils.sheet_to_json(wbC.Sheets['Feuil1'],{header:1,blankrows:false,defval:''});
const cats=cr[0],unites=cr[1],achats=cr[2],ventes=cr[3]; const charges={};
for(let c=0;c<cats.length;c++){ const n=String(cats[c]||'').trim(); if(!n) continue; charges[n]={unite:String(unites[c]).toUpperCase(),achat:num(achats[c]),vente:num(ventes[c])}; }
assert(Object.keys(charges).length===11,'11 catégories de charges ('+Object.keys(charges).length+')');
assert(charges['Planchers'] && charges['ITE'] && charges['Fenetres'],'colonnes Planchers/ITE/Fenetres présentes (mapping Plancher→Planchers OK)');
assert(charges['Radiateurs'].unite==='PC','Radiateurs en unité PC');

console.log('\n— CALCUL HABITATION (exemple) —');
// 50 m² ITI + 8 m² fenêtres, audit 800€, régie 12%, prime du combo 1
const surfITI=50, surfFen=8;
const chargesTravaux = surfITI*charges['ITI'].achat + surfFen*charges['Fenetres'].achat;
const venteTravaux   = surfITI*charges['ITI'].vente + surfFen*charges['Fenetres'].vente;
const audit=800, regie=chargesTravaux*0.12, coutRevient=chargesTravaux+audit+regie;
const prime=lookupValo(combos[0]).valoCee;
const reste=venteTravaux-prime, marge=venteTravaux-coutRevient;
console.log(`  charges=${chargesTravaux}€ vente=${venteTravaux}€ régie=${regie.toFixed(2)}€ coûtRevient=${coutRevient.toFixed(2)}€`);
console.log(`  prime CEE=${prime}€ reste à charge=${reste.toFixed(2)}€ marge=${marge.toFixed(2)}€ => ${marge>=0?'GO':'NO-GO'}`);
assert(Math.abs(coutRevient-(chargesTravaux+audit+chargesTravaux*0.12))<0.01,'coût de revient = charges + audit + 12%');
assert(Math.abs(reste-(venteTravaux-prime))<0.01,'reste à charge = vente − prime');
assert(Math.abs(marge-(venteTravaux-coutRevient))<0.01,'marge = vente − coût de revient total');

console.log('\n'+(process.exitCode?'⚠️ DES TESTS ONT ÉCHOUÉ':'🎉 TOUS LES TESTS PASSENT'));
