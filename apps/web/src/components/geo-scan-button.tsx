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
		setMsg("Scan en cours…");
		// Process ONE prompt per request and loop (small free dynos OOM-crash if a
		// single request generates+analyses several prompts). Stops when done.
		let offset = 0;
		let total = 0;
		let processedAny = false;
		try {
			for (let i = 0; i < 50; i++) {
				const r = await fetch("/api/geo/scan", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ limit: 1, offset }),
				})
					.then((x) => x.json())
					.catch(() => null);
				if (!r) {
					setMsg(processedAny ? "Scan interrompu — réessaie pour continuer." : "Échec du scan (réessaie).");
					break;
				}
				if (!r.ok) {
					setMsg(r.note || r.error || "Échec du scan.");
					break;
				}
				total = r.total ?? total;
				if (r.processed > 0) {
					processedAny = true;
					setMsg(`Scan… ${Math.min(offset + 1, total)}/${total} requêtes`);
				}
				offset = r.nextOffset ?? offset + 1;
				if (r.done || r.processed === 0) {
					setMsg(`Scan terminé — ${total} requête(s) analysée(s).`);
					router.refresh();
					break;
				}
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
