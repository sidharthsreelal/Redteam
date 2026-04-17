const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = Object.fromEntries(envContent.split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));

const MISTRAL_API_KEY = env.MISTRAL_API_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;

const MISTRAL_MODELS = [
  'mistral-small-latest',
  'mistral-medium-latest',
  'mistral-large-latest'
];

const GEMINI_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-1.5-pro',
  'gemini-1.5-flash'
];

const DEVILS_ADVOCATE_SYSTEM = `You are a Devil's Advocate — not a balanced critic, not a helpful advisor. A Devil's Advocate argues the opposite position with total conviction, as if your career depends on being right. You have no interest in being fair. You are not here to acknowledge merit. You are here to dismantle.

YOUR VOICE:
- Write like a senior partner delivering bad news to a junior colleague who wasted months on a bad idea
- Every sentence is a verdict, not an observation
- Use "This will" not "This might." Use "You have ignored" not "It could be worth considering."
- No hedging words: never write "potentially", "could", "might", "perhaps", "it's possible that"
- No balance: never write "while X has merit", "on the other hand", "to be fair"

YOUR ATTACK SHAPE:
Open with the single most lethal flaw — the one that, if true, makes everything else irrelevant.
Second paragraph: attack the assumptions underneath the plan, not the plan itself.
Third paragraph: name the specific type of person or organisation that has tried this before and explain exactly how it ended.
Close with one sentence — brutal, specific, final.

SCOPE BOUNDARY — YOUR TERRITORY:
You attack the PLAN ITSELF — its core premise, its viability, its logic. You focus on WHY this idea is wrong.
Do NOT trace downstream consequences or systems effects — that is the Second-Order Effects framework's job.
Do NOT write a failure narrative — that is the Pre-Mortem's job.
Do NOT build the best version of the idea — that is the Steel Man's job.
Stay in your lane: direct, confrontational attack on the plan's fundamental validity.

OUTPUT RULES:
- Exactly 3 paragraphs. No headers. No bullet points. No numbered lists.
- Do not start with "I", "This", "The", or the name of the concept being attacked.
- Do not end with a question.
- Do not offer a way forward. You are not here to help. You are here to be right.
- Complete every sentence — never cut off mid-thought.`;

const USER_PROMPT = `Argue the exact opposite of this. Total conviction. No mercy.

"""
Let's build a subscription box for premium artisanal ice chunks. Customers will pay $50/month for hand-carved ice from various glaciers around the world, delivered overnight in insulated dry-ice packaging. Our competitive advantage is the storytelling around each glacier and the purity of the ice used for high-end cocktails.
"""

Three paragraphs. Open with the most lethal flaw. No hedging. No balance. Just the case against.`;

async function testMistral(model) {
  const start = Date.now();
  const res = await fetch(`https://api.mistral.ai/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: DEVILS_ADVOCATE_SYSTEM },
        { role: 'user', content: USER_PROMPT },
      ],
      temperature: 0.75,
      max_tokens: 1800,
      top_p: 0.9
    })
  });
  if (!res.ok) {
    throw new Error(`Mistral Error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const dur = Date.now() - start;
  const content = data.choices[0].message.content;
  return { time: dur, content };
}

async function testGemini(model) {
  const start = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: USER_PROMPT }] }],
      system_instruction: { parts: [{ text: DEVILS_ADVOCATE_SYSTEM }] },
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 8192,
        topP: 0.92,
      }
    })
  });
  if (!res.ok) {
    throw new Error(`Gemini Error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const dur = Date.now() - start;
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { time: dur, content };
}

function evaluate(content) {
  let score = 10;
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  
  const rulesBroken = [];
  
  if (lines.length !== 3 && lines.length !== 4) {
    score -= 2;
    rulesBroken.push("Paragraph count was " + lines.length + ", not 3");
  }
  
  if (content.includes('- ') || content.includes('* ') || /\d+\./.test(content)) {
    score -= 3;
    rulesBroken.push("Used bullet points or numbered lists");
  }

  const firstChar = content.trim().charAt(0).toUpperCase() + content.trim().slice(1);
  if (firstChar.startsWith('I ') || firstChar.startsWith('This ') || firstChar.startsWith('The ') || firstChar.startsWith("Let's ")) {
    score -= 1;
    rulesBroken.push("Started with forbidden word.");
  }
  
  if (content.trim().endsWith('?')) {
    score -= 1;
    rulesBroken.push("Ended with a question.");
  }

  const hedging = ['potentially', 'could', 'might', 'perhaps', "it's possible that", 'while X has merit', 'on the other hand', 'to be fair'];
  for (const word of hedging) {
    if (content.toLowerCase().includes(word.toLowerCase())) {
      score -= 2;
      rulesBroken.push("Used hedging word: " + word);
    }
  }

  return { score: Math.max(0, score), rulesBroken };
}

async function main() {
  const results = [];
  
  console.log("Running evaluation...");

  for (const model of MISTRAL_MODELS) {
    try {
      console.log("Testing Mistral model: " + model);
      const res = await testMistral(model);
      const evalRes = evaluate(res.content);
      results.push({ provider: 'Mistral', model, time: res.time, score: evalRes.score, rulesBroken: evalRes.rulesBroken.join(', ') });
    } catch (e) {
      console.error(e.message);
    }
  }

  for (const model of GEMINI_MODELS) {
    try {
      console.log("Testing Gemini model: " + model);
      const res = await testGemini(model);
      const evalRes = evaluate(res.content);
      results.push({ provider: 'Gemini', model, time: res.time, score: evalRes.score, rulesBroken: evalRes.rulesBroken.join(', ') });
    } catch (e) {
      console.error(e.message);
    }
  }
  
  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync('evaluation_results.json', JSON.stringify(results, null, 2));
}

main();
