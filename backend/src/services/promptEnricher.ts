import OpenAI from "openai";
import { config } from "../../config";

const sdkBaseURL = (() => {
  const u = config.aiSdk.baseUrl.replace(/\/+$/, "");
  return /\/(v\d+)$/.test(u) ? u : `${u}/v1`;
})();

const client = new OpenAI({
  baseURL: sdkBaseURL,
  apiKey: config.aiSdk.apiKey,
});

const SYSTEM_PROMPT = `You are a prompt enhancer for an AI web app generator. The user provides a brief description of what they want to build. Your job is to expand it into a detailed, specific, actionable project description that another AI can use as a build brief.

Requirements for the expanded prompt:
- Include specific UI elements, features, and design choices.
- Be concrete, not abstract (e.g. name actual components, screens, and interactions).
- Mention data flow where relevant (what the user types, what gets stored, what gets shown).
- Keep it 1-3 short paragraphs.
- Match the language of the user's input.
- Return ONLY the expanded prompt. No preamble, no explanation, no quotes, no markdown fences.`;

export interface EnrichOptions {
  prompt: string;
  template: string;
  model?: string;
}

export async function enrichPrompt({
  prompt,
  template,
  model,
}: EnrichOptions): Promise<string> {
  const userMessage = `Chosen tech stack / template: ${template}\n\nUser's brief: ${prompt}`;

  const response = await client.chat.completions.create({
    model: model ?? config.aiSdk.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  // Strip chain-of-thought blocks that reasoning models (DeepSeek R1, etc.) emit.
  // Anything inside <think>...</think> (including multiline) is dropped.
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!cleaned) {
    throw new Error("AI returned an empty response");
  }
  return cleaned;
}
