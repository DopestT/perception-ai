// Algorithm Laboratory round 3: stress test, not independent or representative evaluation.
// Run with Node; no network, dependencies, runtime integration or private data.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const source=read('./adaptive-search-intent-corpus.mjs'),p=read('./algorithm-lab-intent-challenge.mjs'),v=read('./algorithm-lab-augmentation-v2.mjs');
const rows=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./adaptive-search-intent-corpus.mjs',import.meta.url)),'--cases'],{encoding:'utf8'}));
const topics=JSON.parse(source.match(/const topics = ([\s\S]*?);\nconst templates/)[1]);
const aug=JSON.parse(v.match(/const aug=([\s\S]*?);\nconst fresh=/)[1]);
const prior=JSON.parse(p.match(/const fixtures=([\s\S]*?);\nfunction evaluate/)[1]);
const fresh=JSON.parse(v.match(/const fresh=([\s\S]*?);\nfunction run/)[1]);
const stress=[
  {
    "id": "negation-1",
    "slice": "negation",
    "query": "i want to build a bakery but actually don't start anything, just show examples",
    "expected": "general"
  },
  {
    "id": "negation-2",
    "slice": "negation",
    "query": "don't help me create a business; i only want the definition",
    "expected": "information"
  },
  {
    "id": "negation-3",
    "slice": "negation",
    "query": "i need to start a company? no, just researching the law",
    "expected": "information"
  },
  {
    "id": "negation-4",
    "slice": "negation",
    "query": "i do not want to launch an app; find existing apps",
    "expected": "general"
  },
  {
    "id": "negation-5",
    "slice": "negation",
    "query": "help me build a website is a phrase from an ad, what does it mean",
    "expected": "information"
  },
  {
    "id": "negation-6",
    "slice": "negation",
    "query": "my friend said 'i want to start a podcast'",
    "expected": "general"
  },
  {
    "id": "negation-7",
    "slice": "negation",
    "query": "i want to build a house in a video game, what are the rules",
    "expected": "information"
  },
  {
    "id": "negation-8",
    "slice": "negation",
    "query": "i want to open a bakery but first compare equipment brands",
    "expected": "compare"
  },
  {
    "id": "mixed-1",
    "slice": "mixed",
    "query": "nearest bicycle shop and compare repair prices",
    "expected": "local"
  },
  {
    "id": "mixed-2",
    "slice": "mixed",
    "query": "buy a camera or rent one, which makes more sense",
    "expected": "compare"
  },
  {
    "id": "mixed-3",
    "slice": "mixed",
    "query": "find the official portal and explain how to renew a passport",
    "expected": "navigation"
  },
  {
    "id": "mixed-4",
    "slice": "mixed",
    "query": "what does it cost to open a restaurant in my area",
    "expected": "information"
  },
  {
    "id": "mixed-5",
    "slice": "mixed",
    "query": "i want to launch a business and need current licensing rules first",
    "expected": "information"
  },
  {
    "id": "mixed-6",
    "slice": "mixed",
    "query": "best laptop near me that is on sale",
    "expected": "local"
  },
  {
    "id": "mixed-7",
    "slice": "mixed",
    "query": "how is a startup different from a small business",
    "expected": "compare"
  },
  {
    "id": "mixed-8",
    "slice": "mixed",
    "query": "news about companies that build affordable houses",
    "expected": "current"
  },
  {
    "id": "slang-1",
    "slice": "slang",
    "query": "yo where the nearest tire place at",
    "expected": "local"
  },
  {
    "id": "slang-2",
    "slice": "slang",
    "query": "need sum cheap earbuds shipped asap",
    "expected": "shopping"
  },
  {
    "id": "slang-3",
    "slice": "slang",
    "query": "whats the deal w gravity",
    "expected": "information"
  },
  {
    "id": "slang-4",
    "slice": "slang",
    "query": "take me 2 the nintendo site",
    "expected": "navigation"
  },
  {
    "id": "slang-5",
    "slice": "slang",
    "query": "tryna get a podcast off the ground help me",
    "expected": "build"
  },
  {
    "id": "slang-6",
    "slice": "slang",
    "query": "whats better for commuting e bike or scooter",
    "expected": "compare"
  },
  {
    "id": "slang-7",
    "slice": "slang",
    "query": "anything new on the train strike rn",
    "expected": "current"
  },
  {
    "id": "slang-8",
    "slice": "slang",
    "query": "cool pics of abandoned stations",
    "expected": "general"
  },
  {
    "id": "typos-1",
    "slice": "typos",
    "query": "restarant near mee",
    "expected": "local"
  },
  {
    "id": "typos-2",
    "slice": "typos",
    "query": "where to purchse a used monitor",
    "expected": "shopping"
  },
  {
    "id": "typos-3",
    "slice": "typos",
    "query": "wat does photosynthisis mean",
    "expected": "information"
  },
  {
    "id": "typos-4",
    "slice": "typos",
    "query": "opn the official nasa pag",
    "expected": "navigation"
  },
  {
    "id": "typos-5",
    "slice": "typos",
    "query": "help me creat my own magazin",
    "expected": "build"
  },
  {
    "id": "typos-6",
    "slice": "typos",
    "query": "diffrence between lease and loan",
    "expected": "compare"
  },
  {
    "id": "typos-7",
    "slice": "typos",
    "query": "lastest news about the storm",
    "expected": "current"
  },
  {
    "id": "typos-8",
    "slice": "typos",
    "query": "archtecture inspiraton",
    "expected": "general"
  },
  {
    "id": "multilingual-1",
    "slice": "multilingual",
    "query": "¿Dónde hay una farmacia cerca de mí?",
    "expected": "local"
  },
  {
    "id": "multilingual-2",
    "slice": "multilingual",
    "query": "quiero comprar unos auriculares baratos",
    "expected": "shopping"
  },
  {
    "id": "multilingual-3",
    "slice": "multilingual",
    "query": "¿qué significa fotosíntesis?",
    "expected": "information"
  },
  {
    "id": "multilingual-4",
    "slice": "multilingual",
    "query": "abre la página oficial de la NASA",
    "expected": "navigation"
  },
  {
    "id": "multilingual-5",
    "slice": "multilingual",
    "query": "ayúdame a crear mi propio podcast",
    "expected": "build"
  },
  {
    "id": "multilingual-6",
    "slice": "multilingual",
    "query": "¿qué es mejor, tren o autobús?",
    "expected": "compare"
  },
  {
    "id": "multilingual-7",
    "slice": "multilingual",
    "query": "últimas noticias sobre el clima",
    "expected": "current"
  },
  {
    "id": "multilingual-8",
    "slice": "multilingual",
    "query": "fotos de edificios antiguos",
    "expected": "general"
  },
  {
    "id": "multilingual-9",
    "slice": "multilingual",
    "query": "où trouver une boulangerie près de moi",
    "expected": "local"
  },
  {
    "id": "multilingual-10",
    "slice": "multilingual",
    "query": "je veux acheter un ordinateur",
    "expected": "shopping"
  },
  {
    "id": "multilingual-11",
    "slice": "multilingual",
    "query": "quelle est la différence entre louer et acheter",
    "expected": "compare"
  },
  {
    "id": "multilingual-12",
    "slice": "multilingual",
    "query": "actualités du jour sur les trains",
    "expected": "current"
  }
];
function evaluate(rows,topics,aug,prior,fresh,stress){
 const norm=q=>q.toLowerCase().trim().replace(/\s+/g," ");const held=new Set([...prior,...fresh].map(r=>norm(r.query)));const known=new Set(rows.map(r=>norm(r.query)));
 const more=Object.entries(topics).flatMap(([expected,items])=>items.flatMap(item=>aug[expected].map(t=>{let i=0;const val=Array.isArray(item)?item:[item];return{expected,query:t.replace(/\{\}/g,()=>val[i++])}})));
 const added=more.filter(r=>{const n=norm(r.query);if(held.has(n)||known.has(n))return false;known.add(n);return true});
 if(stress.some(r=>known.has(norm(r.query))||held.has(norm(r.query)))||new Set(stress.map(r=>norm(r.query))).size!==stress.length)throw Error("stress overlap");
 const data=[...rows,...added],f=q=>{const t=q.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];return [...t,...t.slice(1).map((w,i)=>t[i]+" "+w),"__start_"+(t[0]||""),"__end_"+(t.at(-1)||"")]};
 const counts=new Map(),totals=new Map(),sizes=new Map(),vocab=new Set();for(const r of data){const k=r.expected;if(!counts.has(k))counts.set(k,new Map());sizes.set(k,(sizes.get(k)||0)+1);for(const x of f(r.query)){vocab.add(x);const m=counts.get(k);m.set(x,(m.get(x)||0)+1);totals.set(k,(totals.get(k)||0)+1)}}
 const gate=q=>/\b(?:help\s+me|help\s+us|i\s+(?:want|need|plan|intend)\s+to|i\s+am\s+planning\s+to|let\s+us|let's|we\s+(?:want|need|plan)\s+to)\b.{0,50}\b(?:build|create|develop|start|launch|open|establish)\b/i.test(q)&&!/\b(?:examples|meaning|cost\s+to|how\s+(?:do|does|did)|not\s+want|don't\s+want)\b/i.test(q);
 // New conservative policy: withhold optional build suggestion on explicit negation, quotation, or mixed intent. Does not block normal search.
 const risky=q=>/\b(?:don't|do not|not|never|no|said|phrase|quote|quoted|but|first|only|just|rather|instead)\b/i.test(q)||/["“”]/.test(q);
 const pred=q=>{const xs=f(q).filter(x=>vocab.has(x));const rank=[...sizes.keys()].map(k=>[k,Math.log(sizes.get(k)/data.length)+xs.reduce((s,x)=>s+Math.log(((counts.get(k).get(x)||0)+1)/(totals.get(k)+vocab.size)),0)]).sort((a,b)=>b[1]-a[1]);const k=rank[0][1]-rank[1][1]<1.25?"general":rank[0][0];return k==="build"&&!gate(q)?"general":k};
 const assess=set=>{const summaries={v2:{correct:0,falseBuild:0,trueBuild:0,bySlice:{}},conservative:{correct:0,falseBuild:0,trueBuild:0,bySlice:{}}},failures=[];for(const r of set){const base=pred(r.query),candidate=base==="build"&&risky(r.query)?"general":base;for(const [name,p] of Object.entries({v2:base,conservative:candidate})){const s=summaries[name],c=s.bySlice[r.slice||"earlier"]??={total:0,correct:0,falseBuild:0};c.total++;if(p===r.expected){s.correct++;c.correct++}if(p==="build"&&r.expected!=="build"){s.falseBuild++;c.falseBuild++}if(p==="build"&&r.expected==="build")s.trueBuild++}if(base!==r.expected||candidate!==r.expected)failures.push({id:r.id,expected:r.expected,v2:base,conservative:candidate});}return {total:set.length,actualBuild:set.filter(r=>r.expected==="build").length,summaries,failures}};
 return{training:data.length,stress:assess(stress),earlier:assess([...prior,...fresh])};
}
console.log(JSON.stringify(evaluate(rows,topics,aug,prior,fresh,stress),null,2));
