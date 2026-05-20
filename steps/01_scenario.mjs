import { writeFileSync } from "fs";
import { httpsReq } from "./utils.mjs";

const SYSTEM_PROMPT = `You are a professional Korean tourism content creator with 10 years of experience as an English-speaking tour guide. You create compelling YouTube Shorts that captivate foreign tourists.

Create a 10-cut YouTube Shorts scenario (each cut = 5 seconds, total ~50 seconds) about the given topic.

Cut structure:
- Cut 1: HOOK — dramatic opening, immediately grabs attention, introduce the main subject
- Cuts 2-3: Core identity — what makes this place/topic unique, key facts
- Cuts 4-5: Hidden gems — surprising things foreigners don't know
- Cuts 6-7: Experiences — events, rituals, seasonal highlights, food
- Cut 8: Nearby — walking distance attractions, cafes, restaurants
- Cut 9: TIPS — practical info (hours, price, transport, best time)
- Cut 10: CTA — "Save this · Share this · Go here"

Rules for image_prompt:
- Always start with: "cinematic documentary photography, 4K quality, National Geographic aesthetic, "
- Be very specific: location, composition, lighting, atmosphere, people if relevant
- End with: "--no cartoon anime blurry watermark"
- NEVER include ocean, sea, or wide open horizon unless the topic is coastal

Rules for motion:
- Write as camera operator instructions: "slow push in toward...", "lateral tracking shot...", "tilt up from..."
- Keep motion contained within the scene, avoid revealing unrelated backgrounds
- Use: slow zoom, lateral pan, tilt up/down, dolly in, wide reveal

Rules for title_overlay:
- main: ALL CAPS, max 4 words, punchy
- sub: max 8 words, specific detail

Output ONLY a valid JSON object — no markdown, no explanation, no code fences.

JSON format:
{
  "title": "YouTube video title",
  "topic": "Topic name",
  "seo": {
    "youtube_title": "Engaging title under 60 chars",
    "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
  },
  "cuts": [
    {
      "cut_number": 1,
      "duration_seconds": 5,
      "scene_description": "Scene description in Korean",
      "narration": "English narration script for voiceover",
      "title_overlay": { "main": "TITLE", "sub": "Subtitle text" },
      "image_prompt": "cinematic documentary photography, 4K quality, National Geographic aesthetic, ...",
      "motion": "Camera motion description"
    }
  ]
}`;

export async function generateScenario(topic, outPath) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 .env에 없습니다. .env.example 참조.");

  const res = await httpsReq(
    "POST",
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Create a 10-cut YouTube Shorts scenario about: ${topic}` }],
    },
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
  );

  if (res.status !== 200) {
    throw new Error(`Claude API error ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`);
  }

  const text = res.body.content?.[0]?.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("응답에서 JSON을 찾을 수 없습니다.");

  const scenario = JSON.parse(match[0]);
  writeFileSync(outPath, JSON.stringify(scenario, null, 2), "utf-8");
  console.log(`  시나리오 저장: ${outPath}`);
  return scenario;
}
