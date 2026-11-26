// PERCEPTION offline intent model v0: multinomial naive Bayes trained on synthetic queries.
// No dependencies, user data, network, production integration, or automatic learning.
// Holdouts exclude topics by family, or phrasing templates, or both. Synthetic labels are provisional.
// Accuracy is not proof of live search quality. Never use model output to force a workflow.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cases=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./adaptive-search-intent-corpus.mjs',import.meta.url)),'--cases'],{encoding:'utf8'}));
function baseline(q){q=q.toLowerCase().trim();if(/\b(?:near me|closest|around here|nearby)\b/.test(q)||/\b(?:shops?|stores?|dentist|restaurants?|pharmacy)\s+in\s+\w+/.test(q))return "local";if(/\b(?:start|launch|build|create)\s+(?:a |an |my |the )?(?:\w+\s+){0,3}(?:winery|app|business|company|nonprofit|organization|bakery)\b/.test(q))return "build";if(/\b(?:compare|vs\.?|versus|difference between)\b/.test(q))return "compare";if(/\b(?:website|login|sign in)\b/.test(q)||/^[a-z0-9.-]+\.(?:com|org|gov|net)$/.test(q))return "navigation";if(/\b(?:buy|order|under \$|price)\b/.test(q))return "shopping";if(/\b(?:latest|today|current|yesterday|live)\b/.test(q))return "current";if(/^(?:what|why|how|explain)\b/.test(q))return "information";return "general"}
function features(q){
 const t=q.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
 return [...t,...t.slice(1).map((w,i)=>t[i]+' '+w),'__start_'+(t[0]||''),'__end_'+(t.at(-1)||'')];
}
function train(rows){
 const counts={},sizes={},totals={},vocab=new Set();
 for(const r of rows){const k=r.expected;counts[k]??={};sizes[k]=(sizes[k]||0)+1;totals[k]??=0;
 for(const f of features(r.query)){vocab.add(f);counts[k][f]=(counts[k][f]||0)+1;totals[k]++;}}
 return {counts,sizes,totals,vocab:[...vocab],n:rows.length};
}
function predict(m,q){
 const known=new Set(m.vocab),f=features(q).filter(x=>known.has(x));
 const ranked=Object.keys(m.sizes).map(k=>[k,Math.log(m.sizes[k]/m.n)+f.reduce((s,x)=>s+Math.log(((m.counts[k][x]||0)+1)/(m.totals[k]+known.size)),0)]).sort((a,b)=>b[1]-a[1]);
 const margin=ranked[0][1]-ranked[1][1];
 // General search is safe on uncertain predictions; build suggestions require explicit intent.
 const predicted=margin<1.25?'general':ranked[0][0];
 return {predicted,margin};
}
function evalSet(name,training,test){
 const m=train(training);let correct=0,base=0,falseBuild=0,baseFalseBuild=0,lowMargin=0;
 const byClass={},confusion={};
 for(const r of test){const p=predict(m,r.query),b=baseline(r.query);const k=r.expected;
 byClass[k]??={total:0,modelCorrect:0,baselineCorrect:0};byClass[k].total++;
 if(p.predicted===k){correct++;byClass[k].modelCorrect++}if(b===k){base++;byClass[k].baselineCorrect++}
 if(p.predicted==='build'&&k!=='build')falseBuild++;if(b==='build'&&k!=='build')baseFalseBuild++;
 if(p.margin<1.25)lowMargin++;
 confusion[k]??={};confusion[k][p.predicted]=(confusion[k][p.predicted]||0)+1;
 }
 return {name,training:training.length,test:test.length,correct,baselineCorrect:base,falseBuild,baseFalseBuild,lowMargin,byClass,confusion};
}
const results=[
 evalSet('unseen topics; familiar templates',cases.filter(r=>r.topicFamily<20),cases.filter(r=>r.topicFamily>=20)),
 evalSet('unseen templates; familiar topics',cases.filter(r=>r.templateFamily<4),cases.filter(r=>r.templateFamily===4)),
 evalSet('unseen topics AND templates',cases.filter(r=>r.topicFamily<20&&r.templateFamily<4),cases.filter(r=>r.topicFamily>=20&&r.templateFamily===4))
];
console.log(JSON.stringify({model:'multinomial naive Bayes with unigram/bigram features',marginThreshold:1.25,results},null,2));
