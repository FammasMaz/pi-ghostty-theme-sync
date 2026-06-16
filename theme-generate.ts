import { createHash } from "node:crypto";

import { type GhosttyColors, SYNC_ALGO_VERSION } from "./ghostty-colors.ts";

export type AccentStrategy = "auto" | "link" | "blue" | "cursor" | "ansi5";

const DARK_BG_LUM_THRESHOLD = 0.26;
const LIGHT_ACCENT_MIN_CONTRAST = 4.0;
const LIGHT_ACCENT_MAX_LUM = 0.35;
const DARK_ACCENT_MIN_CONTRAST = 3.5;
const DARK_ACCENT_MAX_LUM = 0.55;
const CURSOR_MIN_SATURATION = 0.25;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const h = hex.replace("#", "");
	return {
		r: parseInt(h.substring(0, 2), 16),
		g: parseInt(h.substring(2, 4), 16),
		b: parseInt(h.substring(4, 6), 16),
	};
}

function rgbToHex(r: number, g: number, b: number): string {
	const clamp = (n: number) => Math.round(Math.min(255, Math.max(0, n)));
	return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function channelToLinear(channel: number): number {
	const value = channel / 255;
	if (value <= 0.04045) return value / 12.92;
	return ((value + 0.055) / 1.055) ** 2.4;
}

function linearToChannel(value: number): number {
	value = Math.max(0, Math.min(1, value));
	const srgb = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
	return Math.round(srgb * 255);
}

export function relativeLuminance(hex: string): number {
	const { r, g, b } = hexToRgb(hex);
	const rl = channelToLinear(r);
	const gl = channelToLinear(g);
	const bl = channelToLinear(b);
	return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(a: string, b: string): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const lighter = Math.max(la, lb);
	const darker = Math.min(la, lb);
	return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsv(hex: string): { h: number; s: number; v: number } {
	const { r, g, b } = hexToRgb(hex);
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const d = max - min;
	let h = 0;
	if (d !== 0) {
		if (max === rn) h = ((gn - bn) / d) % 6;
		else if (max === gn) h = (bn - rn) / d + 2;
		else h = (rn - gn) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	const s = max === 0 ? 0 : d / max;
	return { h, s, v: max };
}

function scaleLuminance(hex: string, targetLum: number): string {
	const { r, g, b } = hexToRgb(hex);
	let rl = channelToLinear(r);
	let gl = channelToLinear(g);
	let bl = channelToLinear(b);
	const currentLum = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
	if (currentLum < 0.001) return hex;
	let factor = targetLum / currentLum;
	let newR = rl * factor;
	let newG = gl * factor;
	let newB = bl * factor;
	const maxVal = Math.max(newR, newG, newB);
	if (maxVal > 1) {
		factor /= maxVal;
		newR = rl * factor;
		newG = gl * factor;
		newB = bl * factor;
	}
	return rgbToHex(linearToChannel(newR), linearToChannel(newG), linearToChannel(newB));
}

function ensureAccentContrast(color: string, background: string, isDark: boolean): string {
	const bgLum = relativeLuminance(background);
	let c = color;
	const minCr = isDark ? DARK_ACCENT_MIN_CONTRAST : LIGHT_ACCENT_MIN_CONTRAST;
	const maxLum = isDark ? DARK_ACCENT_MAX_LUM : LIGHT_ACCENT_MAX_LUM;

	if (contrastRatio(c, background) < minCr) {
		const targetLum = isDark
			? minCr * (bgLum + 0.05) - 0.05
			: (bgLum + 0.05) / minCr - 0.05;
		c = scaleLuminance(c, Math.max(0.03, Math.min(maxLum, targetLum)));
	}
	if (!isDark && relativeLuminance(c) > maxLum) {
		c = scaleLuminance(c, maxLum);
	}
	return c;
}

function isMagentaHue(h: number): boolean {
	return h >= 265 && h <= 335;
}

function isWarmAccentHue(h: number): boolean {
	return h >= 15 && h <= 55;
}

function hueDistance(a: number, b: number): number {
	const d = Math.abs(a - b) % 360;
	return d > 180 ? 360 - d : d;
}

function paletteCandidates(colors: GhosttyColors): string[] {
	const out: string[] = [];
	for (let i = 0; i <= 15; i++) {
		const c = colors.palette[i];
		if (c) out.push(c);
	}
	return out;
}

function isDistinctFromFgBg(hex: string, fg: string, bg: string): boolean {
	return hex.toLowerCase() !== fg.toLowerCase() && hex.toLowerCase() !== bg.toLowerCase();
}

function darken(hex: string, amount: number): string {
	const { r, g, b } = hexToRgb(hex);
	return rgbToHex(r - amount, g - amount, b - amount);
}

function scoreAccentCandidate(hex: string, bg: string, isDark: boolean): number {
	const { h, s, v } = rgbToHsv(hex);
	const cr = contrastRatio(hex, bg);
	if (cr < (isDark ? 2.2 : 3.0) || s < 0.1) return -1;

	let score = cr * s * (v + 0.15);

	// Light themes: magenta ANSI slot is usually shell chrome, not UI identity
	if (!isDark && isMagentaHue(h)) score *= 0.4;

	// Prefer warm accents (Jellybeans cursor orange) and teals over random purple
	if (isWarmAccentHue(h)) score *= 1.2;
	if (h >= 160 && h <= 200) score *= 1.08;

	return score;
}

export function pickUiAccent(
	colors: GhosttyColors,
	strategy: AccentStrategy,
): { accent: string; magenta: string } {
	const bg = colors.background;
	const fg = colors.foreground;
	const isDark = relativeLuminance(bg) < DARK_BG_LUM_THRESHOLD;

	const link = colors.palette[4] || "#61afef";
	const magenta = colors.palette[5] || "#c678dd";

	if (strategy === "ansi5") {
		return { accent: ensureAccentContrast(magenta, bg, isDark), magenta };
	}
	if (strategy === "link" || strategy === "blue") {
		return { accent: ensureAccentContrast(link, bg, isDark), magenta };
	}

	if (strategy === "cursor" || strategy === "auto") {
		if (colors.cursorColor && isDistinctFromFgBg(colors.cursorColor, fg, bg)) {
			const { s } = rgbToHsv(colors.cursorColor);
			if (s >= CURSOR_MIN_SATURATION) {
				return {
					accent: ensureAccentContrast(colors.cursorColor, bg, isDark),
					magenta,
				};
			}
		}
		if (strategy === "cursor") {
			// fall through to scoring
		} else {
			// auto: cursor handled above; continue to palette scoring
		}
	}

	const scored = paletteCandidates(colors)
		.map((hex) => ({ hex, score: scoreAccentCandidate(hex, bg, isDark) }))
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score);

	if (scored.length > 0) {
		return { accent: ensureAccentContrast(scored[0].hex, bg, isDark), magenta };
	}

	return { accent: ensureAccentContrast(link, bg, isDark), magenta };
}

export function pickSecondary(colors: GhosttyColors, accent: string): string {
	const bg = colors.background;
	const accentHue = rgbToHsv(accent).h;
	const prefer = [6, 4, 14, 12, 2];
	for (const idx of prefer) {
		const c = colors.palette[idx];
		if (!c) continue;
		if (hueDistance(rgbToHsv(c).h, accentHue) < 30) continue;
		if (contrastRatio(c, bg) < 2.5) continue;
		return c;
	}
	return colors.palette[4] || colors.palette[6] || accent;
}

function pickGray(colors: GhosttyColors, bg: string, fg: string, isDark: boolean): string {
	const p8 = colors.palette[8];
	if (p8) {
		const cr = contrastRatio(p8, bg);
		if (isDark && cr >= 2.0) {
			// Footer / thinking labels: palette[8] alone is often too dim on dark bg
			return mixColors(fg, p8, 0.52);
		}
		if (!isDark && cr >= 3.2) return p8;
	}
	return mixColors(fg, bg, isDark ? 0.72 : 0.82);
}

function pickDimText(fg: string, gray: string, isDark: boolean): string {
	if (isDark) return mixColors(fg, gray, 0.55);
	return mixColors(gray, fg, 0.42);
}

function pickMutedText(fg: string, dim: string, gray: string, isDark: boolean): string {
	if (isDark) return mixColors(fg, dim, 0.42);
	return mixColors(gray, dim, 0.55);
}

/** Ghostty ANSI green (palette 2); prefer bright green (10) for footer git when available. */
function pickSuccess(colors: GhosttyColors, bg: string, fg: string, isDark: boolean): string {
	let s = colors.palette[2] || "#98c379";
	const bright = colors.palette[10];
	if (isDark && bright && contrastRatio(bright, bg) >= 3.0) {
		s = bright;
	} else if (isDark && contrastRatio(s, bg) < 4.5) {
		s = mixColors(s, fg, 0.18);
	}
	if (!isDark) {
		const cr = contrastRatio(s, bg);
		if (cr < 3.0) s = mixColors(s, fg, 0.2);
	}
	return s;
}

function adjustBrightness(hex: string, amount: number): string {
	const { r, g, b } = hexToRgb(hex);
	return rgbToHex(r + amount, g + amount, b + amount);
}

function mixColors(color1: string, color2: string, weight: number): string {
	const c1 = hexToRgb(color1);
	const c2 = hexToRgb(color2);
	return rgbToHex(
		c1.r * weight + c2.r * (1 - weight),
		c1.g * weight + c2.g * (1 - weight),
		c1.b * weight + c2.b * (1 - weight),
	);
}

/** Blend `amount` of `tint` into the panel base (curated themes use ~7–10% tint). */
function tintPanel(bg: string, tint: string, amount: number): string {
	const panelBase = adjustBrightness(bg, relativeLuminance(bg) < 0.5 ? 8 : -8);
	return mixColors(tint, panelBase, amount);
}

/** Curated-style wiring; light mode uses darker muted/dim and fg-based headings. */
function buildColorsBlock(isDark: boolean): Record<string, string> {
	const heading = isDark ? "white" : "fg";
	const syntaxType = isDark ? "white" : "fg";
	const thinkingTop = isDark ? "white" : "fg";
	return {
		accent: "accent",
		border: "gray",
		borderAccent: "accent",
		borderMuted: "darkGray",
		success: "success",
		error: "error",
		warning: "warning",
		muted: "muted",
		dim: "dim",
		text: "",
		thinkingText: isDark ? "muted" : "dim",
		selectedBg: "panelInfo",
		userMessageBg: "panel",
		userMessageText: "",
		customMessageBg: "panelAlt",
		customMessageText: "",
		customMessageLabel: "accent",
		toolPendingBg: "panelAlt",
		toolSuccessBg: "panelSuccess",
		toolErrorBg: "panelError",
		toolTitle: heading,
		toolOutput: "fg",
		mdHeading: heading,
		mdLink: "secondary",
		mdLinkUrl: "dim",
		mdCode: "accent",
		mdCodeBlock: "fg",
		mdCodeBlockBorder: "accentDark",
		mdQuote: "dim",
		mdQuoteBorder: "gray",
		mdHr: "darkGray",
		mdListBullet: "accent",
		toolDiffAdded: "diffAdded",
		toolDiffRemoved: "diffRemoved",
		toolDiffContext: "dim",
		syntaxComment: "dim",
		syntaxKeyword: "accent",
		syntaxFunction: "secondary",
		syntaxVariable: "fg",
		syntaxString: "success",
		syntaxNumber: "warning",
		syntaxType,
		syntaxOperator: "error",
		syntaxPunctuation: "dim",
		thinkingOff: isDark ? "gray" : "darkGray",
		thinkingMinimal: isDark ? "muted" : "dim",
		thinkingLow: "accentDark",
		thinkingMedium: "accentMid",
		thinkingHigh: "accent",
		thinkingXhigh: thinkingTop,
		bashMode: "accent",
	};
}

export function generatePiTheme(
	colors: GhosttyColors,
	themeName: string,
	accentStrategy: AccentStrategy = "auto",
): object {
	const bg = colors.background;
	const fg = colors.foreground;
	const isDark = relativeLuminance(bg) < 0.5;

	const error = colors.palette[1] || "#cc6666";
	const success = pickSuccess(colors, bg, fg, isDark);
	const warning = colors.palette[3] || "#e5c07b";

	const { accent, magenta } = pickUiAccent(colors, accentStrategy);
	const secondary = pickSecondary(colors, accent);
	const gray = pickGray(colors, bg, fg, isDark);
	const dim = pickDimText(fg, gray, isDark);
	const muted = pickMutedText(fg, dim, gray, isDark);
	const darkGray = adjustBrightness(bg, isDark ? 18 : -18);
	const white =
		colors.palette[15] && relativeLuminance(colors.palette[15]) > 0.75
			? colors.palette[15]
			: colors.palette[7] || fg;

	const accentDark =
		relativeLuminance(accent) > 0.45 ? darken(accent, 40) : darken(accent, 22);
	const accentMid = mixColors(accent, fg, 0.5);

	const panel = adjustBrightness(bg, isDark ? 10 : -10);
	const panelAlt = adjustBrightness(bg, isDark ? 14 : -14);
	const panelInfo = adjustBrightness(bg, isDark ? 18 : -18);
	const panelSuccess = tintPanel(bg, success, 0.07);
	const panelError = tintPanel(bg, error, 0.1);

	const diffAdded =
		relativeLuminance(success) > 0.55 ? mixColors(success, fg, 0.35) : success;
	const diffRemoved = relativeLuminance(error) > 0.55 ? mixColors(error, fg, 0.35) : error;

	return {
		$schema:
			"https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
		name: themeName,
		vars: {
			bg,
			fg,
			gray,
			dim,
			muted,
			darkGray,
			accent,
			accentDark,
			accentMid,
			secondary,
			white,
			panel,
			panelAlt,
			panelInfo,
			panelSuccess,
			panelError,
			success,
			error,
			warning,
			diffAdded,
			diffRemoved,
			magenta,
		},
		colors: buildColorsBlock(isDark),
		export: {
			pageBg: bg,
			cardBg: panel,
			infoBg: panelInfo,
		},
	};
}

export function computeThemeHash(colors: GhosttyColors, accentStrategy: AccentStrategy): string {
	const parts: string[] = [];
	parts.push(`v=${SYNC_ALGO_VERSION}`);
	parts.push(`accent=${accentStrategy}`);
	parts.push(`bg=${colors.background}`);
	parts.push(`fg=${colors.foreground}`);
	if (colors.cursorColor) parts.push(`cursor=${colors.cursorColor}`);
	for (let i = 0; i <= 15; i++) {
		parts.push(`p${i}=${colors.palette[i] ?? ""}`);
	}
	return createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 8);
}