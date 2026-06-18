const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VOICE_PROFILES_PATH = path.resolve(__dirname, '../data/voiceProfiles.json');

function loadVoiceProfiles() {
  try {
    return JSON.parse(fs.readFileSync(VOICE_PROFILES_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveVoiceProfiles(profiles) {
  fs.mkdirSync(path.dirname(VOICE_PROFILES_PATH), { recursive: true });
  fs.writeFileSync(VOICE_PROFILES_PATH, JSON.stringify(profiles, null, 2));
}

const STYLE_TEMPLATES = {
  documentary_explainer: {
    name: 'Documentary Explainer',
    structure: 'Hook → Context → Hidden mechanism → Escalation → Consequence → Final lesson',
    prompt: 'Structure this as a documentary explainer: open with a big question or contradiction, provide context, reveal the hidden mechanism, escalate the stakes, show the consequence, land on a lesson that reframes how the viewer sees the world.'
  },
  rise_and_fall: {
    name: 'Rise & Fall',
    structure: 'Peak moment → Origin → Rapid rise → Fatal flaw → Collapse → Aftermath',
    prompt: 'Structure this as a rise and fall narrative: open at the peak, flash back to origins, build the rise with momentum, reveal the fatal flaw, dramatize the collapse, show the aftermath and what it means.'
  },
  business_model: {
    name: 'Business Model Breakdown',
    structure: 'What they sell → How they acquire users → How they monetize → Cost structure → Weakness',
    prompt: 'Structure this as a business model breakdown: explain what the company appears to sell, reveal how they actually acquire customers, expose the real monetization mechanism, examine the cost structure, and identify the core weakness or risk.'
  },
  hidden_system: {
    name: 'Hidden System',
    structure: 'Everyday experience → Hidden system → Incentives → Winners and losers → Bigger truth',
    prompt: 'Structure this as a hidden system reveal: start with a relatable everyday experience, expose the hidden system operating beneath it, explain the incentives driving it, identify who wins and who loses, land on a bigger truth about how power or money actually works.'
  },
  investigative: {
    name: 'Investigative / Scandal',
    structure: 'Suspicious claim → Evidence → Timeline → Contradictions → Reveal → Judgment',
    prompt: 'Structure this as an investigative breakdown: open with a suspicious claim or anomaly, build the evidence trail, reconstruct the timeline, surface the contradictions, deliver the reveal, and render a final judgment on what it means.'
  },
  contrarian: {
    name: 'Contrarian Argument',
    structure: 'Popular belief → Disagreement → Proof → Examples → New perspective',
    prompt: 'Structure this as a contrarian argument: state the popular belief clearly, make the disagreement early and sharply, build the proof methodically, use concrete examples, and land on a new perspective the viewer will want to share.'
  },
  case_study: {
    name: 'Case Study',
    structure: 'Company/person → Problem → Strategy → Execution → Result → Lessons',
    prompt: 'Structure this as a case study: introduce the subject and the problem they faced, reveal the strategy they chose, show the execution in detail, present the result, and extract transferable lessons the viewer can apply.'
  },
  founder_psychology: {
    name: 'Founder Psychology',
    structure: 'Founder belief → Obsession → Risk → Conflict → Breakthrough or downfall',
    prompt: 'Structure this as a founder psychology documentary: reveal the core belief or worldview driving this person, show the obsession it created, dramatize the risks they took, explore the conflicts it caused, and reach a breakthrough or downfall that validates or destroys their belief.'
  }
};

const TARGET_LENGTHS = {
  8:  { words: 1200, scenes: '12-15' },
  12: { words: 1800, scenes: '18-22' },
  20: { words: 3000, scenes: '28-35' }
};

async function claudeCall(systemPrompt, userPrompt, maxTokens = 2000) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });
  return response.content[0].text;
}

async function researchPass(topic, onProgress) {
  onProgress({ pass: 'research', status: 'running', message: 'Researching real facts and events...' });

  const system = `You are a documentary researcher. Your job is to gather and organize real, specific, verifiable facts about a topic for use in a YouTube documentary script.

Output a structured research brief with these sections:
1. KEY FACTS — specific numbers, dates, figures, statistics
2. KEY PEOPLE — real names, roles, what they did
3. KEY EVENTS — specific events with dates and locations
4. KEY QUOTES — real documented quotes from real people (only include if genuinely documented)
5. TIMELINE — chronological sequence of the most important moments
6. CONTRADICTIONS & TENSIONS — what is surprising, counterintuitive, or contradictory about this topic
7. BEST STORY ANGLES — 4 distinct angles for a documentary about this topic, each as a one-sentence pitch

Be specific. Use real names, real years, real places, real numbers. Never invent facts. If uncertain, omit.`;

  const result = await claudeCall(system, `Research topic for YouTube documentary: "${topic}"`, 3000);
  onProgress({ pass: 'research', status: 'complete', data: result });
  return result;
}

async function anglesPass(topic, styleTemplate, researchBrief, onProgress) {
  onProgress({ pass: 'angles', status: 'running', message: 'Generating story angles...' });

  const template = STYLE_TEMPLATES[styleTemplate];
  const system = `You are a YouTube documentary director. Generate exactly 4 distinct story angles for a documentary about the given topic, using the ${template.name} format.

Each angle must:
- Have a working title (compelling, specific, YouTube-worthy)
- Have a one-sentence core contradiction or hook
- Have a 2-sentence description of what the documentary would cover
- Specify the emotional journey (e.g. "curiosity → shock → understanding")

Return ONLY valid JSON in this exact format:
{
  "angles": [
    {
      "id": 1,
      "title": "...",
      "hook": "...",
      "description": "...",
      "emotional_journey": "..."
    }
  ]
}`;

  const result = await claudeCall(system, `Topic: "${topic}"\n\nResearch brief:\n${researchBrief}`, 1500);

  let angles;
  try {
    const clean = result.replace(/```json|```/g, '').trim();
    angles = JSON.parse(clean);
  } catch {
    angles = { angles: [] };
  }

  onProgress({ pass: 'angles', status: 'complete', data: angles });
  return angles;
}

async function structurePass(topic, styleTemplate, chosenAngle, researchBrief, targetLength, onProgress) {
  onProgress({ pass: 'structure', status: 'running', message: 'Building story structure...' });

  const template = STYLE_TEMPLATES[styleTemplate];
  const lengthConfig = TARGET_LENGTHS[targetLength];

  const system = `You are a documentary story architect. Create a detailed scene-by-scene structure for a ${targetLength}-minute YouTube documentary.

Structure format: ${template.structure}
Structural guidance: ${template.prompt}

Output a numbered list of sections. Each section must have:
- Section title
- Emotional beat (what the viewer feels)
- Key content (what is covered, with specific facts from the research)
- Estimated duration in seconds
- Transition note (how this connects to the next section)

Total sections should add up to approximately ${targetLength} minutes. Use ${lengthConfig.scenes} sections.`;

  const userPrompt = `Topic: "${topic}"
Chosen angle: "${chosenAngle.title}" — ${chosenAngle.hook}
Style: ${template.name}
Research brief:\n${researchBrief}`;

  const result = await claudeCall(system, userPrompt, 2500);
  onProgress({ pass: 'structure', status: 'complete', data: result });
  return result;
}

async function scriptPass(topic, styleTemplate, chosenAngle, researchBrief, structure, targetLength, voiceProfile, onProgress) {
  onProgress({ pass: 'script', status: 'running', message: 'Writing full script draft...' });

  const template = STYLE_TEMPLATES[styleTemplate];
  const lengthConfig = TARGET_LENGTHS[targetLength];

  let voiceInstructions = `Write in the style of MagnatesMedia and Wendover Productions: dark, clinical, investigative tone. Short punchy sentences mixed with longer explanatory ones. Present tense narration. No filler phrases. Every sentence must either raise a question or answer the last one.`;

  if (voiceProfile) {
    voiceInstructions = `Write in this specific channel voice:\n${voiceProfile.fingerprint}\n\nMaintain this voice consistently throughout.`;
  }

  const system = `You are writing a ${targetLength}-minute YouTube documentary script.

VOICE: ${voiceInstructions}

RULES:
- Every fact must come from the research brief. Never invent.
- Use real names, real dates, real places, real numbers.
- Short paragraphs. Each paragraph = one scene's narration (5-15 seconds of speech).
- No headers or section titles in the output — just the flowing script.
- Open with the hook immediately. No "In this video" or "Today we're going to."
- Each scene transition must feel earned, not announced.
- Target approximately ${lengthConfig.words} words total.

Write the complete script now. Start immediately with the opening line. No preamble.`;

  const userPrompt = `Topic: "${topic}"
Angle: "${chosenAngle.title}" — ${chosenAngle.hook}
Style structure: ${template.structure}

Story structure:
${structure}

Research brief:
${researchBrief}`;

  const result = await claudeCall(system, userPrompt, 4000);
  onProgress({ pass: 'script', status: 'complete', data: result });
  return result;
}

async function retentionPass(script, targetLength, onProgress) {
  onProgress({ pass: 'retention', status: 'running', message: 'Improving pacing and retention...' });

  const system = `You are a YouTube retention specialist. Improve this documentary script for maximum viewer retention.

Apply these improvements:
1. OPEN LOOPS — every 45-60 seconds of narration (roughly every 4-5 paragraphs), plant a question that won't be answered for at least 30 more seconds
2. PATTERN INTERRUPTS — add a surprising reversal or reframe at least once every 2 minutes
3. STAKES — ensure the viewer always knows what is at risk
4. MICRO-HOOKS — the last sentence of each section should make the viewer need to hear the next one
5. PACING — vary sentence length. After 3+ long explanatory sentences, insert 1-2 very short punchy ones.

Return the complete improved script. Preserve all facts exactly. Do not add new facts. Only improve the writing and structure for retention.`;

  const result = await claudeCall(system, `Improve this ${targetLength}-minute script:\n\n${script}`, 4500);
  onProgress({ pass: 'retention', status: 'complete', data: result });
  return result;
}

async function humanizationPass(script, voiceProfile, onProgress) {
  onProgress({ pass: 'humanization', status: 'running', message: 'Final polish and humanization...' });

  let voiceNote = 'Remove all AI writing patterns. Make it sound like a thoughtful human documentary narrator wrote this after months of research.';
  if (voiceProfile) {
    voiceNote = `Remove all AI writing patterns. Make this sound exactly like the channel voice profile: ${voiceProfile.fingerprint.substring(0, 500)}...`;
  }

  const system = `You are a script editor doing a final humanization pass.

${voiceNote}

Remove or replace:
- "It's worth noting that..."
- "Interestingly..."
- "This is important because..."
- "In other words..."
- "At the end of the day..."
- Any phrase that sounds like an AI summarizing
- Any passive voice that weakens impact
- Any sentence that tells the viewer how to feel instead of making them feel it

Also ensure:
- The opening line is the strongest possible hook — if it isn't, rewrite it
- The closing line lands with weight — a single powerful statement, not a summary
- The script flows as natural spoken narration, not written prose

Return the complete final script only. No commentary.`;

  const result = await claudeCall(system, script, 4500);
  onProgress({ pass: 'humanization', status: 'complete', data: result });
  return result;
}

async function analyzeVoiceProfile(name, transcripts) {
  const system = `You are a writing style analyst. Analyze these video transcripts and create a detailed writing style fingerprint.

The fingerprint must capture:
1. SENTENCE RHYTHM — average sentence length, variation pattern, use of fragments
2. VOCABULARY LEVEL — word choices, technical vs accessible, formality level
3. TONE MARKERS — specific phrases, words, or patterns unique to this voice
4. STRUCTURAL PATTERNS — how sections begin and end, transition phrases used
5. PACING STYLE — how fast information is delivered, use of pauses and short statements
6. EMOTIONAL REGISTER — how emotion is conveyed (subtly vs explicitly)
7. SIGNATURE MOVES — recurring techniques (rhetorical questions, rule of three, specific openings)

Write this as a detailed instruction set that another writer could follow to match this voice exactly. Be specific and actionable, not vague.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: `Analyze these transcripts and create a voice fingerprint:\n\n${transcripts.join('\n\n---\n\n')}` }]
  });

  const fingerprint = response.content[0].text;
  const profiles = loadVoiceProfiles();
  const newProfile = {
    id: `vp_${Date.now()}`,
    name,
    fingerprint,
    createdAt: new Date().toISOString(),
    transcriptCount: transcripts.length
  };
  profiles.push(newProfile);
  saveVoiceProfiles(profiles);
  return newProfile;
}

module.exports = {
  researchPass,
  anglesPass,
  structurePass,
  scriptPass,
  retentionPass,
  humanizationPass,
  analyzeVoiceProfile,
  loadVoiceProfiles,
  saveVoiceProfiles,
  STYLE_TEMPLATES
};
