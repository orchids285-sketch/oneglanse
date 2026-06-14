// Auth is removed on this embedded tool. This route transparently signs the
// visitor into a single shared guest account, then redirects to `next`. It runs
// on the nodejs runtime (better-auth needs DB access, which the edge middleware
// runtime can't do), and sets the session cookie explicitly on the redirect so
// it persists inside the cross-site iframe (cookies are SameSite=None; Secure).
import { auth } from "@/lib/auth/auth";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUEST_EMAIL = process.env.GUEST_EMAIL ?? "guest@foundrreach.local";
const GUEST_PASSWORD = process.env.GUEST_PASSWORD ?? "FoundReachGuest2026!";
const GUEST_NAME = "FoundReach";

async function signInGuest(): Promise<Response | null> {
	try {
		const res = await auth.api.signInEmail({
			body: { email: GUEST_EMAIL, password: GUEST_PASSWORD },
			asResponse: true,
		});
		if (res.ok) return res;
	} catch {
		/* fall through to sign-up */
	}
	try {
		await auth.api.signUpEmail({
			body: { email: GUEST_EMAIL, password: GUEST_PASSWORD, name: GUEST_NAME },
			asResponse: true,
		});
	} catch {
		/* ignore — may already exist */
	}
	try {
		const res = await auth.api.signInEmail({
			body: { email: GUEST_EMAIL, password: GUEST_PASSWORD },
			asResponse: true,
		});
		if (res.ok) return res;
	} catch {
		/* give up */
	}
	return null;
}

export async function GET(req: NextRequest) {
	const nextParam = req.nextUrl.searchParams.get("next") || "/";
	// only allow same-origin relative paths
	const nextPath = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

	const signed = await signInGuest();
	const redirect = NextResponse.redirect(new URL(nextPath, req.url));
	if (signed) {
		const setCookies =
			(signed.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
			(signed.headers.get("set-cookie") ? [signed.headers.get("set-cookie") as string] : []);
		for (const c of setCookies) redirect.headers.append("set-cookie", c);
	}
	return redirect;
}
