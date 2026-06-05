// TIM-2343: Server-side runner for the per-section self-consistency check.
//
// Lives in a separate file from self-consistency.ts so the pure prompt + parser
// module stays node:test-loadable (no @/ imports, no Anthropic SDK). This file
// holds the Anthropic glue both /generate and /regenerate-all use.

import Anthropic from "@anthropic-ai/sdk";
import { PLATFORM_AI_MODEL } from "@/lib/ai/models";
import {
  SELF_CONSISTENCY_SYSTEM_PROMPT,
  buildSelfConsistencyUserMessage,
  parseSelfConsistencyResponse,
  buildConsistencyFixDirective,
  type SelfConsistencyContradiction,
} from "@/lib/business-plan/self-consistency";

const PROOFREADER_MAX_TOKENS = 800;
const REGEN_MAX_TOKENS_DEFAULT = 1600;

export type { SelfConsistencyContradiction };

// Run the proofreader once. Returns [] on any error so the calling route
// never fails a section because the consistency check itself misbehaved.
export async function runSelfConsistencyCheck(args: {
  client: Anthropic;
  sectionKey: string;
  sectionTitle: string;
  sectionText: string;
}): Promise<SelfConsistencyContradiction[]> {
  const { client, sectionKey, sectionTitle, sectionText } = args;
  // Skip on trivially-short outputs — no contradictions can hide in <80 chars.
  if (!sectionText || sectionText.trim().length < 80) return [];
  try {
    const response = await client.messages.create({
      model: PLATFORM_AI_MODEL,
      max_tokens: PROOFREADER_MAX_TOKENS,
      system: SELF_CONSISTENCY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildSelfConsistencyUserMessage(sectionTitle, sectionText),
        },
      ],
    });
    let raw = "";
    for (const block of response.content) {
      if (block.type === "text") raw += block.text;
    }
    return parseSelfConsistencyResponse(raw, sectionKey);
  } catch {
    // Proofreader is best-effort. Logging would happen here in a richer stack
    // — for now we swallow so the founder still gets their draft.
    return [];
  }
}

// One-shot regeneration that targets a specific contradiction set. Reuses the
// same system + base user message the original generation used, then appends
// the structured fix directive. Returns the regen text (or null on failure)
// without parsing — the caller does normalize/canonicalize/source-marker
// passes itself so the result lands through exactly the same boundary the
// first pass did.
export async function regenerateWithFixDirective(args: {
  client: Anthropic;
  baseSystemPrompt: string;
  baseUserMessage: string;
  contradictions: SelfConsistencyContradiction[];
  maxTokens?: number;
}): Promise<string | null> {
  if (args.contradictions.length === 0) return null;
  const directive = buildConsistencyFixDirective(args.contradictions);
  if (!directive) return null;
  const userMessage = `${args.baseUserMessage}\n\n${directive}`;
  try {
    const response = await args.client.messages.create({
      model: PLATFORM_AI_MODEL,
      max_tokens: args.maxTokens ?? REGEN_MAX_TOKENS_DEFAULT,
      system: args.baseSystemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    let raw = "";
    for (const block of response.content) {
      if (block.type === "text") raw += block.text;
    }
    return raw.trim() || null;
  } catch {
    return null;
  }
}
