import { clickhouse } from "@oneglanse/db";
import type { ModelResult, UserPrompt } from "@oneglanse/types";
import { formatDateToClickHouse } from "@oneglanse/utils";
import { v4 as uuidv4 } from "uuid";
import { runAnalysis } from "../analysis/runAnalysis.js";
import { env } from "../env.js";
import { chatgpt } from "../llm/index.js";
import { getWorkspaceById } from "../workspace/index.js";
import { storePromptResponses } from "./storePromptResponses.js";

// The lightweight, browser-free alternative to the Camoufox scraper agent.
// Instead of opening logged-in ChatGPT/Gemini UIs through a residential proxy
// (ThorData/Webshare) + saved auth sessions, we ask the models DIRECTLY via
// their OpenAI-compatible API, and analyse EACH answer inline (rather than a
// workspace-wide backlog scan) so memory stays flat on small dynos.
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
}): Promise<{ generated: number; analysed: number }> {
	const { workspaceId, userId, prompts } = args;
	const promptRunAt = args.promptRunAt ?? new Date().toISOString();
	if (prompts.length === 0) return { generated: 0, analysed: 0 };

	const ws = await getWorkspaceById({ workspaceId });
	const model = env.OPENAI_MODEL ?? "gpt-4.1";
	const runAt = formatDateToClickHouse(new Date(promptRunAt));

	const responseData: Array<{
		userId: string;
		workspaceId: string;
		promptId: string;
		prompt: string;
		response: string;
		sources: [];
	}> = [];
	const analysisRows: Array<Record<string, unknown>> = [];

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
		responseData.push({ userId, workspaceId, promptId: p.id, prompt: p.prompt, response, sources: [] });

		// analyse this answer inline (brand mention / sentiment / rank → JSON)
		try {
			const result = await runAnalysis({
				brandDomain: ws.domain,
				brandName: ws.name,
				response,
				prompt: p.prompt,
			});
			result.metadata = { brandName: ws.name, brandDomain: ws.domain };
			analysisRows.push({
				id: uuidv4(),
				prompt_id: p.id,
				workspace_id: workspaceId,
				prompt: p.prompt,
				user_id: userId,
				model_provider: "chatgpt",
				brand_analysis: JSON.stringify(result),
				prompt_run_at: runAt,
				created_at: runAt,
			});
		} catch (e) {
			console.error("[geo] inline analysis failed:", (e as Error)?.message);
		}
	}

	if (responseData.length === 0) return { generated: 0, analysed: 0 };

	const results = { chatgpt: { status: "fulfilled", data: responseData } } as unknown as ModelResult;
	await storePromptResponses({ results, userId, workspaceId, promptRunAt });

	if (analysisRows.length > 0) {
		await clickhouse.insert({
			table: "analytics.prompt_analysis",
			values: analysisRows,
			format: "JSONEachRow",
		});
	}

	return { generated: responseData.length, analysed: analysisRows.length };
}
