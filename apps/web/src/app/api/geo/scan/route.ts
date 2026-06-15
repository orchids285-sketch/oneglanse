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

	try {
		await ensureClickHouseSchema();

		// Optionally seed tracked prompts from the body (UI / first run).
		const body = (await req.json().catch(() => ({}))) as { prompts?: string[] };
		const seed = Array.isArray(body.prompts)
			? body.prompts.map((p) => String(p).trim()).filter(Boolean)
			: [];
		if (seed.length > 0) {
			await storePromptsForWorkspace({
				prompts: seed,
				workspaceId: workspace.id,
				userId: session.user.id,
			});
		}

		const prompts = await fetchUserPromptsForWorkspace({ workspaceId: workspace.id });
		if (prompts.length === 0) {
			return NextResponse.json({
				ok: false,
				note: "Aucune requête suivie. Ajoute des prompts d'abord.",
			});
		}

		const gen = await generateResponsesViaApi({
			workspaceId: workspace.id,
			userId: session.user.id,
			prompts,
		});

		let analysed = 0;
		try {
			const res = await analysePromptsForWorkspace({
				workspaceId: workspace.id,
				analyzeAll: true,
			});
			analysed = (res as { analysed?: number })?.analysed ?? gen.generated;
		} catch (e) {
			console.error("[geo/scan] analysis error:", (e as Error)?.message);
		}

		return NextResponse.json({
			ok: true,
			prompts: prompts.length,
			generated: gen.generated,
			analysed,
		});
	} catch (e) {
		return NextResponse.json(
			{ ok: false, error: (e as Error)?.message?.slice(0, 200) ?? "scan failed" },
			{ status: 500 },
		);
	}
}
