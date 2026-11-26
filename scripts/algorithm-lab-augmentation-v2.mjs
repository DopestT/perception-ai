// PERCEPTION lab: template augmentation; development-only, no runtime integration.
// Both challenge sets are author-related; not independent release evidence. Exact overlap excluded.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const rows=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./adaptive-search-intent-corpus.mjs',import.meta.url)),'--cases'],{encoding:'utf8'}));
const prior=JSON.parse(readFileSync(new URL('./algorithm-lab-intent-challenge.mjs',import.meta.url),'utf8').match(/const fixtures=([\s\S]*?);\nfunction evaluate/)[1]);
const source=readFileSync(new URL('./adaptive-search-intent-corpus.mjs',import.meta.url),'utf8');
const topics=JSON.parse(source.match(/const topics = ([\s\S]*?);\nconst templates/)[1]);
const aug={
  "general": [
    "a beginner's guide to {}",
    "pictures and articles about {}",
    "examples of {}",
    "{} ideas",
    "research on {}"
  ],
  "local": [
    "where is a {} close by",
    "need a {} in town",
    "{} within walking distance",
    "any {} open in my area",
    "where can i find a {} locally",
    "a {} close to me"
  ],
  "shopping": [
    "where can i purchase a {}",
    "looking for a {} to order",
    "a {} delivered to my door",
    "affordable {} for sale",
    "where to get a used {}",
    "find a {} below 100 dollars"
  ],
  "information": [
    "why does {} matter",
    "tell me how {} works",
    "walk me through {}",
    "what does {} mean",
    "how do people learn about {}"
  ],
  "navigation": [
    "take me to the {} portal",
    "send me to the official {} site",
    "open the {} home page",
    "where is the {} login",
    "find the actual {} page"
  ],
  "build": [
    "i want to establish {}",
    "help me develop {} from scratch",
    "we are planning to launch {}",
    "let us create {}",
    "i need your help to start {}"
  ],
  "compare": [
    "is {} better than {}",
    "contrast {} with {}",
    "which should i choose {} or {}",
    "what sets {} apart from {}",
    "advantages of {} rather than {}"
  ],
  "current": [
    "what has changed in {} this week",
    "any new announcements about {}",
    "what is happening with {} right now",
    "new developments regarding {}",
    "recent updates on {}"
  ]
};
const fresh=[
  {
    "id": "fresh-general-1",
    "expected": "general",
    "query": "images of vintage microphones"
  },
  {
    "id": "fresh-general-2",
    "expected": "general",
    "query": "running a nonprofit examples"
  },
  {
    "id": "fresh-general-3",
    "expected": "general",
    "query": "build a bear store history"
  },
  {
    "id": "fresh-general-4",
    "expected": "general",
    "query": "the word migration"
  },
  {
    "id": "fresh-general-5",
    "expected": "general",
    "query": "garden design inspiration"
  },
  {
    "id": "fresh-general-6",
    "expected": "general",
    "query": "books and resources about volcanology"
  },
  {
    "id": "fresh-local-1",
    "expected": "local",
    "query": "shoe repair within walking distance of my hotel"
  },
  {
    "id": "fresh-local-2",
    "expected": "local",
    "query": "any optician close by"
  },
  {
    "id": "fresh-local-3",
    "expected": "local",
    "query": "where is the nearest recycling depot"
  },
  {
    "id": "fresh-local-4",
    "expected": "local",
    "query": "a place to get keys cut in my area"
  },
  {
    "id": "fresh-local-5",
    "expected": "local",
    "query": "need a laundromat in Chicago"
  },
  {
    "id": "fresh-local-6",
    "expected": "local",
    "query": "is there a swimming pool close to me"
  },
  {
    "id": "fresh-shopping-1",
    "expected": "shopping",
    "query": "looking to purchase a rice cooker"
  },
  {
    "id": "fresh-shopping-2",
    "expected": "shopping",
    "query": "a used violin delivered to my door"
  },
  {
    "id": "fresh-shopping-3",
    "expected": "shopping",
    "query": "affordable suitcases for sale"
  },
  {
    "id": "fresh-shopping-4",
    "expected": "shopping",
    "query": "get a refurbished phone shipped"
  },
  {
    "id": "fresh-shopping-5",
    "expected": "shopping",
    "query": "find a humidifier below 75 dollars"
  },
  {
    "id": "fresh-shopping-6",
    "expected": "shopping",
    "query": "where can i order a replacement filter"
  },
  {
    "id": "fresh-information-1",
    "expected": "information",
    "query": "what does a thermostat do"
  },
  {
    "id": "fresh-information-2",
    "expected": "information",
    "query": "why are the oceans salty"
  },
  {
    "id": "fresh-information-3",
    "expected": "information",
    "query": "tell me how an induction stove works"
  },
  {
    "id": "fresh-information-4",
    "expected": "information",
    "query": "how do people start charities"
  },
  {
    "id": "fresh-information-5",
    "expected": "information",
    "query": "what does it cost to launch a satellite"
  },
  {
    "id": "fresh-information-6",
    "expected": "information",
    "query": "explain the science behind fog"
  },
  {
    "id": "fresh-navigation-1",
    "expected": "navigation",
    "query": "send me to the official National Archives portal"
  },
  {
    "id": "fresh-navigation-2",
    "expected": "navigation",
    "query": "open the official Mozilla website"
  },
  {
    "id": "fresh-navigation-3",
    "expected": "navigation",
    "query": "take me to the Social Security login page"
  },
  {
    "id": "fresh-navigation-4",
    "expected": "navigation",
    "query": "official documentation for Rust"
  },
  {
    "id": "fresh-navigation-5",
    "expected": "navigation",
    "query": "where is the federal tax agency's homepage"
  },
  {
    "id": "fresh-navigation-6",
    "expected": "navigation",
    "query": "go to archive.org"
  },
  {
    "id": "fresh-build-1",
    "expected": "build",
    "query": "help me start a neighborhood tool library"
  },
  {
    "id": "fresh-build-2",
    "expected": "build",
    "query": "we plan to create a recipe app"
  },
  {
    "id": "fresh-build-3",
    "expected": "build",
    "query": "i want to establish a small theater company"
  },
  {
    "id": "fresh-build-4",
    "expected": "build",
    "query": "let us build a website for our band"
  },
  {
    "id": "fresh-build-5",
    "expected": "build",
    "query": "help me develop my own board game"
  },
  {
    "id": "fresh-build-6",
    "expected": "build",
    "query": "i need to launch a tutoring business"
  },
  {
    "id": "fresh-compare-1",
    "expected": "compare",
    "query": "is induction better than gas for cooking"
  },
  {
    "id": "fresh-compare-2",
    "expected": "compare",
    "query": "contrast leasing and financing a car"
  },
  {
    "id": "fresh-compare-3",
    "expected": "compare",
    "query": "which should i choose a tent or a camper"
  },
  {
    "id": "fresh-compare-4",
    "expected": "compare",
    "query": "what sets a debit card apart from a credit card"
  },
  {
    "id": "fresh-compare-5",
    "expected": "compare",
    "query": "advantages of buses rather than trains"
  },
  {
    "id": "fresh-compare-6",
    "expected": "compare",
    "query": "how does wool stack up against fleece"
  },
  {
    "id": "fresh-current-1",
    "expected": "current",
    "query": "what changed in aviation this week"
  },
  {
    "id": "fresh-current-2",
    "expected": "current",
    "query": "new announcements about fusion energy"
  },
  {
    "id": "fresh-current-3",
    "expected": "current",
    "query": "what is going on with the ferry service right now"
  },
  {
    "id": "fresh-current-4",
    "expected": "current",
    "query": "recent updates on the drought"
  },
  {
    "id": "fresh-current-5",
    "expected": "current",
    "query": "what news broke about the museum closure"
  },
  {
    "id": "fresh-current-6",
    "expected": "current",
    "query": "latest on the local power outage"
  }
];
function run(rows,topics,aug,prior,fresh){
 const norm=q=>q.toLowerCase().trim().replace(/\s+/g," ");
 const known=new Set(rows.map(r=>norm(r.query)));const held=new Set([...prior,...fresh].map(r=>norm(r.query)));
 if([...held].some(q=>known.has(q)))throw Error("base corpus overlaps challenge");
 const more=Object.entries(topics).flatMap(([expected,items])=>items.flatMap(item=>aug[expected].map(t=>{let i=0;const v=Array.isArray(item)?item:[item];return{expected,query:t.replace(/\{\}/g,()=>v[i++])}})));
 let excluded=0;const added=more.filter(r=>{const n=norm(r.query);if(held.has(n)){excluded++;return false}if(known.has(n))return false;known.add(n);return true});
 const f=q=>{const t=q.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];return [...t,...t.slice(1).map((w,i)=>t[i]+" "+w),"__start_"+(t[0]||""),"__end_"+(t.at(-1)||"")]};
 const fit=data=>{const counts=new Map(),totals=new Map(),sizes=new Map(),vocab=new Set();for(const r of data){const k=r.expected;if(!counts.has(k))counts.set(k,new Map());sizes.set(k,(sizes.get(k)||0)+1);for(const x of f(r.query)){vocab.add(x);const m=counts.get(k);m.set(x,(m.get(x)||0)+1);totals.set(k,(totals.get(k)||0)+1)}}return{counts,totals,sizes,vocab,n:data.length}};
 const gate=q=>/\b(?:help\s+me|help\s+us|i\s+(?:want|need|plan|intend)\s+to|i\s+am\s+planning\s+to|let\s+us|let's|we\s+(?:want|need|plan)\s+to)\b.{0,50}\b(?:build|create|develop|start|launch|open|establish)\b/i.test(q)&&!/\b(?:examples|meaning|cost\s+to|how\s+(?:do|does|did)|not\s+want|don't\s+want)\b/i.test(q);
 const pred=(m,q)=>{const xs=f(q).filter(x=>m.vocab.has(x));const rank=[...m.sizes.keys()].map(k=>[k,Math.log(m.sizes.get(k)/m.n)+xs.reduce((s,x)=>s+Math.log(((m.counts.get(k).get(x)||0)+1)/(m.totals.get(k)+m.vocab.size)),0)]).sort((a,b)=>b[1]-a[1]);const k=rank[0][1]-rank[1][1]<1.25?"general":rank[0][0];return k==="build"&&!gate(q)?"general":k};
 const models={baseline:fit(rows),augmented:fit([...rows,...added])};
 const evaluate=set=>Object.fromEntries(Object.entries(models).map(([name,m])=>{let correct=0,falseBuild=0;const byClass={},failures=[];for(const r of set){const p=pred(m,r.query);const c=byClass[r.expected]??={total:0,correct:0};c.total++;if(p===r.expected){correct++;c.correct++}else failures.push({id:r.id,expected:r.expected,predicted:p});if(p==="build"&&r.expected!=="build")falseBuild++}return[name,{total:set.length,correct,falseBuild,byClass,failures}]}));
 return {originalTraining:rows.length,added:added.length,excludedChallengeOverlap:excluded,totalTraining:rows.length+added.length,prior:evaluate(prior),fresh:evaluate(fresh)};
}
console.log(JSON.stringify(run(rows,topics,aug,prior,fresh),null,2));
