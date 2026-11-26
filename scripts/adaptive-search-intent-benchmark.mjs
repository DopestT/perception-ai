// PERCEPTION adaptive SEARCH research v0; offline only, no network or model calls.
// Synthetic English seed and challenge cases; authored together, NOT independent test data.
// Intent is separate from topic. Always retain ordinary results; low confidence defaults to general.
// Never use this baseline to force auth, purchase, workflow, or project creation.
// Proposed next: independently labeled multilingual and paraphrase holdout, confusion matrix,
// user correction and top-5 relevance checks, and provider-backed pagination.
// Run: node scripts/adaptive-search-intent-benchmark.mjs
const seed = [
  [
    "wine",
    "general"
  ],
  [
    "solar panels",
    "general"
  ],
  [
    "wine shops near me",
    "local"
  ],
  [
    "dentist in Baltimore",
    "local"
  ],
  [
    "buy a laptop",
    "shopping"
  ],
  [
    "running shoes under $100",
    "shopping"
  ],
  [
    "what wine goes with salmon",
    "information"
  ],
  [
    "how does solar power work",
    "information"
  ],
  [
    "NASA website",
    "navigation"
  ],
  [
    "GitHub login",
    "navigation"
  ],
  [
    "I want to start a winery",
    "build"
  ],
  [
    "build a budgeting app",
    "build"
  ],
  [
    "compare iPhone and Android",
    "compare"
  ],
  [
    "Mac vs PC",
    "compare"
  ],
  [
    "latest NASA news",
    "current"
  ],
  [
    "weather today",
    "current"
  ]
];
const challenge = [
  [
    "coffee",
    "general"
  ],
  [
    "wine",
    "general"
  ],
  [
    "electric cars",
    "general"
  ],
  [
    "wine business",
    "general"
  ],
  [
    "Apple",
    "general"
  ],
  [
    "where can I get wine near me",
    "local"
  ],
  [
    "coffee shops in Bethesda",
    "local"
  ],
  [
    "closest hardware store",
    "local"
  ],
  [
    "restaurants around here",
    "local"
  ],
  [
    "pharmacy open now",
    "local"
  ],
  [
    "buy a camera",
    "shopping"
  ],
  [
    "laptops under $800",
    "shopping"
  ],
  [
    "where to order flowers online",
    "shopping"
  ],
  [
    "best price for a monitor",
    "shopping"
  ],
  [
    "replacement charger for my laptop",
    "shopping"
  ],
  [
    "what wine goes with salmon",
    "information"
  ],
  [
    "why is the sky blue",
    "information"
  ],
  [
    "explain compound interest",
    "information"
  ],
  [
    "how to open a bottle of wine",
    "information"
  ],
  [
    "wine for dinner",
    "information"
  ],
  [
    "NASA official website",
    "navigation"
  ],
  [
    "Gmail login",
    "navigation"
  ],
  [
    "go to Wikipedia",
    "navigation"
  ],
  [
    "github.com",
    "navigation"
  ],
  [
    "IRS forms page",
    "navigation"
  ],
  [
    "I want to start a winery",
    "build"
  ],
  [
    "launch a mobile app",
    "build"
  ],
  [
    "help me open a bakery",
    "build"
  ],
  [
    "create a nonprofit organization",
    "build"
  ],
  [
    "turn my idea into a business",
    "build"
  ],
  [
    "compare electric cars",
    "compare"
  ],
  [
    "Mac vs Windows",
    "compare"
  ],
  [
    "difference between red and white wine",
    "compare"
  ],
  [
    "which is better for me, Python or JavaScript",
    "compare"
  ],
  [
    "pros and cons of leasing a car",
    "compare"
  ],
  [
    "latest NASA updates",
    "current"
  ],
  [
    "news today",
    "current"
  ],
  [
    "current interest rates",
    "current"
  ],
  [
    "what happened yesterday in Congress",
    "current"
  ],
  [
    "live election results",
    "current"
  ]
];
function classify(query) {
 const q=query.toLowerCase().trim();
 if (/\b(?:near me|closest|around here|nearby)\b/.test(q)||/\b(?:shops?|stores?|dentist|restaurants?|pharmacy)\s+in\s+\w+/.test(q))return "local";
 if (/\b(?:start|launch|build|create)\s+(?:a |an |my |the )?(?:\w+\s+){0,3}(?:winery|app|business|company|nonprofit|organization|bakery)\b/.test(q))return "build";
 if (/\b(?:compare|vs\.?|versus|difference between)\b/.test(q))return "compare";
 if (/\b(?:website|login|sign in)\b/.test(q)||/^[a-z0-9.-]+\.(?:com|org|gov|net)$/.test(q))return "navigation";
 if (/\b(?:buy|order|under \$|price)\b/.test(q))return "shopping";
 if (/\b(?:latest|today|current|yesterday|live)\b/.test(q))return "current";
 if (/^(?:what|why|how|explain)\b/.test(q))return "information";
 return "general";
}
function score(cases){const rows=cases.map(([q,expected])=>({q,expected,actual:classify(q)}));return {total:rows.length,correct:rows.filter(r=>r.actual===r.expected).length,incorrect:rows.filter(r=>r.actual!==r.expected),falseBuild:rows.filter(r=>r.actual==="build"&&r.expected!=="build").length};}
console.log(JSON.stringify({seed:score(seed),challenge:score(challenge)},null,2));
