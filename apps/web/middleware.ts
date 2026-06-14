import {
	canAccessPeopleInMode,
	resolveAppMode,
} from "@oneglanse/types";
import { type NextRequest, NextResponse } from "next/server";

// Auth is removed on this embedded tool: instead of sending visitors to /login,
// unauthenticated requests are routed through /api/guest-login, which signs them
// into a shared guest account (on the nodejs runtime) and redirects back — so the
// app opens straight into the dashboard inside the iframe, no login screen.
export async function middleware(request: NextRequest) {
	const appMode = resolveAppMode(process.env.ONEGLANSE_APP_MODE);
	const { pathname, searchParams } = request.nextUrl;

	// Let the auth + guest-login endpoints through untouched.
	if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/guest-login")) {
		return NextResponse.next();
	}

	const isLocalProvidersPage =
		appMode === "local" && pathname.startsWith("/providers");
	const isLocalProvidersApi =
		appMode === "local" && pathname.startsWith("/api/providers");
	const isPublicLocalProvidersRequest =
		isLocalProvidersPage || isLocalProvidersApi;

	const session = isPublicLocalProvidersRequest
		? null
		: await (await import("@/lib/auth/auth")).auth.api.getSession({
				headers: request.headers,
			});

	if (!session && !isPublicLocalProvidersRequest) {
		const url = new URL("/api/guest-login", request.url);
		url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
		return NextResponse.redirect(url);
	}

	const workspaceId = searchParams.get("workspace");
	const workspaceUrl = new URL("/workspace", request.url);
	if (workspaceId) workspaceUrl.searchParams.set("workspace", workspaceId);

	if (pathname.startsWith("/people") && !canAccessPeopleInMode(appMode)) {
		return NextResponse.redirect(workspaceUrl);
	}

	if (isLocalProvidersPage) {
		const requestHeaders = new Headers(request.headers);
		requestHeaders.set("x-oneglanse-public-providers", "1");
		return NextResponse.next({ request: { headers: requestHeaders } });
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!login|signup|_next|static|favicon.ico).*)"],
};
