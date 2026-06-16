/**
 * Ghostty → pi theme sync with UI-aware accent selection.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { getMacOsSystemAppearance, loadGhosttySyncSettings } from "./ghostty-colors.ts";
import { syncGhosttyTheme } from "./sync-runner.ts";

const SYSTEM_APPEARANCE_POLL_MS = 3000;

function shouldFollowSystemAppearance(): boolean {
	const settings = loadGhosttySyncSettings();
	if (settings.appearance === "light" || settings.appearance === "dark") {
		return false;
	}
	if (settings.followSystemAppearance === false) {
		return false;
	}
	return process.platform === "darwin";
}

export default function (pi: ExtensionAPI) {
	let appearancePollId: ReturnType<typeof setInterval> | null = null;
	let lastSystemAppearance: "light" | "dark" | null = null;

	function stopAppearancePoll(): void {
		if (appearancePollId !== null) {
			clearInterval(appearancePollId);
			appearancePollId = null;
		}
	}

	function startAppearancePoll(ctx: ExtensionContext): void {
		stopAppearancePoll();
		if (!shouldFollowSystemAppearance()) return;

		lastSystemAppearance = getMacOsSystemAppearance();

		appearancePollId = setInterval(() => {
			const current = getMacOsSystemAppearance();
			if (!current || current === lastSystemAppearance) return;
			lastSystemAppearance = current;
			const result = syncGhosttyTheme(ctx);
			if (result.ok && result.applied) {
				ctx.ui.notify(`Ghostty sync → ${result.themeName} (${current} mode)`, "info");
			}
		}, SYSTEM_APPEARANCE_POLL_MS);
	}

	pi.on("session_start", async (_event, ctx) => {
		const result = syncGhosttyTheme(ctx);
		if (!result.ok && result.reason === "set_theme_failed") {
			ctx.ui.notify(`Ghostty theme sync failed: ${result.error}`, "error");
		}
		startAppearancePoll(ctx);
	});

	pi.on("session_shutdown", () => {
		stopAppearancePoll();
		lastSystemAppearance = null;
	});

	pi.registerCommand("ghostty-sync", {
		description: "Regenerate pi theme from Ghostty and apply it",
		handler: async (_args, ctx) => {
			const result = syncGhosttyTheme(ctx);
			if (!result.ok) {
				if (result.reason === "ghostty_unavailable") {
					ctx.ui.notify("Could not read Ghostty config (is `ghostty` in PATH?)", "error");
				} else {
					ctx.ui.notify(`Ghostty theme sync failed: ${result.error}`, "error");
				}
				return;
			}
			ctx.ui.notify(
				result.applied ? `Applied ${result.themeName}` : `Already on ${result.themeName}`,
				"success",
			);
			lastSystemAppearance = getMacOsSystemAppearance();
		},
	});
}