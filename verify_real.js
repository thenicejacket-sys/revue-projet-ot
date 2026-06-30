/* Vérifie que les VRAIS barèmes OT Énergie se lisent correctement avec la logique de l'app.
   Lecture LOCALE seulement (les fichiers ne sont pas publiés). */
const XLSX = require('xlsx');
const REAL = 'C:/Users/aymer/Desktop/Valorisation projet';
const ok = (c,m)=>{ console.log((c?'✅':'❌')+' '+m); if(!c) process.exitCode=1; };

const num = x => { if(x==null||x==='') return 0; const n=parseFloat(String(x).replace(/\s/g,'').replace(',','.')); return isNaN(n)?0:n; };
const normCee = v => /pr[ée]c/i.test(String(v||'')) ? 'CEE Précaire':'Classique';
const normCdp = v => /oui|^o$|true|1/i.test(String(v||'').trim())?'OUI':'NON';
const normSauts = v => { const m=String(v||'').match(/\d/); return m?m[0]:'2'; };
const normPoll = v => String(v||'').trim().toLowerCase();
const VCOL={A:0,B:1,C:2,D:3,G:6,J:9,K:10,L:11,N:13,O:14};
const shabToTranche=s=>{s=num(s);if(s<35)return 0;if(s<60)return 1;if(s<90)return 2;if(s<110)return 3;if(s<=130)return 4;return 5;};
function trancheOfLabel(label){const t=String(label||'');const nums=(t.match(/\d+([.,]\d+)?/g)||[]).map(x=>parseFloat(x.replace(',','.')));const lt=/</.test(t),gt=/>/.test(t);if(nums.length>=2)return shabToTranche((nums[0]+nums[1])/2);if(nums.length===1){if(lt)return shabToTranche(nums[0]-1);if(gt)return shabToTranche(nums[0]+1);return shabToTranche(nums[0]);}return -1;}

// --- parseValorisation NOUVELLE version (détection robuste des lignes) ---
function parseValorisation(file){
  const wb=XLSX.readFile(REAL+'/'+file);
  const ws=wb.Sheets['Feuil1']||wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,blankrows:false,defval:''});
  return rows.filter(r=>{
    const a=String(r[VCOL.A]??'').trim(), g=String(r[VCOL.G]??'').trim();
    return /^[234]/.test(a) && g && g.toLowerCase()!=='pollueur/mandataire';
  }).map(r=>({sauts:normSauts(r[VCOL.A]),kwhc:num(r[VCOL.B]),fact:num(r[VCOL.C]),shabLabel:String(r[VCOL.D]||''),
    pollueur:String(r[VCOL.G]||'').trim(),cdp:normCdp(r[VCOL.J]),cee:normCee(r[VCOL.K]),
    kwhcFinal:num(r[VCOL.L]),valo:num(r[VCOL.N]),valoCee:num(r[VCOL.O])}));
}
function lookup(table,p){
  const tr=shabToTranche(p.shab);
  const c=table.filter(r=>normPoll(r.pollueur)===normPoll(p.pollueur)&&r.cee===normCee(p.cee)&&normCdp(r.cdp)===normCdp(p.cdp)&&normSauts(r.sauts)===normSauts(p.sauts)&&trancheOfLabel(r.shabLabel)===tr);
  if(!c.length)return{error:'hors barème'};const r=c[0];let v=r.valoCee;if(!v){let L=r.kwhcFinal||r.kwhc*r.fact/1000;v=L*r.valo;}return{valoCee:v,row:r};
}

console.log('===== VRAI VALORISATION TEMPLATE.xlsx =====');
const T = parseValorisation('VALORISATION TEMPLATE.xlsx');
ok(T.length>0, T.length+' lignes de barème parsées');
console.log('   Pollueurs :', [...new Set(T.map(r=>r.pollueur))].join(', '));
console.log('   CEE       :', [...new Set(T.map(r=>r.cee))].join(', '));
console.log('   CDP       :', [...new Set(T.map(r=>r.cdp))].join(', '));
console.log('   Sauts     :', [...new Set(T.map(r=>r.sauts))].join(', '));
console.log('   Tranches  :', [...new Set(T.map(r=>r.shabLabel))].join(' | '));
// 1ère ligne du barème NON sautée (DRAPO/Classique/NON/2/Shab<35 -> 907.704)
const r1 = lookup(T,{pollueur:'DRAPO',cee:'classique',cdp:'non',sauts:'2',shab:30});
ok(!r1.error, 'lookup [DRAPO/Classique/NON/2/30m²] => '+(r1.error||r1.valoCee+' €'));
if(!r1.error){ ok(Math.abs(r1.valoCee - r1.row.kwhcFinal*r1.row.valo)<0.01, '   O = L×N vérifié ('+r1.valoCee+' = '+r1.row.kwhcFinal+'×'+r1.row.valo+')'); }
// quelques combinaisons supplémentaires sur les vraies clés détectées
const polls=[...new Set(T.map(r=>r.pollueur))];
let hits=0; T.slice(0,5).forEach(r=>{ const x=lookup(T,{pollueur:r.pollueur,cee:r.cee,cdp:r.cdp,sauts:r.sauts,shab:({0:20,1:45,2:75,3:100,4:120,5:140})[trancheOfLabel(r.shabLabel)]}); if(!x.error)hits++; });
ok(hits>=4, hits+'/5 premières lignes re-trouvées par lookup');

console.log('\n===== VRAI Charges.xlsx =====');
const wbC=XLSX.readFile(REAL+'/Charges.xlsx');
const cr=XLSX.utils.sheet_to_json(wbC.Sheets[wbC.SheetNames[0]],{header:1,blankrows:false,defval:''});
const cats=cr[0],unites=cr[1],achats=cr[2],ventes=cr[3];const map={};
for(let c=0;c<cats.length;c++){const n=String(cats[c]||'').trim();if(!n)continue;map[n]={unite:String(unites[c]).toUpperCase(),achat:num(achats[c]),vente:num(ventes[c])};}
ok(map['ITE']&&map['ITI']&&map['Planchers']&&map['Fenetres']&&map['Combles'], 'colonnes ITE/ITI/Planchers/Fenetres/Combles présentes');
console.log('   Catégories:', Object.keys(map).join(', '));
console.log('   Exemples  : ITI achat='+map['ITI'].achat+' vente='+map['ITI'].vente+' | ITE achat='+map['ITE'].achat+' vente='+map['ITE'].vente);
if(map['AUDIT']) console.log('   ⚠️ Colonne AUDIT détectée dans Charges.xlsx : '+map['AUDIT'].achat+' € (= montant Audit VT potentiel)');

console.log('\n===== Non-régression : exemple params/ =====');
const E = (function(){const wb=XLSX.readFile('params/VALORISATION_TEMPLATE.xlsx');const ws=wb.Sheets['Feuil1'];const rows=XLSX.utils.sheet_to_json(ws,{header:1,blankrows:false,defval:''});
  return rows.filter(r=>{const a=String(r[VCOL.A]??'').trim(),g=String(r[VCOL.G]??'').trim();return /^[234]/.test(a)&&g&&g.toLowerCase()!=='pollueur/mandataire';});})();
ok(E.length===144, 'exemple toujours lu correctement ('+E.length+' lignes, attendu 144)');

console.log('\n'+(process.exitCode?'⚠️ ÉCHECS':'🎉 TOUS LES CONTRÔLES PASSENT'));
