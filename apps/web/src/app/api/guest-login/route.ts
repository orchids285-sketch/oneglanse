// Auth is removed on this embedded tool, but sessions are PRIVATE PER CLIENT:
// the FoundReach shell loads this route with ?fr_user=<clerkUserId>, and we sign
// the visitor into a per-user account (geo_<fr_user>@foundrreach.local), each with
// its own workspace — so every FoundReach client gets an isolated GEO Tracker,
// exactly like the other embedded tools. Runs on the nodejs runtime (better-auth
// needs DB access) and sets the session cookie (SameSite=None) on the redirect so
// it persists inside the cross-site iframe. On first provision it also emits a
// `seo.audit` event into the FoundReach data spine, connecting the tool.
import { auth } from "@/lib/auth/auth";
import { createWorkspaceForTenant } from "@oneglanse/services";
import { db } from "@oneglanse/db";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPINE_EMIT_URL =
	process.env.SPINE_EMIT_URL ?? "https://foundrreach-app.vercel.app/api/spine/emit";

function sanitize(s: string): string {
	return (s || "shared").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48) || "shared";
}

function getSetCookies(res: Response): string[] {
	const h = res.headers as Headers & { getSetCookie?: () => string[] };
	if (typeof h.getSetCookie === "function") return h.getSetCookie();
	const single = res.headers.get("set-cookie");
	return single ? [single] : [];
}

async function signIn(email: string, password: string): Promise<Response | null> {
	try {
		const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
		if (res.ok) return res;
	} catch {
		/* fall through */
	}
	return null;
}

export async function GET(req: NextRequest) {
	const frUser = sanitize(req.nextUrl.searchParams.get("fr_user") || "shared");
	const email = `geo_${frUser}@foundrreach.local`;
	const password = `FRGeo_${frUser}_2026!`;
	const brandName = "FoundReach";

	const nextParam = req.nextUrl.searchParams.get("next") || "/dashboard";
	const nextPath = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

	// Behind Render's proxy req.url is the internal 0.0.0.0:10000 — use the public origin.
	const proto = req.headers.get("x-forwarded-proto") ?? "https";
	const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
	const publicBase = process.env.APP_URL ?? (host ? `${proto}://${host}` : req.url);

	// Sign in this client's private account (create it once if missing).
	let signed = await signIn(email, password);
	if (!signed) {
		try {
			await auth.api.signUpEmail({ body: { email, password, name: brandName }, asResponse: true });
		} catch {
			/* may already exist */
		}
		signed = await signIn(email, password);
	}

	const redirect = NextResponse.redirect(new URL(nextPath, publicBase));
	const setCookies = signed ? getSetCookies(signed) : [];
	for (const c of setCookies) redirect.headers.append("set-cookie", c);

	// Ensure this client has an isolated workspace; provision + connect-to-spine once.
	if (signed && setCookies.length) {
		try {
			const authedHeaders = new Headers();
			authedHeaders.set("cookie", setCookies.map((c) => c.split(";")[0]).join("; "));
			const session = await auth.api.getSession({ headers: authedHeaders });
			if (session) {
				const memberships = await db.query.workspaceMembers.findMany({
					where: (wm, { and, eq, isNull }) =>
						and(eq(wm.userId, session.user.id), isNull(wm.deletedAt)),
					columns: { workspaceId: true },
				});
				if (memberships.length === 0) {
					const slug = `geo-${frUser}`.slice(0, 40);
					const org = await auth.api.createOrganization({
						body: {
							name: brandName,
							slug: `${slug}-${crypto.randomUUID().slice(0, 8)}`,
							keepCurrentActiveOrganization: false,
						},
						headers: authedHeaders,
					});
					if (org?.id) {
						await createWorkspaceForTenant({
							name: brandName,
							slug,
							domain: "foundrreach-app.vercel.app",
							tenantId: org.id,
							userId: session.user.id,
						});
						// connect this tool to the FoundReach data spine (best-effort)
						fetch(SPINE_EMIT_URL, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								user_id: frUser,
								type: "seo.audit",
								title: "GEO Tracker (oneglanse) connecté",
								body: "Espace de suivi de visibilité IA provisionné pour ce client.",
								payload: { tool: "geo_tracker", source: "oneglanse" },
								mirror: false,
							}),
						}).catch(() => {});
					}
				}
			}
		} catch {
			/* non-fatal — the app will route to /workspace onboarding if needed */
		}
	}

	return redirect;
}
