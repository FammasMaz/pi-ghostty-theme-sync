/**
 * Ghostty → pi theme sync with UI-aware accent selection.
 *
 * Fixes the common "everything is purple" issue when ANSI palette[5] (magenta)
 * was mapped directly to pi's `accent` token (used for borders, bullets, thinking, etc.).
 *
 * Accent logic is aligned with the Starship Ghostty palette sync in dotfiles
 * (contrast + saturation), with blue/link preferred for UI chrome.
 */

import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";

import { getGhosttyColors, loadGhosttySyncSettings } from "./ghostty-colors.ts";
import { computeThemeHash, generatePiTheme, type AccentStrategy } from "./theme-generate.ts";

const THEME_PREFIX = "ghostty-sync";

function cleanupOldGhosttyThemes(themesDir: string, keepFile: string): void {
	try {
		for (const file of readdirSync(themesDir)) {
			if (file === keepFile) continue;
			if (file === "ghostty-sync.json") {
				unlinkSync(join(themesDir, file));
				continue;
			}
			if (file.startsWith(`${THEME_PREFIX}-`) && file.endsWith(".json")) {
				unlinkSync(join(themesDir, file));
			}
		}
	} catch {
		// best-effort
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const syncSettings = loadGhosttySyncSettings();
		const colors = getGhosttyColors(syncSettings);
		if (!colors) {
			return;
		}

		const accentStrategy: AccentStrategy = syncSettings.accentStrategy ?? "auto";

		const themesDir = join(getAgentDir(), "themes");
		if (!existsSync(themesDir)) {
			mkdirSync(themesDir, { recursive: true });
		}

		const hash = computeThemeHash(colors, accentStrategy);
		const themeName = `${THEME_PREFIX}-${hash}`;
		const themeFile = `${themeName}.json`;
		const themePath = join(themesDir, themeFile);

		const themeJson = generatePiTheme(colors, themeName, accentStrategy);
		writeFileSync(themePath, JSON.stringify(themeJson, null, 2) + "\n");
		cleanupOldGhosttyThemes(themesDir, themeFile);

		if (ctx.ui.theme.name === themeName) {
			return;
		}

		const result = ctx.ui.setTheme(themeName);
		if (!result.success) {
			ctx.ui.notify(`Ghostty theme sync failed: ${result.error}`, "error");
		}
	});

	pi.registerCommand("ghostty-sync", {
		description: "Regenerate pi theme from Ghostty and apply it",
		handler: async (_args, ctx) => {
			const syncSettings = loadGhosttySyncSettings();
			const colors = getGhosttyColors(syncSettings);
			if (!colors) {
				ctx.ui.notify("Could not read Ghostty config (is `ghostty` in PATH?)", "error");
				return;
			}
			const accentStrategy: AccentStrategy = syncSettings.accentStrategy ?? "auto";
			const themesDir = join(getAgentDir(), "themes");
			if (!existsSync(themesDir)) mkdirSync(themesDir, { recursive: true });

			const hash = computeThemeHash(colors, accentStrategy);
			const themeName = `${THEME_PREFIX}-${hash}`;
			const themeFile = `${themeName}.json`;
			const themePath = join(themesDir, themeFile);

			writeFileSync(
				themePath,
				JSON.stringify(generatePiTheme(colors, themeName, accentStrategy), null, 2) + "\n",
			);
			cleanupOldGhosttyThemes(themesDir, themeFile);

			const result = ctx.ui.setTheme(themeName);
			if (!result.success) {
				ctx.ui.notify(`Ghostty theme sync failed: ${result.error}`, "error");
				return;
			}
			ctx.ui.notify(`Applied ${themeName}`, "success");
		},
	});
}