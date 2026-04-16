"use client";

import { cn, getModelFavicon, getProviderDisplayName } from "@oneglanse/utils";
import { CheckCircle2, Loader2, StopCircle, XCircle } from "lucide-react";
import { Button } from "./button.js";

export type ProviderRunDisplayPhase =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "stopped";

export function ProviderRunStatusCard(props: {
	provider: string;
	phase: ProviderRunDisplayPhase;
	onStop?: () => void | Promise<void>;
	isStopping?: boolean;
	promptNumber?: number;
	totalPrompts?: number;
}) {
	const {
		provider,
		phase,
		onStop,
		isStopping = false,
		promptNumber,
		totalPrompts,
	} = props;
	const title = getProviderDisplayName(provider);
	const canStop = phase === "running" && Boolean(onStop);

	function getSubtitle() {
		if (phase === "pending") return "Queued — waiting to start";
		if (phase === "running") {
			if (
				promptNumber !== undefined &&
				totalPrompts !== undefined &&
				totalPrompts > 0
			) {
				return `Prompt ${promptNumber} of ${totalPrompts}`;
			}
			return "Running prompts, please wait…";
		}
		if (phase === "completed") return "Responses saved.";
		if (phase === "stopped") return "Stopped at your request.";
		return "This provider needs another attempt.";
	}

	return (
		<div className="pointer-events-auto w-[min(320px,calc(100vw-2rem))] rounded-[var(--app-radius)] border border-gray-200/80 bg-white px-3 py-3 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.28)] animate-in fade-in-0 slide-in-from-bottom-2 zoom-in-95 duration-200 dark:border-gray-800 dark:bg-neutral-950 dark:shadow-[0_24px_70px_-30px_rgba(0,0,0,0.62)]">
			<div className="flex items-center gap-2.5">
				<div className="relative shrink-0">
					<div
						className={cn(
							"absolute inset-0 rounded-[var(--app-radius)] blur-md transition-opacity duration-300",
							phase === "pending"
								? "bg-stone-200/60 opacity-70 dark:bg-white/8"
								: phase === "running"
									? "bg-stone-200/70 opacity-80 dark:bg-white/10"
									: phase === "completed"
										? "bg-emerald-200/70 opacity-80 dark:bg-emerald-500/10"
										: phase === "stopped"
											? "bg-slate-200/70 opacity-80 dark:bg-slate-500/10"
											: "bg-red-200/70 opacity-80 dark:bg-red-500/10",
						)}
					/>
					<img
						src={getModelFavicon(provider)}
						alt={title}
						className="relative h-7 w-7 rounded-[var(--app-radius)]"
					/>
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">
						{title}
					</p>
					<p
						className={cn(
							"mt-0.5 text-[11px]",
							phase === "pending"
								? "text-gray-400 dark:text-gray-500"
								: phase === "running"
									? "text-gray-500 dark:text-gray-400"
									: phase === "completed"
										? "text-emerald-600 dark:text-emerald-400"
										: phase === "stopped"
											? "text-slate-500 dark:text-slate-400"
											: "text-red-500 dark:text-red-400",
						)}
					>
						{getSubtitle()}
					</p>
				</div>
				<div className="shrink-0">
					{canStop ? (
						<Button
							type="button"
							variant="outline"
							onClick={() => void onStop?.()}
							disabled={isStopping}
							className="h-7 rounded-[var(--app-radius)] border-red-200 bg-red-50 px-2 text-red-600 hover:bg-red-100 hover:text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50 dark:hover:text-red-300"
						>
							{isStopping ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<>
									<StopCircle className="h-3 w-3" />
									<span className="text-[11px]">Stop</span>
								</>
							)}
						</Button>
					) : phase === "completed" ? (
						<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
					) : phase === "stopped" ? (
						<div className="h-3.5 w-3.5 rounded-[var(--app-radius)] border border-slate-400 dark:border-slate-500" />
					) : phase === "failed" ? (
						<XCircle className="h-3.5 w-3.5 text-red-500" />
					) : null}
				</div>
			</div>
		</div>
	);
}
