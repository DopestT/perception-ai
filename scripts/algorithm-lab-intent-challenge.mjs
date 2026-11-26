// PERCEPTION Algorithm Lab: manually authored development challenge (not independent release evidence).
// Run: node scripts/algorithm-lab-intent-challenge.mjs
// No user data, providers, production routing, paid API or external dependencies.
// Never tune and certify on this same suite. Build remains an optional suggestion only.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const fixtures=[
  {
    "id": "general-1",
    "expected": "general",
    "query": "orchid care"
  },
  {
    "id": "general-2",
    "expected": "general",
    "query": "jaguar"
  },
  {
    "id": "general-3",
    "expected": "general",
    "query": "the meaning of home"
  },
  {
    "id": "general-4",
    "expected": "general",
    "query": "pictures of old bridges"
  },
  {
    "id": "general-5",
    "expected": "general",
    "query": "resources on starting companies"
  },
  {
    "id": "general-6",
    "expected": "general",
    "query": "app development examples"
  },
  {
    "id": "general-7",
    "expected": "general",
    "query": "books about wine making"
  },
  {
    "id": "general-8",
    "expected": "general",
    "query": "build a bear locations"
  },
  {
    "id": "local-1",
    "expected": "local",
    "query": "where can I get my watch fixed around here"
  },
  {
    "id": "local-2",
    "expected": "local",
    "query": "any place to print a document close by"
  },
  {
    "id": "local-3",
    "expected": "local",
    "query": "need a dentist in Bethesda"
  },
  {
    "id": "local-4",
    "expected": "local",
    "query": "find somewhere to eat within walking distance"
  },
  {
    "id": "local-5",
    "expected": "local",
    "query": "which nearby pharmacy is open"
  },
  {
    "id": "local-6",
    "expected": "local",
    "query": "closest place to donate books"
  },
  {
    "id": "local-7",
    "expected": "local",
    "query": "is there a public pool around here"
  },
  {
    "id": "local-8",
    "expected": "local",
    "query": "coffee spots close to me"
  },
  {
    "id": "shopping-1",
    "expected": "shopping",
    "query": "where can I purchase a telescope"
  },
  {
    "id": "shopping-2",
    "expected": "shopping",
    "query": "need a replacement charger shipped"
  },
  {
    "id": "shopping-3",
    "expected": "shopping",
    "query": "looking to order a sewing machine online"
  },
  {
    "id": "shopping-4",
    "expected": "shopping",
    "query": "affordable headphones for sale"
  },
  {
    "id": "shopping-5",
    "expected": "shopping",
    "query": "show me refurbished tablets I can buy"
  },
  {
    "id": "shopping-6",
    "expected": "shopping",
    "query": "where to purchase a used guitar"
  },
  {
    "id": "shopping-7",
    "expected": "shopping",
    "query": "find a raincoat below 60 dollars"
  },
  {
    "id": "shopping-8",
    "expected": "shopping",
    "query": "shopping for a standing desk"
  },
  {
    "id": "information-1",
    "expected": "information",
    "query": "why does bread go stale"
  },
  {
    "id": "information-2",
    "expected": "information",
    "query": "walk me through how tides happen"
  },
  {
    "id": "information-3",
    "expected": "information",
    "query": "what does DNS mean"
  },
  {
    "id": "information-4",
    "expected": "information",
    "query": "explain why leaves change color"
  },
  {
    "id": "information-5",
    "expected": "information",
    "query": "how do people build apps"
  },
  {
    "id": "information-6",
    "expected": "information",
    "query": "what does it cost to start a winery"
  },
  {
    "id": "information-7",
    "expected": "information",
    "query": "how do I know if a source is credible"
  },
  {
    "id": "information-8",
    "expected": "information",
    "query": "tell me how a heat pump operates"
  },
  {
    "id": "navigation-1",
    "expected": "navigation",
    "query": "take me to the official Smithsonian homepage"
  },
  {
    "id": "navigation-2",
    "expected": "navigation",
    "query": "open wikipedia.org"
  },
  {
    "id": "navigation-3",
    "expected": "navigation",
    "query": "where is the official IRS portal"
  },
  {
    "id": "navigation-4",
    "expected": "navigation",
    "query": "find the actual GitHub sign in page"
  },
  {
    "id": "navigation-5",
    "expected": "navigation",
    "query": "I need the official UNESCO site"
  },
  {
    "id": "navigation-6",
    "expected": "navigation",
    "query": "go to weather.gov"
  },
  {
    "id": "navigation-7",
    "expected": "navigation",
    "query": "send me to the Library of Congress website"
  },
  {
    "id": "navigation-8",
    "expected": "navigation",
    "query": "official Python documentation site"
  },
  {
    "id": "build-1",
    "expected": "build",
    "query": "I need you to help me create a budgeting app"
  },
  {
    "id": "build-2",
    "expected": "build",
    "query": "let us build our own community website"
  },
  {
    "id": "build-3",
    "expected": "build",
    "query": "I want to open a bakery business"
  },
  {
    "id": "build-4",
    "expected": "build",
    "query": "help me launch my own podcast"
  },
  {
    "id": "build-5",
    "expected": "build",
    "query": "I am planning to start a nonprofit"
  },
  {
    "id": "build-6",
    "expected": "build",
    "query": "can you help me develop a tool for teachers"
  },
  {
    "id": "build-7",
    "expected": "build",
    "query": "I want to create my own newsletter"
  },
  {
    "id": "build-8",
    "expected": "build",
    "query": "help me establish a small research lab"
  },
  {
    "id": "compare-1",
    "expected": "compare",
    "query": "is a heat pump better than a furnace"
  },
  {
    "id": "compare-2",
    "expected": "compare",
    "query": "which should I choose, a tablet or a laptop"
  },
  {
    "id": "compare-3",
    "expected": "compare",
    "query": "contrast electric and acoustic guitars"
  },
  {
    "id": "compare-4",
    "expected": "compare",
    "query": "what sets a credit union apart from a bank"
  },
  {
    "id": "compare-5",
    "expected": "compare",
    "query": "are e-bikes or regular bikes better for commuting"
  },
  {
    "id": "compare-6",
    "expected": "compare",
    "query": "advantages of renting rather than owning"
  },
  {
    "id": "compare-7",
    "expected": "compare",
    "query": "how do ceramic pans stack up against steel"
  },
  {
    "id": "compare-8",
    "expected": "compare",
    "query": "difference between a lease and a loan"
  },
  {
    "id": "current-1",
    "expected": "current",
    "query": "what has changed in space exploration this week"
  },
  {
    "id": "current-2",
    "expected": "current",
    "query": "new developments in battery technology"
  },
  {
    "id": "current-3",
    "expected": "current",
    "query": "what is happening with rail strikes right now"
  },
  {
    "id": "current-4",
    "expected": "current",
    "query": "give me recent updates on inflation"
  },
  {
    "id": "current-5",
    "expected": "current",
    "query": "what happened in the election yesterday"
  },
  {
    "id": "current-6",
    "expected": "current",
    "query": "latest on the storm"
  },
  {
    "id": "current-7",
    "expected": "current",
    "query": "are there any new announcements from NASA"
  },
  {
    "id": "current-8",
    "expected": "current",
    "query": "what news broke about the transit system"
  }
];
function evaluate(rows,fixtures){
 const features=q=>{const t=q.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];return [...t,...t.slice(1).map((w,i)=>t[i]+" "+w),"__start_"+(t[0]||""),"__end_"+(t.at(-1)||"")]};
 const counts=new Map(),totals=new Map(),sizes=new Map(),vocab=new Set();
 for(const r of rows){const k=r.expected;if(!counts.has(k))counts.set(k,new Map());sizes.set(k,(sizes.get(k)||0)+1);for(const f of features(r.query)){vocab.add(f);const m=counts.get(k);m.set(f,(m.get(f)||0)+1);totals.set(k,(totals.get(k)||0)+1)}}
 const explicitBuild=q=>/\b(?:help\s+me|help\s+us|i\s+(?:want|need|plan|intend)\s+to|i\s+am\s+planning\s+to|let\s+us|let's|we\s+(?:want|need|plan)\s+to)\b.{0,50}\b(?:build|create|develop|start|launch|open|establish)\b/i.test(q)&&!/\b(?:examples|meaning|cost\s+to|how\s+(?:do|does|did)|not\s+want|don't\s+want)\b/i.test(q);
 const summaries={v0:{correct:0,falseBuild:0,byClass:{}},gated:{correct:0,falseBuild:0,byClass:{}}},failures=[];
 for(const r of fixtures){const f=features(r.query).filter(x=>vocab.has(x));const rank=[...sizes.keys()].map(k=>[k,Math.log(sizes.get(k)/rows.length)+f.reduce((s,x)=>s+Math.log(((counts.get(k).get(x)||0)+1)/(totals.get(k)+vocab.size)),0)]).sort((a,b)=>b[1]-a[1]);const margin=rank[0][1]-rank[1][1];const v0=margin<1.25?"general":rank[0][0];const gated=v0==="build"&&!explicitBuild(r.query)?"general":v0;
 for(const [name,p] of Object.entries({v0,gated})){const s=summaries[name];const c=s.byClass[r.expected]??={total:0,correct:0};c.total++;if(p===r.expected){s.correct++;c.correct++}if(p==="build"&&r.expected!=="build")s.falseBuild++}
 if(v0!==r.expected||gated!==r.expected)failures.push({id:r.id,expected:r.expected,v0,gated,margin:Number(margin.toFixed(3))})}
 return {training:rows.length,challenge:fixtures.length,summaries,failures};
}
const rows=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./adaptive-search-intent-corpus.mjs',import.meta.url)),'--cases'],{encoding:'utf8'}));
assert.equal(rows.length,1000);assert.equal(fixtures.length,64);
const norm=s=>s.toLowerCase().trim();const trainSet=new Set(rows.map(r=>norm(r.query)));
assert.equal(new Set(fixtures.map(r=>norm(r.query))).size,64);
assert.ok(fixtures.every(r=>!trainSet.has(norm(r.query))),'development challenge overlaps training');
console.log(JSON.stringify(evaluate(rows,fixtures),null,2));
