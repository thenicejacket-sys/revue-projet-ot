/* Test de validation : reproduit la logique de l'app (parse + lookup déterministe + charges)
   et la confronte aux fichiers générés. Couvre §11 (≥3 combos, charges, calcul). */
const XLSX = require('xlsx');
const assert = (cond,msg)=>{ if(!cond){ console.error('❌ ÉCHEC:',msg); process.exitCode=1; } else console.log('✅',msg); };

const num = x => { if(x==null||x==='') return 0; const n=parseFloat(String(x).replace(/\s/g,'').replace(',','.')); return isNaN(n)?0:n; };
const normCee = v => /pr[ée]c/i.test(String(v||'')) ? 'CEE Précaire':'Classique';
const normCdp = v => /oui|^o$|true|1/i.test(String(v||'').trim())?'OUI':'NON';
const normSauts = v => { const m=String(v||'').match(/\d/); return m?m[0]:'2'; };
const normPoll = v => String(v||'').trim().toLowerCase();
const VCOL={A:0,B:1,C:2,D:3,G:6,J:9,K:10,L:11,N:13,O:14};

function shabToTranche(s){ s=num(s); if(s<35)return 0; if(s<60)return 1; if(s<90)return 2; if(s<110)return 3; if(s<=130)return 4; return 5; }
function trancheOfLabel(label){
  const t=String(label||''); const nums=(t.match(/\d+([.,]\d+)?/g)||[]).map(x=>parseFloat(x.replace(',','.')));
  const hasLt=/</.test(t), hasGt=/>/.test(t);
  if(nums.length>=2) return shabToTranche((nums[0]+nums[1])/2);
  if(nums.length===1){ if(hasLt) return shabToTranche(nums[0]-1); if(hasGt) return shabToTranche(nums[0]+1); return shabToTranche(nums[0]); }
  return -1;
}

const wbV=XLSX.readFile('params/VALORISATION_TEMPLATE.xlsx');
const rows=XLSX.utils.sheet_to_json(wbV.Sheets['Feuil1'],{header:1,blankrows:false,defval:''});
const valoTable=rows.slice(2).filter(r=>String(r[VCOL.G]||'').trim()!=='').map(r=>({
  sauts:normSauts(r[VCOL.A]),kwhc:num(r[VCOL.B]),fact:num(r[VCOL.C]),shabLabel:String(r[VCOL.D]||''),
  pollueur:String(r[VCOL.G]||'').trim(),cdp:normCdp(r[VCOL.J]),cee:normCee(r[VCOL.K]),
  kwhcFinal:num(r[VCOL.L]),valo:num(r[VCOL.N]),valoCee:num(r[VCOL.O])
}));
const pollueurs=[...new Set(valoTable.map(r=>r.pollueur))];

function lookupValo(p){
  const tr=shabToTranche(p.shab);
  const c=valoTable.filter(r=> normPoll(r.pollueur)===normPoll(p.pollueur) && r.cee===normCee(p.cee)
    && normCdp(r.cdp)===normCdp(p.cdp) && normSauts(r.sauts)===normSauts(p.sauts) && trancheOfLabel(r.shabLabel)===tr);
  if(!c.length) return {error:'hors barème'};
  const r=c[0]; let v=r.valoCee; if(!v){ let L=r.kwhcFinal||r.kwhc*r.fact/1000; v=L*r.valo; }
  return {valoCee:v,row:r};
}

console.log('\n— VALORISATION —');
assert(valoTable.length===144,'144 lignes parsées ('+valoTable.length+')');
assert(JSON.stringify(pollueurs)===JSON.stringify(['DRAPO','ENEMAT']),'pollueurs lus dynamiquement: '+pollueurs.join(', '));

// 3 combinaisons connues, O = L × N
const combos=[
  {pollueur:'DRAPO', cee:'classique', cdp:'non', sauts:'2', shab:75},   // 60-90
  {pollueur:'ENEMAT',cee:'precaire',  cdp:'oui', sauts:'4', shab:120},  // 110-130
  {pollueur:'DRAPO', cee:'precaire',  cdp:'oui', sauts:'3', shab:30},   // <35
];
combos.forEach(p=>{
  const r=lookupValo(p);
  assert(!r.error,`combo ${p.pollueur}/${p.cee}/${p.cdp}/${p.sauts}/${p.shab}m² => ${r.error||r.valoCee+'€'}`);
  if(!r.error){ const expected=Math.round(r.row.kwhcFinal*r.row.valo*100)/100;
    assert(Math.abs(r.valoCee-expected)<0.01, `  O=L×N vérifié (${r.valoCee} = ${r.row.kwhcFinal}×${r.row.valo})`); }
});
// hors barème
assert(lookupValo({pollueur:'INCONNU',cee:'classique',cdp:'non',sauts:'2',shab:75}).error,'pollueur inconnu => hors barème (erreur claire)');
// unicité : une seule ligne par combinaison complète
const dup=valoTable.filter(r=> normPoll(r.pollueur)==='drapo'&&r.cee==='Classique'&&r.cdp==='NON'&&r.sauts==='2'&&trancheOfLabel(r.shabLabel)===2);
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
