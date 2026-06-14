import {
	canAccessPeopleInMode,
	resolveAppMode,
} from "@oneglanse/types";
import { type NextRequest, NextResponse } from "next/server";

// Auth is removed on this embedded tool: instead of sending visitors to /login,
// the middleware transparently signs everyone into a single shared guest
// account so the app opens straight into the dashboard inside the iframe.
const GUEST_EMAIL = process.env.GUEST_EMAIL ?? "guest@foundrreach.local";
const GUEST_PASSWORD = process.env.GUEST_PASSWORD ?? "FoundReachGuest2026!";
const GUEST_NAME = "FoundReach";

function getSetCookies(res: Response): string[] {
	const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
	if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
	const single = res.headers.get("set-cookie");
	return single ? [single] : [];
}

export async function middleware(request: NextRequest) {
	const appMode = resolveAppMode(process.env.ONEGLANSE_APP_MODE);
	const { pathname, searchParams } = request.nextUrl;

	// Never auto-login on the auth API routes themselves.
	if (pathname.startsWith("/api/auth")) return NextResponse.next();

	const isLocalProvidersPage =
		appMode === "local" && pathname.startsWith("/providers");
	const isLocalProvidersApi =
		appMode === "local" && pathname.startsWith("/api/providers");
	const isPublicLocalProvidersRequest =
		isLocalProvidersPage || isLocalProvidersApi;

	const { auth } = await import("@/lib/auth/auth");
	const session = isPublicLocalProvidersRequest
		? null
		: await auth.api.getSession({ headers: request.headers });

	const requestHeaders = new Headers(request.headers);
	let setCookies: string[] = [];

	if (!session && !isPublicLocalProvidersRequest) {
		// Transparent guest sign-in (sign up once if the account is missing).
		try {
			let res = await auth.api.signInEmail({
				body: { email: GUEST_EMAIL, password: GUEST_PASSWORD },
				asResponse: true,
			});
			if (!res.ok) {
				await auth.api
					.signUpEmail({
						body: { email: GUEST_EMAIL, password: GUEST_PASSWORD, name: GUEST_NAME },
						asResponse: true,
					})
					.catch(() => {});
				res = await auth.api.signInEmail({
					body: { email: GUEST_EMAIL, password: GUEST_PASSWORD },
					asResponse: true,
				});
			}
			setCookies = getSetCookies(res);
			if (setCookies.length) {
				// make the freshly-issued session visible to this same request
				const existing = request.headers.get("cookie");
				const pairs = setCookies.map((c) => c.split(";")[0]).join("; ");
				requestHeaders.set("cookie", [existing, pairs].filter(Boolean).join("; "));
			}
		} catch {
			// fall through; if sign-in failed the app will still gate normally
		}
	}

	const attach = (res: NextResponse) => {
		for (const c of setCookies) res.headers.append("set-cookie", c);
		return res;
	};

	const workspaceId = searchParams.get("workspace");
	const workspaceUrl = new URL("/workspace", request.url);
	if (workspaceId) workspaceUrl.searchParams.set("workspace", workspaceId);

	if (pathname.startsWith("/people") && !canAccessPeopleInMode(appMode)) {
		return attach(NextResponse.redirect(workspaceUrl));
	}

	if (isLocalProvidersPage) {
		requestHeaders.set("x-oneglanse-public-providers", "1");
	}

	return attach(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
	matcher: ["/((?!login|signup|_next|static|favicon.ico).*)"],
};
