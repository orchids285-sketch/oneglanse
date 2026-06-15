import type { ModelResult, UserPrompt } from "@oneglanse/types";
import { env } from "../env.js";
import { chatgpt } from "../llm/index.js";
import { storePromptResponses } from "./storePromptResponses.js";

// The lightweight, browser-free alternative to the Camoufox scraper agent.
// Instead of opening logged-in ChatGPT/Gemini UIs through a residential proxy
// (ThorData/Webshare) + saved auth sessions, we ask the models DIRECTLY via
// their OpenAI-compatible API. No browser, no proxy, no logins — just API calls.
// Writes the answers to ClickHouse as analytics.prompt_responses (provider
// "chatgpt"), which oneglanse's existing analysis pipeline then scores.
const SYS =
	"You are a helpful AI assistant answering a user's question about which " +
	"products / tools / services to use. Answer naturally and specifically, like " +
	"ChatGPT would for a real user: name the real products you'd actually " +
	"recommend, best first, with a short reason each. Plain text, no markdown.";

export async function generateResponsesViaApi(args: {
	workspaceId: string;
	userId: string;
	prompts: UserPrompt[];
	promptRunAt?: string;
}): Promise<{ generated: number }> {
	const { workspaceId, userId, prompts } = args;
	const promptRunAt = args.promptRunAt ?? new Date().toISOString();
	if (prompts.length === 0) return { generated: 0 };

	const model = env.OPENAI_MODEL ?? "gpt-4.1";
	const data: Array<{
		userId: string;
		workspaceId: string;
		promptId: string;
		prompt: string;
		response: string;
		sources: [];
	}> = [];

	for (const p of prompts) {
		let response = "";
		try {
			const r = await chatgpt.chat.completions.create({
				model,
				temperature: 0.7,
				messages: [
					{ role: "system", content: SYS },
					{ role: "user", content: p.prompt },
				],
			});
			response = r.choices[0]?.message?.content?.trim() ?? "";
		} catch {
			response = "";
		}
		if (!response) continue;
		data.push({ userId, workspaceId, promptId: p.id, prompt: p.prompt, response, sources: [] });
	}

	if (data.length === 0) return { generated: 0 };

	// Only the providers present are written (storePromptResponses iterates keys).
	const results = { chatgpt: { status: "fulfilled", data } } as unknown as ModelResult;
	await storePromptResponses({ results, userId, workspaceId, promptRunAt });
	return { generated: data.length };
}
