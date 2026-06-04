const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are a Remotion component generator. Generate a single self-contained React/Remotion JSX component for a documentary video scene. The component must:
- Use useCurrentFrame, useVideoConfig, interpolate, spring from 'remotion'
- Match the scene mood and content from the script excerpt
- Be one of these types based on the content: AnimatedCounter (for numbers/stats), TimelineBar (for events/history), ComparisonChart (for comparisons), QuoteCard (for key statements), MapHighlight (for geography), or TitleCard (for transitions)
- Use the dark cinematic colour palette: background #0a0a0a, text #f0f0f0, accent #3b82f6
- Be 150-300 frames at 30fps
- Export as default function SceneComponent()
Return ONLY the JSX code, no explanation, no markdown fences.`;

router.post('/', async (req, res) => {
  const { scene_id, script_excerpt, mood, shot_type } = req.body;

  if (!scene_id || !script_excerpt) {
    return res.status(400).json({ error: 'scene_id and script_excerpt are required' });
  }

  const client = new Anthropic();

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Scene ID: ${scene_id}\nScript excerpt: ${script_excerpt}\nMood: ${mood || 'neutral'}\nShot type: ${shot_type || 'motion_graphic'}\n\nGenerate the Remotion component for this scene.`,
      }],
    });

    let component_code = message.content[0].text.trim();

    // Strip markdown fences if Claude added them despite instructions
    component_code = component_code
      .replace(/^```(?:jsx?|javascript|tsx?)?\n?/im, '')
      .replace(/\n?```\s*$/im, '')
      .trim();

    console.log(`[motion] scene ${scene_id} component generated (${component_code.length} chars)`);
    res.json({ scene_id, component_code });
  } catch (err) {
    console.error('[motion] Claude error:', err.message);
    res.status(500).json({ error: `Component generation failed: ${err.message}` });
  }
});

module.exports = router;
