"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Triggers the browser-free, proxy-free GEO scan: the API-based "Camoufox
// alternative" generates AI answers for the workspace's tracked prompts, stores
// them in ClickHouse and analyses them — then refreshes the dashboard.
export function GeoScanButton() {
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState("");
	const router = useRouter();

	async function scan() {
		setBusy(true);
		setMsg("");
		try {
			const r = await fetch("/api/geo/scan", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				// keep batches small so it stays light on modest hosts
				body: JSON.stringify({ limit: 4 }),
			}).then((x) => x.json());
			if (r.ok) {
				setMsg(`Scan terminé — ${r.generated} réponse(s) IA analysée(s).`);
				router.refresh();
			} else {
				setMsg(r.note || r.error || "Échec du scan.");
			}
		} catch {
			setMsg("Échec du scan (réessaie).");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div
			style={{
				position: "fixed",
				right: 20,
				bottom: 20,
				zIndex: 50,
				display: "flex",
				flexDirection: "column",
				alignItems: "flex-end",
				gap: 8,
			}}
		>
			{msg ? (
				<div
					style={{
						background: "#1e1e1e",
						border: "1px solid #333",
						color: "#ddd",
						fontSize: 12.5,
						padding: "6px 11px",
						borderRadius: 8,
						maxWidth: 300,
					}}
				>
					{msg}
				</div>
			) : null}
			<button
				type="button"
				onClick={scan}
				disabled={busy}
				style={{
					background: "#2f2f2f",
					border: "1px solid #3a3a3a",
					color: "#fff",
					borderRadius: 10,
					padding: "10px 16px",
					cursor: busy ? "default" : "pointer",
					fontSize: 13.5,
					boxShadow: "0 2px 10px rgba(0,0,0,.4)",
				}}
			>
				{busy ? "Scan en cours…" : "↻ Lancer un scan IA"}
			</button>
		</div>
	);
}
