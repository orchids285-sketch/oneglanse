// GEO scan trigger — the browser-free, proxy-free "Camoufox alternative".
// Generates AI answers for the workspace's tracked prompts via LLM APIs, stores
// them in ClickHouse, and runs oneglanse's analysis so the dashboard populates.
import { auth } from "@/lib/auth/auth";
import { getWorkspace } from "@/lib/workspace/getWorkspace";
import {
	analysePromptsForWorkspace,
	ensureClickHouseSchema,
	fetchUserPromptsForWorkspace,
	generateResponsesViaApi,
	storePromptsForWorkspace,
} from "@oneglanse/services";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) {
		return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}
	const workspace = await getWorkspace();
	if (!workspace) {
		return NextResponse.json({ ok: false, error: "no workspace" }, { status: 400 });
	}

	const body = (await req.json().catch(() => ({}))) as {
		prompts?: string[];
		analyze?: boolean;
		limit?: number;
	};
	try {
		console.log("[geo/scan] start ws=", workspace.id);
		await ensureClickHouseSchema();
		console.log("[geo/scan] schema-ok");

		const seed = Array.isArray(body.prompts)
			? body.prompts.map((p) => String(p).trim()).filter(Boolean)
			: [];
		if (seed.length > 0) {
			await storePromptsForWorkspace({
				prompts: seed,
				workspaceId: workspace.id,
				userId: session.user.id,
			});
			console.log("[geo/scan] seeded", seed.length);
		}

		const all = await fetchUserPromptsForWorkspace({ workspaceId: workspace.id });
		console.log("[geo/scan] prompts", all.length);
		if (all.length === 0) {
			return NextResponse.json({
				ok: false,
				note: "Aucune requête suivie. Ajoute des prompts d'abord.",
			});
		}
		// keep each request light for small dynos: cap how many we process
		const prompts = all.slice(0, Math.max(1, Math.min(body.limit ?? 3, all.length)));

		const gen = await generateResponsesViaApi({
			workspaceId: workspace.id,
			userId: session.user.id,
			prompts,
		});
		console.log("[geo/scan] generated", gen.generated);

		let analysed = 0;
		// analysis is the heavy step — only run when asked (defaults on)
		if (body.analyze !== false) {
			try {
				await analysePromptsForWorkspace({ workspaceId: workspace.id, batchSize: 10 });
				analysed = gen.generated;
				console.log("[geo/scan] analyzed");
			} catch (e) {
				console.error("[geo/scan] analysis error:", (e as Error)?.message);
			}
		}

		return NextResponse.json({
			ok: true,
			prompts: all.length,
			processed: prompts.length,
			generated: gen.generated,
			analysed,
		});
	} catch (e) {
		console.error("[geo/scan] FATAL:", (e as Error)?.message, (e as Error)?.stack?.slice(0, 300));
		return NextResponse.json(
			{ ok: false, error: (e as Error)?.message?.slice(0, 200) ?? "scan failed" },
			{ status: 500 },
		);
	}
}
