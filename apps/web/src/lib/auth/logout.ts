"use client";

import { authClient } from "./auth-client";

/**
 * Sign out and leave the protected app shell with a full document redirect.
 * This avoids client-router races while auth cookies/session state are clearing.
 */
export async function signOutAndRedirect(_redirectTo = "/login") {
	await authClient.signOut();

	if (typeof window !== "undefined") {
		// Auth removed: after sign-out, transparently re-enter as the shared guest
		// instead of showing a login screen.
		window.location.replace("/api/guest-login");
	}
}
