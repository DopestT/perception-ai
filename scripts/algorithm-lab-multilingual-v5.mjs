// Round 5: Spanish/French intent classification; development-only, not independent validation.
// No model output authorizes a workflow. Language-selected variant uses supplied language, not detection.
import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const s=read('./adaptive-search-intent-corpus.mjs'),p=read('./algorithm-lab-intent-challenge.mjs'),v=read('./algorithm-lab-augmentation-v2.mjs'),w=read('./algorithm-lab-stress-v3.mjs');
const topics=JSON.parse(s.match(/const topics = ([\s\S]*?);\nconst templates/)[1]),templates=JSON.parse(s.match(/const templates = ([\s\S]*?);\nfunction makeCases/)[1]),aug=JSON.parse(v.match(/const aug=([\s\S]*?);\nconst fresh=/)[1]),prior=JSON.parse(p.match(/const fixtures=([\s\S]*?);\nfunction evaluate/)[1]),fresh=JSON.parse(v.match(/const fresh=([\s\S]*?);\nfunction run/)[1]),stress=JSON.parse(w.match(/const stress=([\s\S]*?);\nfunction evaluate/)[1]);
const lang={
  "es": {
    "general": [
      [
        "jardines japoneses",
        "pintura mural",
        "cultura maya",
        "diseño urbano",
        "música antigua"
      ],
      [
        "imágenes de {}",
        "recursos sobre {}",
        "ideas de {}",
        "artículos sobre {}"
      ]
    ],
    "local": [
      [
        "dentista",
        "biblioteca",
        "cafetería",
        "taller de bicicletas",
        "museo"
      ],
      [
        "dónde encontrar un {} cerca",
        "busco {} por aquí",
        "hay algún {} en mi zona",
        "{} a poca distancia"
      ]
    ],
    "shopping": [
      [
        "reloj",
        "bicicleta",
        "teléfono",
        "mochila",
        "cámara"
      ],
      [
        "dónde comprar {}",
        "busco {} a buen precio",
        "ofertas para {}",
        "quiero pedir {} por internet"
      ]
    ],
    "information": [
      [
        "gravedad",
        "evaporación",
        "electricidad",
        "memoria",
        "magnetismo"
      ],
      [
        "qué es {}",
        "explícame {}",
        "cómo funciona {}",
        "qué significa {}"
      ]
    ],
    "navigation": [
      [
        "Wikipedia",
        "GitHub",
        "UNESCO",
        "Mozilla",
        "UNICEF"
      ],
      [
        "abre el sitio oficial de {}",
        "llévame a la página de {}",
        "portal oficial de {}",
        "encuentra la web de {}"
      ]
    ],
    "build": [
      [
        "una revista",
        "una tienda",
        "un sitio educativo",
        "una asociación",
        "una aplicación"
      ],
      [
        "ayúdame a crear {}",
        "quiero desarrollar {}",
        "vamos a lanzar {}",
        "necesito iniciar {}"
      ]
    ],
    "compare": [
      [
        [
          "té",
          "café"
        ],
        [
          "madera",
          "metal"
        ],
        [
          "coche",
          "moto"
        ],
        [
          "libro",
          "revista"
        ],
        [
          "luz solar",
          "luz eléctrica"
        ]
      ],
      [
        "compara {} y {}",
        "qué es mejor {} o {}",
        "diferencias entre {} y {}",
        "ventajas de {} frente a {}"
      ]
    ],
    "current": [
      [
        "tecnología",
        "transporte",
        "economía",
        "ciencia",
        "energía"
      ],
      [
        "últimas noticias de {}",
        "novedades sobre {} hoy",
        "qué está pasando con {}",
        "actualizaciones recientes de {}"
      ]
    ]
  },
  "fr": {
    "general": [
      [
        "architecture romane",
        "peinture ancienne",
        "jardins japonais",
        "musique classique",
        "cinéma muet"
      ],
      [
        "photos de {}",
        "ressources sur {}",
        "idées de {}",
        "articles sur {}"
      ]
    ],
    "local": [
      [
        "dentiste",
        "bibliothèque",
        "café",
        "garage",
        "musée"
      ],
      [
        "où trouver un {} près de moi",
        "un {} dans mon quartier",
        "je cherche un {} à proximité",
        "{} pas loin d'ici"
      ]
    ],
    "shopping": [
      [
        "appareil photo",
        "vélo",
        "téléphone",
        "sac",
        "montre"
      ],
      [
        "où acheter un {}",
        "je voudrais commander un {}",
        "prix abordable pour un {}",
        "offres sur un {}"
      ]
    ],
    "information": [
      [
        "gravité",
        "évaporation",
        "électricité",
        "mémoire",
        "magnétisme"
      ],
      [
        "qu'est-ce que la {}",
        "explique-moi la {}",
        "comment fonctionne la {}",
        "que signifie {}"
      ]
    ],
    "navigation": [
      [
        "Wikipedia",
        "GitHub",
        "UNESCO",
        "Mozilla",
        "UNICEF"
      ],
      [
        "ouvre le site officiel de {}",
        "amène-moi sur la page de {}",
        "portail officiel de {}",
        "trouve le site web de {}"
      ]
    ],
    "build": [
      [
        "une revue",
        "une boutique",
        "un site éducatif",
        "une association",
        "une application"
      ],
      [
        "aide-moi à créer {}",
        "je veux développer {}",
        "lançons {}",
        "je souhaite démarrer {}"
      ]
    ],
    "compare": [
      [
        [
          "thé",
          "café"
        ],
        [
          "bois",
          "métal"
        ],
        [
          "voiture",
          "moto"
        ],
        [
          "livre",
          "revue"
        ],
        [
          "lumière solaire",
          "lumière électrique"
        ]
      ],
      [
        "compare {} et {}",
        "lequel est meilleur {} ou {}",
        "quelle est la différence entre {} et {}",
        "avantages de {} par rapport à {}"
      ]
    ],
    "current": [
      [
        "technologie",
        "transport",
        "économie",
        "science",
        "énergie"
      ],
      [
        "dernières nouvelles sur {}",
        "actualités du jour concernant {}",
        "que se passe-t-il avec {}",
        "mises à jour récentes sur {}"
      ]
    ]
  }
};
const newCases=[
  {
    "id": "new-1",
    "language": "es",
    "expected": "general",
    "query": "fotografías de puentes históricos"
  },
  {
    "id": "new-2",
    "language": "es",
    "expected": "general",
    "query": "recetas tradicionales de Perú"
  },
  {
    "id": "new-3",
    "language": "es",
    "expected": "local",
    "query": "alguna lavandería abierta por mi barrio"
  },
  {
    "id": "new-4",
    "language": "es",
    "expected": "local",
    "query": "necesito reparar mis zapatos aquí cerca"
  },
  {
    "id": "new-5",
    "language": "es",
    "expected": "shopping",
    "query": "un monitor usado que pueda pedir a domicilio"
  },
  {
    "id": "new-6",
    "language": "es",
    "expected": "shopping",
    "query": "cuánto cuesta un telescopio nuevo"
  },
  {
    "id": "new-7",
    "language": "es",
    "expected": "information",
    "query": "por qué se forman los arcoíris"
  },
  {
    "id": "new-8",
    "language": "es",
    "expected": "information",
    "query": "qué quiere decir inflación"
  },
  {
    "id": "new-9",
    "language": "es",
    "expected": "navigation",
    "query": "busca la página oficial del censo"
  },
  {
    "id": "new-10",
    "language": "es",
    "expected": "navigation",
    "query": "quiero entrar a la web de la biblioteca nacional"
  },
  {
    "id": "new-11",
    "language": "es",
    "expected": "build",
    "query": "quiero poner en marcha mi propio boletín"
  },
  {
    "id": "new-12",
    "language": "es",
    "expected": "build",
    "query": "necesito ayuda para desarrollar un juego"
  },
  {
    "id": "new-13",
    "language": "es",
    "expected": "compare",
    "query": "es preferible viajar en avión o en tren"
  },
  {
    "id": "new-14",
    "language": "es",
    "expected": "compare",
    "query": "en qué se distinguen el alquiler y la compra"
  },
  {
    "id": "new-15",
    "language": "es",
    "expected": "current",
    "query": "qué novedades hay esta semana en astronomía"
  },
  {
    "id": "new-16",
    "language": "es",
    "expected": "current",
    "query": "noticias recientes acerca del tráfico ferroviario"
  },
  {
    "id": "new-17",
    "language": "fr",
    "expected": "general",
    "query": "images de ponts historiques"
  },
  {
    "id": "new-18",
    "language": "fr",
    "expected": "general",
    "query": "recettes traditionnelles du Québec"
  },
  {
    "id": "new-19",
    "language": "fr",
    "expected": "local",
    "query": "une pharmacie ouverte dans les environs"
  },
  {
    "id": "new-20",
    "language": "fr",
    "expected": "local",
    "query": "où faire réparer mes chaussures dans le quartier"
  },
  {
    "id": "new-21",
    "language": "fr",
    "expected": "shopping",
    "query": "je cherche un écran d'occasion à commander"
  },
  {
    "id": "new-22",
    "language": "fr",
    "expected": "shopping",
    "query": "combien coûte un télescope neuf"
  },
  {
    "id": "new-23",
    "language": "fr",
    "expected": "information",
    "query": "pourquoi se forment les arcs-en-ciel"
  },
  {
    "id": "new-24",
    "language": "fr",
    "expected": "information",
    "query": "que veut dire inflation"
  },
  {
    "id": "new-25",
    "language": "fr",
    "expected": "navigation",
    "query": "accède à la page officielle du recensement"
  },
  {
    "id": "new-26",
    "language": "fr",
    "expected": "navigation",
    "query": "je veux consulter le site de la bibliothèque nationale"
  },
  {
    "id": "new-27",
    "language": "fr",
    "expected": "build",
    "query": "je voudrais lancer ma propre lettre d'information"
  },
  {
    "id": "new-28",
    "language": "fr",
    "expected": "build",
    "query": "j'ai besoin d'aide pour développer un jeu"
  },
  {
    "id": "new-29",
    "language": "fr",
    "expected": "compare",
    "query": "vaut-il mieux voyager en avion ou en train"
  },
  {
    "id": "new-30",
    "language": "fr",
    "expected": "compare",
    "query": "en quoi la location se distingue de l'achat"
  },
  {
    "id": "new-31",
    "language": "fr",
    "expected": "current",
    "query": "quelles nouveautés cette semaine en astronomie"
  },
  {
    "id": "new-32",
    "language": "fr",
    "expected": "current",
    "query": "informations récentes sur les perturbations ferroviaires"
  }
];
function run(topics,templates,aug,prior,fresh,stress,lang,newCases){
 const norm=q=>q.normalize("NFKC").toLowerCase().trim().replace(/\s+/g," ");
 const gen=(t,x)=>Object.entries(t).flatMap(([expected,items])=>items.flatMap(item=>x[expected].map(p=>{const a=Array.isArray(item)?item:[item];let i=0;return{expected,query:p.replace(/\{\}/g,()=>a[i++])}})));
 const base=gen(topics,templates), known=new Set(base.map(r=>norm(r.query))),held=new Set([...prior,...fresh,...stress,...newCases].map(r=>norm(r.query)));
 const extra=gen(topics,aug).filter(r=>{const n=norm(r.query);if(known.has(n)||held.has(n))return false;known.add(n);return true});
 const en=[...base,...extra];let overlap=0;
 const multi=Object.entries(lang).flatMap(([language,byClass])=>Object.entries(byClass).flatMap(([expected,[items,patterns]])=>items.flatMap(item=>patterns.map(p=>{const a=Array.isArray(item)?item:[item];let i=0;return{language,expected,query:p.replace(/\{\}/g,()=>a[i++])}})))).filter(r=>{const n=norm(r.query);if(held.has(n)){overlap++;return false}if(known.has(n))return false;known.add(n);return true});
 if([...held].some(n=>known.has(n)))throw Error("training/eval exact overlap");
 const features=q=>{const t=norm(q).match(/[\p{L}\p{N}]+/gu)||[];return [...t,...t.slice(1).map((w,i)=>t[i]+" "+w),"__start_"+(t[0]||""),"__end_"+(t.at(-1)||"")]};
 const fit=rows=>{const counts=new Map(),totals=new Map(),sizes=new Map(),vocab=new Set();for(const r of rows){const k=r.expected;if(!counts.has(k))counts.set(k,new Map());sizes.set(k,(sizes.get(k)||0)+1);for(const x of features(r.query)){vocab.add(x);const m=counts.get(k);m.set(x,(m.get(x)||0)+1);totals.set(k,(totals.get(k)||0)+1)}}return{counts,totals,sizes,vocab,n:rows.length}};
 const predict=(m,q)=>{const f=features(q).filter(x=>m.vocab.has(x));const rank=[...m.sizes.keys()].map(k=>[k,Math.log(m.sizes.get(k)/m.n)+f.reduce((s,x)=>s+Math.log(((m.counts.get(k).get(x)||0)+1)/(m.totals.get(k)+m.vocab.size)),0)]).sort((a,b)=>b[1]-a[1]);return rank[0][1]-rank[1][1]<1.25?"general":rank[0][0]};
 const models={englishOnly:fit(en),pooled:fit([...en,...multi]),es:fit(multi.filter(r=>r.language==="es")),fr:fit(multi.filter(r=>r.language==="fr"))};
 const assess=(set,explicit)=>{const out={};for(const name of ["englishOnly","pooled",...(explicit?["selectedLanguage"]:[])]){let correct=0,falseBuild=0;const byLanguage={},failures=[];for(const r of set){const model=name==="selectedLanguage"?models[r.language]:models[name];const predicted=predict(model,r.query);const b=byLanguage[r.language||"en"]??={total:0,correct:0};b.total++;if(predicted===r.expected){correct++;b.correct++}else failures.push({id:r.id,expected:r.expected,predicted});if(predicted==="build"&&r.expected!=="build")falseBuild++;}out[name]={correct,total:set.length,falseBuild,byLanguage,failures}}return out};
 const old=stress.filter(r=>r.slice==="multilingual").map((r,i)=>({...r,language:i<8?"es":"fr"}));
 return {englishTraining:en.length,multilingualTraining:multi.length,excludedOverlap:overlap,old:assess(old,true),new:assess(newCases,true),englishRegression:assess([...prior,...fresh],false),notes:"Raw intent hints only; selected language supplied by fixture, not detected. All workflows require separate authorization."};
}
console.log(JSON.stringify(run(topics,templates,aug,prior,fresh,stress,lang,newCases),null,2));
