import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

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

export type SyncGhosttyResult =
	| { ok: true; themeName: string; applied: boolean }
	| { ok: false; reason: "ghostty_unavailable" | "set_theme_failed"; error?: string };

/** Regenerate ghostty-sync theme file and apply when name differs from active theme. */
export function syncGhosttyTheme(ctx: ExtensionContext): SyncGhosttyResult {
	const syncSettings = loadGhosttySyncSettings();
	const colors = getGhosttyColors(syncSettings);
	if (!colors) {
		return { ok: false, reason: "ghostty_unavailable" };
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

	writeFileSync(
		themePath,
		JSON.stringify(generatePiTheme(colors, themeName, accentStrategy), null, 2) + "\n",
	);
	cleanupOldGhosttyThemes(themesDir, themeFile);

	if (ctx.ui.theme.name === themeName) {
		// Same name but file may have been rewritten (algo bump); still refresh cc-tools palette.
		bustClaudeStyleToolPalette();
		return { ok: true, themeName, applied: false };
	}

	const result = ctx.ui.setTheme(themeName);
	if (!result.success) {
		return { ok: false, reason: "set_theme_failed", error: result.error };
	}
	bustClaudeStyleToolPalette();
	ctx.ui.invalidate?.();
	ctx.ui.requestRender?.();
	return { ok: true, themeName, applied: true };
}

/** pi-claude-style-tools caches border/diff colors per theme object — bust after setTheme. */
function bustClaudeStyleToolPalette(): void {
	const bustKey = Symbol.for("pi-claude-style-tools:theme-palette-bust"); // paired with pi-claude-style-tools
	const n = ((globalThis as any)[bustKey] as number | undefined) ?? 0;
	(globalThis as any)[bustKey] = n + 1;
}