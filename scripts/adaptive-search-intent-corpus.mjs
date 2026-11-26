// Offline synthetic expansion of adaptive intent benchmark; NOT independent validation.
// 8 x 25 topic families x 5 query templates = 1000 generated queries. Labels provisional.
// Same baseline as adaptive-search-intent-benchmark.mjs; do not tune and certify on this corpus.
// No user data, provider requests, model training, persistence or live routing.
// Run node scripts/adaptive-search-intent-corpus.mjs; add --cases to emit fixtures.
const topics = {
  "general": [
    "wine",
    "coffee",
    "astronomy",
    "jazz",
    "gardening",
    "bicycles",
    "architecture",
    "climate",
    "history",
    "photography",
    "poetry",
    "chess",
    "space",
    "hiking",
    "painting",
    "cooking",
    "ceramics",
    "sailing",
    "tennis",
    "forests",
    "mathematics",
    "robotics",
    "fashion",
    "literature",
    "music"
  ],
  "local": [
    "bookstore",
    "library",
    "coffee shop",
    "dentist",
    "pharmacy",
    "hardware store",
    "bakery",
    "museum",
    "park",
    "grocery store",
    "flower shop",
    "bike repair shop",
    "post office",
    "shoe repair shop",
    "theater",
    "laundromat",
    "veterinarian",
    "barber",
    "community center",
    "optician",
    "train station",
    "garden center",
    "art gallery",
    "gym",
    "tailor"
  ],
  "shopping": [
    "laptop",
    "camera",
    "desk lamp",
    "monitor",
    "backpack",
    "keyboard",
    "headphones",
    "winter coat",
    "running shoes",
    "water bottle",
    "office chair",
    "phone case",
    "travel bag",
    "toaster",
    "blender",
    "coffee grinder",
    "pencils",
    "notebook",
    "tripod",
    "bike helmet",
    "paint brushes",
    "storage bins",
    "toolbox",
    "flashlight",
    "umbrella"
  ],
  "information": [
    "photosynthesis",
    "gravity",
    "compound interest",
    "solar energy",
    "ocean currents",
    "sourdough fermentation",
    "water cycles",
    "earthquakes",
    "volcanoes",
    "electric motors",
    "batteries",
    "cloud formation",
    "rainbows",
    "language learning",
    "memory",
    "sound waves",
    "optics",
    "ecosystems",
    "recycling",
    "astronomy",
    "encryption",
    "the printing press",
    "the metric system",
    "continental drift",
    "magnetism"
  ],
  "navigation": [
    "NASA",
    "Wikipedia",
    "GitHub",
    "Gmail",
    "Library of Congress",
    "Smithsonian",
    "US Census Bureau",
    "IRS",
    "NOAA",
    "National Park Service",
    "CDC",
    "WHO",
    "UNESCO",
    "OpenStreetMap",
    "Project Gutenberg",
    "Mozilla",
    "Python",
    "Wikimedia",
    "Khan Academy",
    "Internet Archive",
    "USPS",
    "USGS",
    "European Space Agency",
    "National Archives",
    "Royal Society"
  ],
  "build": [
    "a winery",
    "a mobile app",
    "a bakery",
    "a nonprofit organization",
    "a software company",
    "a podcast",
    "a community garden",
    "a tutoring service",
    "a design studio",
    "a bookstore",
    "a repair business",
    "a local newsletter",
    "a music festival",
    "a ceramics workshop",
    "a research lab",
    "a photography business",
    "a charity",
    "a bicycle shop",
    "a digital magazine",
    "a game",
    "a public forum",
    "a library program",
    "a meal planning app",
    "an educational website",
    "a small business"
  ],
  "compare": [
    [
      "red wine",
      "white wine"
    ],
    [
      "laptop",
      "desktop"
    ],
    [
      "Python",
      "JavaScript"
    ],
    [
      "electric cars",
      "hybrid cars"
    ],
    [
      "renting",
      "buying"
    ],
    [
      "tea",
      "coffee"
    ],
    [
      "solar",
      "wind power"
    ],
    [
      "film",
      "digital photography"
    ],
    [
      "train",
      "bus"
    ],
    [
      "city",
      "suburban living"
    ],
    [
      "running",
      "cycling"
    ],
    [
      "hardwood",
      "laminate"
    ],
    [
      "LCD",
      "OLED"
    ],
    [
      "SSD",
      "HDD"
    ],
    [
      "Android",
      "iOS"
    ],
    [
      "Mac",
      "Windows"
    ],
    [
      "public",
      "private transit"
    ],
    [
      "steel",
      "aluminum"
    ],
    [
      "books",
      "audiobooks"
    ],
    [
      "cotton",
      "linen"
    ],
    [
      "tablet",
      "laptop"
    ],
    [
      "manual",
      "automatic transmission"
    ],
    [
      "freelancing",
      "employment"
    ],
    [
      "online",
      "in-person classes"
    ],
    [
      "ceramic",
      "cast iron cookware"
    ]
  ],
  "current": [
    "NASA",
    "local weather",
    "public transit",
    "space launches",
    "interest rates",
    "technology",
    "science",
    "education",
    "renewable energy",
    "climate policy",
    "the stock market",
    "concert schedules",
    "film releases",
    "rail service",
    "air travel",
    "public health",
    "sports",
    "local road closures",
    "museum exhibitions",
    "the economy",
    "astronomy",
    "consumer prices",
    "election results",
    "the legislature",
    "international news"
  ]
};
const templates = {
  "general": [
    "{}",
    "{} topics",
    "{} resources",
    "{} links",
    "{} browsing"
  ],
  "local": [
    "{} near me",
    "closest {}",
    "{} around here",
    "find a nearby {}",
    "{} open now"
  ],
  "shopping": [
    "buy {}",
    "{} for sale online",
    "shop for {}",
    "best price for {}",
    "where to order {} online"
  ],
  "information": [
    "what is {}",
    "explain {}",
    "how does {} work",
    "teach me about {}",
    "what should I know about {}"
  ],
  "navigation": [
    "{} official website",
    "go to {}",
    "{} homepage",
    "open the {} site",
    "find the official {} page"
  ],
  "build": [
    "I want to start {}",
    "help me build {}",
    "I plan to launch {}",
    "help me create {}",
    "I want to develop {}"
  ],
  "compare": [
    "compare {} and {}",
    "{} vs {}",
    "difference between {} and {}",
    "pros and cons of {} versus {}",
    "which is better: {} or {}"
  ],
  "current": [
    "latest {} updates",
    "{} news today",
    "current {} information",
    "what happened yesterday in {}",
    "recent developments in {}"
  ]
};
function makeCases(){return Object.entries(topics).flatMap(([expected,items])=>items.flatMap((item,i)=>templates[expected].map((t,j)=>{const values=Array.isArray(item)?item:[item];let n=0;return {id:expected+"-"+String(i*5+j+1).padStart(3,"0"),query:t.replace(/\{\}/g,()=>values[n++]),expected,templateFamily:j,topicFamily:i};})))}
function baseline(q){q=q.toLowerCase().trim();if(/\b(?:near me|closest|around here|nearby)\b/.test(q)||/\b(?:shops?|stores?|dentist|restaurants?|pharmacy)\s+in\s+\w+/.test(q))return "local";if(/\b(?:start|launch|build|create)\s+(?:a |an |my |the )?(?:\w+\s+){0,3}(?:winery|app|business|company|nonprofit|organization|bakery)\b/.test(q))return "build";if(/\b(?:compare|vs\.?|versus|difference between)\b/.test(q))return "compare";if(/\b(?:website|login|sign in)\b/.test(q)||/^[a-z0-9.-]+\.(?:com|org|gov|net)$/.test(q))return "navigation";if(/\b(?:buy|order|under \$|price)\b/.test(q))return "shopping";if(/\b(?:latest|today|current|yesterday|live)\b/.test(q))return "current";if(/^(?:what|why|how|explain)\b/.test(q))return "information";return "general"}
function summarize(cases){return Object.fromEntries(Object.keys(topics).map(k=>{let rows=cases.filter(c=>c.expected===k);return [k,{total:rows.length,correct:rows.filter(c=>baseline(c.query)===k).length}]}))}
const cases = makeCases();
if(cases.length!==1000 || new Set(cases.map(c=>c.query.toLowerCase())).size!==1000) throw Error("bad corpus");
const scores=summarize(cases);
console.log(JSON.stringify(process.argv.includes("--cases")?cases:{total:cases.length,correct:Object.values(scores).reduce((a,b)=>a+b.correct,0),scores,falseBuild:cases.filter(c=>c.expected!=="build"&&baseline(c.query)==="build").length},null,2));
