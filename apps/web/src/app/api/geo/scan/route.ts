// GEO scan trigger — the browser-free, proxy-free "Camoufox alternative".
// Generates AI answers for the workspace's tracked prompts via LLM APIs, stores
// them in ClickHouse, and runs oneglanse's analysis so the dashboard populates.
import { auth } from "@/lib/auth/auth";
import { getWorkspace } from "@/lib/workspace/getWorkspace";
import {
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
		offset?: number;
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
				note: "No tracked queries yet. Add prompts first.",
			});
		}
		// keep each request light for small (512MB) dynos: process a small window.
		// The UI loops offset 0,1,2,… (limit 1) so the dyno never does too much
		// generation+analysis in a single request (2+ prompts OOM-crashes it).
		const offset = Math.max(0, body.offset ?? 0);
		const limit = Math.max(1, Math.min(body.limit ?? 1, 2));
		const prompts = all.slice(offset, offset + limit);
		if (prompts.length === 0) {
			return NextResponse.json({ ok: true, total: all.length, processed: 0, done: true });
		}

		// generate + analyse inline (one prompt's work — flat memory on small dynos)
		const gen = await generateResponsesViaApi({
			workspaceId: workspace.id,
			userId: session.user.id,
			prompts,
		});
		console.log("[geo/scan] generated", gen.generated, "analysed", gen.analysed);

		const nextOffset = offset + prompts.length;
		return NextResponse.json({
			ok: true,
			total: all.length,
			processed: prompts.length,
			nextOffset,
			done: nextOffset >= all.length,
			generated: gen.generated,
			analysed: gen.analysed,
		});
	} catch (e) {
		console.error("[geo/scan] FATAL:", (e as Error)?.message, (e as Error)?.stack?.slice(0, 300));
		return NextResponse.json(
			{ ok: false, error: (e as Error)?.message?.slice(0, 200) ?? "scan failed" },
			{ status: 500 },
		);
	}
}
