// Round 6: diverse training and character n-grams; exploratory ranked intent hints.
// No runtime integration, independent certification, external services or workflow authorization.
import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const [s,p,v,w,z]=['adaptive-search-intent-corpus.mjs','algorithm-lab-intent-challenge.mjs','algorithm-lab-augmentation-v2.mjs','algorithm-lab-stress-v3.mjs','algorithm-lab-multilingual-v5.mjs'].map(read);
const parse=(s,re)=>JSON.parse(s.match(re)[1]);
const topics=parse(s,/const topics = ([\s\S]*?);\nconst templates/),templates=parse(s,/const templates = ([\s\S]*?);\nfunction makeCases/),aug=parse(v,/const aug=([\s\S]*?);\nconst fresh=/),prior=parse(p,/const fixtures=([\s\S]*?);\nfunction evaluate/),fresh=parse(v,/const fresh=([\s\S]*?);\nfunction run/),stress=parse(w,/const stress=([\s\S]*?);\nfunction evaluate/),lang=parse(z,/const lang=([\s\S]*?);\nconst newCases=/),newCases=parse(z,/const newCases=([\s\S]*?);\nfunction run/);
const training={
  "fr": {
    "general": [
      "des idées pour décorer un salon",
      "je voudrais voir des dessins de bateaux",
      "documentation sur les civilisations antiques",
      "quelques lectures sur la nature",
      "des photos de rues parisiennes",
      "inspiration pour un jardin"
    ],
    "local": [
      "un endroit où faire réparer ma montre pas loin",
      "je cherche un médecin dans les environs",
      "y a-t-il une piscine dans le quartier",
      "où est le bureau de poste le plus proche",
      "un atelier de couture ouvert près d'ici",
      "trouver un salon de coiffure dans cette ville"
    ],
    "shopping": [
      "combien coûte une tablette neuve",
      "un appareil ménager livré à domicile",
      "je voudrais acheter des chaussures d'occasion",
      "un casque audio pas trop cher à commander",
      "où commander un clavier sur internet",
      "je cherche une bonne affaire sur un écran"
    ],
    "information": [
      "pourquoi le ciel change de couleur",
      "comment expliquer le fonctionnement d'un moteur",
      "que veut dire ce terme juridique",
      "d'où vient la rosée du matin",
      "j'aimerais comprendre la circulation sanguine",
      "à quoi sert un condensateur"
    ],
    "navigation": [
      "accède au site du ministère de la culture",
      "je veux consulter le portail des impôts",
      "page de connexion à la messagerie",
      "ouvre la documentation officielle de Java",
      "adresse du site de la mairie",
      "envoie-moi vers le site de l'agence spatiale"
    ],
    "build": [
      "je voudrais monter ma propre entreprise",
      "j'ai besoin d'aide pour concevoir un logiciel",
      "accompagne-moi dans la création d'un club",
      "je compte mettre sur pied un atelier",
      "aide-moi à lancer une émission de radio",
      "je souhaite fonder un groupe de recherche"
    ],
    "compare": [
      "vaut-il mieux utiliser du cuivre ou de l'aluminium",
      "en quoi le tramway se distingue du métro",
      "lequel choisir entre un piano et un synthétiseur",
      "quels sont les avantages du coton par rapport au lin",
      "comment se comparent ces deux systèmes",
      "est-ce préférable de marcher ou de prendre le bus"
    ],
    "current": [
      "quelles sont les dernières informations sur le marché",
      "quoi de neuf cette semaine en médecine",
      "les annonces récentes au sujet des transports",
      "qu'est-il arrivé ce matin dans la région",
      "les nouvelles concernant les élections aujourd'hui",
      "situation actuelle de la circulation"
    ]
  },
  "es": {
    "general": [
      "ideas para decorar una sala",
      "dibujos de barcos antiguos",
      "material para leer sobre astronomía",
      "fotografías urbanas y arte",
      "inspiración para un jardín",
      "textos sobre pueblos antiguos"
    ],
    "local": [
      "algún sitio donde arreglar mi reloj por aquí",
      "busco un médico en los alrededores",
      "hay una piscina en el barrio",
      "dónde queda la oficina de correos más próxima",
      "una peluquería abierta cerca",
      "un taller en esta ciudad"
    ],
    "shopping": [
      "cuánto vale una tableta nueva",
      "un electrodoméstico con entrega a domicilio",
      "quisiera adquirir zapatos de segunda mano",
      "un casco barato para pedir en línea",
      "dónde encargar un teclado por internet",
      "busco una ganga en una pantalla"
    ],
    "information": [
      "por qué cambia de color el cielo",
      "cómo se explica el funcionamiento de un motor",
      "qué quiere decir este término jurídico",
      "de dónde viene el rocío",
      "quisiera entender la circulación de la sangre",
      "para qué sirve un condensador"
    ],
    "navigation": [
      "entra al sitio del ministerio de cultura",
      "quiero consultar el portal de impuestos",
      "página de acceso al correo",
      "abre la documentación oficial de Java",
      "dirección del sitio del ayuntamiento",
      "llévame a la web de la agencia espacial"
    ],
    "build": [
      "quisiera montar mi propia empresa",
      "necesito ayuda para diseñar un programa",
      "acompáñame a fundar un club",
      "pienso poner en marcha un taller",
      "ayúdame a lanzar un programa de radio",
      "quiero formar un grupo de investigación"
    ],
    "compare": [
      "vale más la pena usar cobre o aluminio",
      "en qué se diferencia el tranvía del metro",
      "cuál elegir entre piano y sintetizador",
      "ventajas del algodón con respecto al lino",
      "cómo se comparan estos dos sistemas",
      "conviene caminar o tomar el autobús"
    ],
    "current": [
      "cuáles son las últimas informaciones del mercado",
      "qué hay de nuevo esta semana en medicina",
      "anuncios recientes sobre el transporte",
      "qué ocurrió esta mañana en la región",
      "noticias de las elecciones hoy",
      "situación actual del tráfico"
    ]
  }
};
const heldNew=[
  {
    "id": "v6-new-1",
    "language": "fr",
    "expected": "local",
    "query": "un serrurier dispo dans le coin"
  },
  {
    "id": "v6-new-2",
    "language": "fr",
    "expected": "shopping",
    "query": "je cherche à me procurer des jumelles bon marché"
  },
  {
    "id": "v6-new-3",
    "language": "fr",
    "expected": "information",
    "query": "pour quelle raison la glace flotte"
  },
  {
    "id": "v6-new-4",
    "language": "fr",
    "expected": "navigation",
    "query": "emmène-moi au portail officiel de l'assurance maladie"
  },
  {
    "id": "v6-new-5",
    "language": "fr",
    "expected": "build",
    "query": "je rêve de mettre en place mon propre studio de danse"
  },
  {
    "id": "v6-new-6",
    "language": "fr",
    "expected": "compare",
    "query": "qu'est-ce qui distingue un volcan actif d'un volcan éteint"
  },
  {
    "id": "v6-new-7",
    "language": "fr",
    "expected": "current",
    "query": "où en est la grève des pilotes aujourd'hui"
  },
  {
    "id": "v6-new-8",
    "language": "fr",
    "expected": "general",
    "query": "illustrations de costumes médiévaux"
  },
  {
    "id": "v6-new-9",
    "language": "es",
    "expected": "local",
    "query": "algún zapatero disponible por la zona"
  },
  {
    "id": "v6-new-10",
    "language": "es",
    "expected": "shopping",
    "query": "me interesa conseguir unos prismáticos económicos"
  },
  {
    "id": "v6-new-11",
    "language": "es",
    "expected": "information",
    "query": "por qué motivo flota el hielo"
  },
  {
    "id": "v6-new-12",
    "language": "es",
    "expected": "navigation",
    "query": "llévame al portal oficial de la seguridad social"
  },
  {
    "id": "v6-new-13",
    "language": "es",
    "expected": "build",
    "query": "sueño con montar mi propio estudio de baile"
  },
  {
    "id": "v6-new-14",
    "language": "es",
    "expected": "compare",
    "query": "qué distingue a un volcán activo de uno extinto"
  },
  {
    "id": "v6-new-15",
    "language": "es",
    "expected": "current",
    "query": "cómo va la huelga de pilotos hoy"
  },
  {
    "id": "v6-new-16",
    "language": "es",
    "expected": "general",
    "query": "ilustraciones de trajes medievales"
  }
];
const mixed=[
  {
    "id": "mixed-v6-1",
    "query": "find a farmacia cerca de mí and see if open now",
    "expected": [
      "local",
      "current"
    ]
  },
  {
    "id": "mixed-v6-2",
    "query": "compare les prix de deux ordinateurs before buying",
    "expected": [
      "compare",
      "shopping"
    ]
  },
  {
    "id": "mixed-v6-3",
    "query": "últimas noticias about the railway strike and why it happened",
    "expected": [
      "current",
      "information"
    ]
  },
  {
    "id": "mixed-v6-4",
    "query": "où trouver a coffee shop près de la gare",
    "expected": [
      "local"
    ]
  },
  {
    "id": "mixed-v6-5",
    "query": "I need un portátil barato livré à domicile",
    "expected": [
      "shopping"
    ]
  },
  {
    "id": "mixed-v6-6",
    "query": "ouvre le site officiel de la mairie and explain the application process",
    "expected": [
      "navigation",
      "information"
    ]
  },
  {
    "id": "mixed-v6-7",
    "query": "quiero crear mi negocio but primero compare las opciones",
    "expected": [
      "compare",
      "build"
    ]
  },
  {
    "id": "mixed-v6-8",
    "query": "je ne veux pas lancer une entreprise, explique-moi les règles",
    "expected": [
      "information"
    ]
  },
  {
    "id": "mixed-v6-9",
    "query": "no quiero comprar nada, solo imágenes de cámaras antiguas",
    "expected": [
      "general"
    ]
  },
  {
    "id": "mixed-v6-10",
    "query": "how does fotosíntesis work, explique-moi",
    "expected": [
      "information"
    ]
  },
  {
    "id": "mixed-v6-11",
    "query": "find a vélo à vendre près de chez moi",
    "expected": [
      "shopping",
      "local"
    ]
  },
  {
    "id": "mixed-v6-12",
    "query": "actualités sur les trains and compare the bus route",
    "expected": [
      "current",
      "compare"
    ]
  },
  {
    "id": "mixed-v6-13",
    "query": "no quiero desarrollar una app; show existing resources",
    "expected": [
      "general"
    ]
  },
  {
    "id": "mixed-v6-14",
    "query": "je veux créer mon site web and find official documentation",
    "expected": [
      "build",
      "navigation"
    ]
  },
  {
    "id": "mixed-v6-15",
    "query": "cheap headphones livraison demain",
    "expected": [
      "shopping"
    ]
  },
  {
    "id": "mixed-v6-16",
    "query": "qué es mejor, train ou avion",
    "expected": [
      "compare"
    ]
  }
];
function experiment(topics,templates,aug,prior,fresh,stress,lang,newCases,training,heldNew,mixed){
 const norm=q=>q.normalize("NFKC").toLowerCase().trim().replace(/\s+/g," ");
 const gen=(t,x)=>Object.entries(t).flatMap(([expected,items])=>items.flatMap(item=>x[expected].map(p=>{const a=Array.isArray(item)?item:[item];let i=0;return{expected,query:p.replace(/\{\}/g,()=>a[i++])}})));
 const base=gen(topics,templates), known=new Set(base.map(r=>norm(r.query))),held=new Set([...prior,...fresh,...stress,...newCases,...heldNew,...mixed].map(r=>norm(r.query)));
 let excluded=0;
 const clean=rows=>rows.filter(r=>{const n=norm(r.query);if(held.has(n)){excluded++;return false}if(known.has(n))return false;known.add(n);return true});
 const en=[...base,...clean(gen(topics,aug))];
 const multi=clean(Object.entries(lang).flatMap(([language,byClass])=>Object.entries(byClass).flatMap(([expected,[items,patterns]])=>items.flatMap(item=>patterns.map(p=>{const a=Array.isArray(item)?item:[item];let i=0;return{language,expected,query:p.replace(/\{\}/g,()=>a[i++])}})))));
 const extra=clean(Object.entries(training).flatMap(([language,classes])=>Object.entries(classes).flatMap(([expected,qs])=>qs.map(query=>({language,expected,query})))));
 if([...held].some(n=>known.has(n)))throw Error("training/evaluation overlap");
 const word=q=>{const t=norm(q).match(/[\p{L}\p{N}]+/gu)||[];return [...t,...t.slice(1).map((w,i)=>t[i]+" "+w),"__start_"+(t[0]||""),"__end_"+(t.at(-1)||"")]};
 const chars=q=>{const out=[];for(const t of norm(q).normalize("NFD").replace(/\p{M}/gu,"").match(/[\p{L}\p{N}]+/gu)||[]){const x="^"+t+"$";for(let n=3;n<=4;n++)for(let i=0;i+n<=x.length;i++)out.push("c:"+x.slice(i,i+n))}return [...word(q),...out]};
 const fit=(rows,features)=>{const counts=new Map(),totals=new Map(),sizes=new Map(),vocab=new Set();for(const r of rows){const k=r.expected;if(!counts.has(k))counts.set(k,new Map());sizes.set(k,(sizes.get(k)||0)+1);for(const x of features(r.query)){vocab.add(x);const m=counts.get(k);m.set(x,(m.get(x)||0)+1);totals.set(k,(totals.get(k)||0)+1)}}return{counts,totals,sizes,vocab,n:rows.length,features}};
 const rank=(m,q)=>{const f=m.features(q).filter(x=>m.vocab.has(x));return [...m.sizes.keys()].map(k=>[k,Math.log(m.sizes.get(k)/m.n)+f.reduce((s,x)=>s+Math.log(((m.counts.get(k).get(x)||0)+1)/(m.totals.get(k)+m.vocab.size)),0)]).sort((a,b)=>b[1]-a[1])};
 const models={v5:fit([...en,...multi],word),diverse:fit([...en,...multi,...extra],word),charHybrid:fit([...en,...multi,...extra],chars)};
 const assess=set=>Object.fromEntries(Object.entries(models).map(([name,m])=>{let correct=0,falseBuild=0,top2=0;const byLanguage={};for(const r of set){const rr=rank(m,r.query),p=rr[0][1]-rr[1][1]<1.25?"general":rr[0][0];const b=byLanguage[r.language||"en"]??={total:0,correct:0};b.total++;if(p===r.expected){correct++;b.correct++}if(rr.slice(0,2).some(x=>x[0]===r.expected))top2++;if(p==="build"&&r.expected!=="build")falseBuild++}return[name,{total:set.length,correct,top2,falseBuild,byLanguage}]}));
 const assessMixed=()=>Object.fromEntries(Object.entries(models).map(([name,m])=>{let primary=0,covered=0,labels=0,unexpectedBuild=0;for(const r of mixed){const rr=rank(m,r.query),p=rr[0][1]-rr[1][1]<1.25?"general":rr[0][0];if(r.expected.includes(p))primary++;for(const e of r.expected){labels++;if(rr.slice(0,2).some(x=>x[0]===e))covered++}if(p==="build"&&!r.expected.includes("build"))unexpectedBuild++}return[name,{total:mixed.length,primary,labels,covered,unexpectedBuild}]}));
 return{training:{english:en.length,syntheticMultilingual:multi.length,diverseAdded:extra.length,total:en.length+multi.length+extra.length,excluded},previousMultilingual:assess(newCases),freshMultilingual:assess(heldNew),english:assess([...prior,...fresh]),mixed:assessMixed(),notes:"Ranked hints, not workflow actions. All test examples development-authored. Top2 label coverage is exploratory, not multi-label classification."};
}
console.log(JSON.stringify(experiment(topics,templates,aug,prior,fresh,stress,lang,newCases,training,heldNew,mixed),null,2));
