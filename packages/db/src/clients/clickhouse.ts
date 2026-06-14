import { createClient } from "@clickhouse/client";
import { clickhouseConfig } from "../config/clickhouse.js";

const realClient = createClient(clickhouseConfig);

// Resilient wrapper: on a data-pending deploy ClickHouse may be unreachable
// (no managed ClickHouse on the free tier). Without this, every analytics tRPC
// query (fetchAnalysis / fetchUserPrompts / fetchPromptSources …) throws a 500
// through the dashboard. Instead, reads degrade to empty and writes no-op when
// the connection is refused — the dashboard renders its empty states cleanly.
// Real errors (bad SQL, etc.) still propagate.
const emptyResultSet = {
	json: async () => [] as unknown[],
	text: async () => "",
};

function isConnErr(e: unknown): boolean {
	const err = e as { code?: string; message?: string; cause?: { code?: string } };
	const s = `${err?.code ?? ""} ${err?.message ?? ""} ${err?.cause?.code ?? ""}`.toLowerCase();
	return (
		s.includes("econnrefused") ||
		s.includes("enotfound") ||
		s.includes("aggregateerror") ||
		s.includes("fetch failed") ||
		s.includes("connect") ||
		s.includes("socket") ||
		s.includes("timeout")
	);
}

export const clickhouse = new Proxy(realClient, {
	get(target, prop, receiver) {
		const orig = Reflect.get(target, prop, receiver);
		if (prop === "query") {
			return async (...args: unknown[]) => {
				try {
					const rs = (await (orig as (...a: unknown[]) => Promise<unknown>).apply(
						target,
						args,
					)) as { json: () => Promise<unknown>; text: () => Promise<unknown> };
					// @clickhouse/client streams lazily — the connection error often
					// surfaces at .json()/.text(), not at .query(). Guard both.
					return {
						json: async () => {
							try {
								return await rs.json();
							} catch (e) {
								if (isConnErr(e)) return [];
								throw e;
							}
						},
						text: async () => {
							try {
								return await rs.text();
							} catch (e) {
								if (isConnErr(e)) return "";
								throw e;
							}
						},
					};
				} catch (e) {
					if (isConnErr(e)) return emptyResultSet;
					throw e;
				}
			};
		}
		if (prop === "insert" || prop === "command") {
			return async (...args: unknown[]) => {
				try {
					return await (orig as (...a: unknown[]) => Promise<unknown>).apply(target, args);
				} catch (e) {
					if (isConnErr(e)) return undefined;
					throw e;
				}
			};
		}
		return typeof orig === "function" ? (orig as (...a: unknown[]) => unknown).bind(target) : orig;
	},
}) as typeof realClient;
