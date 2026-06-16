import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SYNC_ALGO_VERSION = "4";

export interface GhosttyColors {
	background: string;
	foreground: string;
	cursorColor?: string;
	palette: Record<number, string>;
}

export type GhosttyAppearance = "auto" | "light" | "dark";

export interface GhosttySyncSettings {
	appearance?: GhosttyAppearance;
	accentStrategy?: "auto" | "link" | "blue" | "cursor" | "ansi5";
	/** When true (default), re-sync on macOS light/dark changes while pi is running. */
	followSystemAppearance?: boolean;
}

const THEME_PAIR_RE = /light\s*:\s*([^,]+?)\s*,\s*dark\s*:\s*(.+?)(?:\s*,\s*|$)/i;

function normalizeColor(color: string): string {
	const trimmed = color.trim();
	if (trimmed.startsWith("#")) {
		if (trimmed.length === 4) {
			return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
		}
		return trimmed.toLowerCase();
	}
	if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
		return `#${trimmed.toLowerCase()}`;
	}
	return `#${trimmed.toLowerCase()}`;
}

export function parseGhosttyConfigText(output: string): GhosttyColors & { themePair?: { light: string; dark: string } } {
	const colors: GhosttyColors = {
		background: "#1e1e1e",
		foreground: "#d4d4d4",
		palette: {},
	};
	let themePair: { light: string; dark: string } | undefined;

	for (const line of output.split("\n")) {
		const match = line.match(/^(\S+)\s*=\s*(.+)$/);
		if (!match) continue;

		const [, key, value] = match;
		const trimmedValue = value.trim().replace(/^["']|["']$/g, "");

		if (key === "background") {
			colors.background = normalizeColor(trimmedValue);
		} else if (key === "foreground") {
			colors.foreground = normalizeColor(trimmedValue);
		} else if (key === "cursor-color") {
			colors.cursorColor = normalizeColor(trimmedValue);
		} else if (key === "theme") {
			const pair = THEME_PAIR_RE.exec(trimmedValue);
			if (pair) {
				themePair = {
					light: pair[1].trim(),
					dark: pair[2].trim().replace(/,$/, ""),
				};
			}
		} else if (key === "palette") {
			const paletteMatch = trimmedValue.match(/^(\d+)=(.+)$/);
			if (paletteMatch) {
				const index = parseInt(paletteMatch[1], 10);
				if (index >= 0 && index <= 255) {
					colors.palette[index] = normalizeColor(paletteMatch[2]);
				}
			}
		}
	}

	return { ...colors, themePair };
}

function ghosttyThemeSearchDirs(): string[] {
	const dirs: string[] = [];
	const xdg = process.env.XDG_CONFIG_HOME?.trim();
	if (xdg) dirs.push(join(xdg, "ghostty", "themes"));
	dirs.push(join(homedir(), ".config", "ghostty", "themes"));
	const resources = process.env.GHOSTTY_RESOURCES_DIR?.trim();
	if (resources) dirs.push(join(resources, "themes"));
	if (process.platform === "darwin") {
		dirs.push("/Applications/Ghostty.app/Contents/Resources/ghostty/themes");
	}
	return dirs.filter((d) => existsSync(d));
}

function findGhosttyThemeFile(themeName: string): string | null {
	const name = themeName.trim();
	if (!name) return null;
	for (const dir of ghosttyThemeSearchDirs()) {
		const candidate = join(dir, name);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

/** Current macOS Aqua appearance (null off-macOS). */
export function getMacOsSystemAppearance(): "light" | "dark" | null {
	if (process.platform !== "darwin") return null;
	try {
		const out = execSync("defaults read -g AppleInterfaceStyle 2>/dev/null || true", {
			encoding: "utf8",
			timeout: 2000,
		}).trim();
		if (!out || out === "null") return "light";
		if (out.toLowerCase() === "dark") return "dark";
		return "light";
	} catch {
		return null;
	}
}

function resolveAppearance(
	requested: GhosttyAppearance,
	showConfigBg?: string,
): "light" | "dark" | null {
	if (requested === "light" || requested === "dark") return requested;

	const env = (process.env.GHOSTTY_THEME_APPEARANCE || "").toLowerCase();
	if (env === "light" || env === "dark") return env;

	const mac = getMacOsSystemAppearance();
	if (mac) return mac;

	const colorfgbg = process.env.COLORFGBG || "";
	if (/^1[;:]/.test(colorfgbg)) return "light";
	if (/^0[;:]/.test(colorfgbg)) return "dark";

	if (showConfigBg) {
		const h = showConfigBg.replace("#", "");
		const r = parseInt(h.substring(0, 2), 16);
		const g = parseInt(h.substring(2, 4), 16);
		const b = parseInt(h.substring(4, 6), 16);
		const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return lum < 0.5 ? "dark" : "light";
	}

	return null;
}

function loadThemeFileColors(themeName: string): GhosttyColors | null {
	const path = findGhosttyThemeFile(themeName);
	if (!path) return null;
	try {
		const parsed = parseGhosttyConfigText(readFileSync(path, "utf8"));
		const { themePair: _tp, ...colors } = parsed;
		if (Object.keys(colors.palette).length > 0 || colors.background) {
			return colors;
		}
	} catch {
		return null;
	}
	return null;
}

export function loadGhosttySyncSettings(): GhosttySyncSettings {
	const paths = [
		join(process.cwd(), ".pi", "settings.json"),
		join(homedir(), ".pi", "settings.json"),
		join(homedir(), ".pi", "agent", "settings.json"),
	];
	const merged: GhosttySyncSettings = {};
	for (const path of paths) {
		try {
			if (!existsSync(path)) continue;
			const raw = JSON.parse(readFileSync(path, "utf8"));
			const block = raw?.ghosttyThemeSync;
			if (block && typeof block === "object") {
				Object.assign(merged, block);
			}
		} catch {
			// ignore
		}
	}
	return merged;
}

export function getGhosttyColors(settings?: GhosttySyncSettings): GhosttyColors | null {
	const syncSettings = settings ?? loadGhosttySyncSettings();
	let output: string;
	try {
		output = execSync("ghostty +show-config", {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch {
		return null;
	}

	const parsed = parseGhosttyConfigText(output);
	const { themePair, ...fromShow } = parsed;

	const appearance = resolveAppearance(syncSettings.appearance ?? "auto", fromShow.background);
	if (themePair) {
		const side = appearance ?? "dark";
		const themeName = side === "dark" ? themePair.dark : themePair.light;
		const fromFile = loadThemeFileColors(themeName);
		if (fromFile) {
			return fromFile;
		}
	}

	return fromShow;
}