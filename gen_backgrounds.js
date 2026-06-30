/* Embarque les 4 fonds d'écran (base64) dans index.html, un par étape/onglet,
   posés sur un calque fixe voilé de blanc (~88%) = présents mais discrets.
   Source images : C:/Users/aymer/Desktop/Valorisation projet/FOND 1..4.jpg
   L'app reste mono-fichier et hors-ligne. Optionnel : compression via sharp si dispo. */
const fs = require('fs');

const SRC = 'C:/Users/aymer/Desktop/Valorisation projet';
// Mapping étape/onglet -> image (thématisé)
const MAP = {
  step1:'FOND 1.jpg',   // bureau open-space -> chargement
  step2:'FOND 4.jpg',   // bâtiment + solaire -> valorisation CEE
  step3:'FOND 2.jpg',   // immeubles d'habitation -> extraction VT
  step4:'FOND 3.jpg',   // salle de réunion -> charges & marges
  step5:'FOND 4.jpg',   // énergie -> rapport
  params:'FOND 1.jpg'   // bureau -> paramètres
};

let sharp = null;
try { sharp = require('sharp'); } catch(_) { /* fallback : images originales */ }

async function toDataUri(file){
  const buf = fs.readFileSync(SRC + '/' + file);
  let out = buf;
  if(sharp){
    try { out = await sharp(buf).resize({width:1280, withoutEnlargement:true}).jpeg({quality:58}).toBuffer(); }
    catch(e){ out = buf; }
  }
  return 'data:image/jpeg;base64,' + out.toString('base64');
}

(async ()=>{
  // dédoublonne les fichiers (FOND 1 et FOND 4 utilisés 2x) pour ne pas encoder 2 fois
  const cache = {};
  const images = {};
  for(const [view, file] of Object.entries(MAP)){
    if(!cache[file]) cache[file] = await toDataUri(file);
    images[view] = cache[file];
  }

  let html = fs.readFileSync('index.html','utf8');

  // 1) Calque de fond juste après <body>
  if(!html.includes('id="bgLayer"')){
    html = html.replace(/<body>/, '<body>\n<div id="bgLayer" aria-hidden="true"></div>');
  }

  // 2) CSS du calque + translucidité légère des cartes (avant </style>)
  const css = `
/* ===== Fonds d'écran discrets par étape (calque fixe voilé) ===== */
#bgLayer{position:fixed;inset:0;z-index:0;background-size:cover;background-position:center;background-repeat:no-repeat;transition:background-image .35s ease}
#bgLayer::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(244,247,252,.84) 0%,rgba(244,247,252,.90) 100%)}
header,nav,main{position:relative;z-index:2}
.card{background:rgba(255,255,255,.90);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.vt-block{background:rgba(251,252,255,.84)}
.kpi{background:rgba(251,252,255,.86)}
`;
  if(!html.includes("Fonds d'écran discrets par étape")){
    html = html.replace(/<\/style>/, css + '</style>');
  }

  // 3) Dictionnaire d'images injecté AVANT le script principal
  const imgScript = '<script id="bgImages">window.BG_IMAGES=' + JSON.stringify(images) + ';<\/script>\n';
  if(!html.includes('id="bgImages"')){
    // insère avant le dernier <script> (le script applicatif)
    const idx = html.lastIndexOf('<script>');
    html = html.slice(0, idx) + imgScript + html.slice(idx);
  }

  fs.writeFileSync('index.html','utf8'===0?html:html,'utf8');
  const kb = Math.round(html.length/1024);
  console.log('sharp:', sharp? 'oui (compressé)' : 'non (originaux)');
  console.log('images embarquées:', Object.keys(images).length, '| fichiers uniques:', Object.keys(cache).length);
  console.log('index.html ->', kb, 'Ko');
})();
