import { auth } from "@/lib/auth/auth";
import { getWorkspace } from "@/lib/workspace/getWorkspace";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home(){
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		// Auth removed: transparently sign into the shared guest account.
		return redirect("/api/guest-login");
	}

	const workspace = await getWorkspace();

	if (!workspace) return redirect("/workspace");

	return redirect(`/dashboard?workspace=${workspace.id}`);
}
