import { createHash } from "node:crypto";

import { type GhosttyColors, SYNC_ALGO_VERSION } from "./ghostty-colors.ts";

export type AccentStrategy = "auto" | "link" | "blue" | "cursor";

const DARK_BG_LUM_THRESHOLD = 0.26;
const LIGHT_ACCENT_MIN_CONTRAST = 4.0;
const LIGHT_ACCENT_MAX_LUM = 0.35;
const DARK_ACCENT_MIN_CONTRAST = 3.5;
const DARK_ACCENT_MAX_LUM = 0.45;
const MIN_ACCENT_SATURATION = 0.22;
const CURSOR_MIN_SATURATION = 0.28;

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
	if (relativeLuminance(c) > maxLum) {
		c = scaleLuminance(c, maxLum);
	}
	return c;
}

function isMagentaHue(h: number): boolean {
	return h >= 270 && h <= 330;
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

export function pickUiAccent(
	colors: GhosttyColors,
	strategy: AccentStrategy,
): { accent: string; magenta: string } {
	const bg = colors.background;
	const fg = colors.foreground;
	const isDark = relativeLuminance(bg) < DARK_BG_LUM_THRESHOLD;

	const link = colors.palette[4] || "#61afef";
	const blue = colors.palette[4] || link;
	const magenta = colors.palette[5] || "#c678dd";
	const cyan = colors.palette[6] || "#56b6c2";
	const warning = colors.palette[3] || "#e5c07b";

	if (strategy === "link") {
		return { accent: ensureAccentContrast(link, bg, isDark), magenta };
	}
	if (strategy === "blue") {
		return { accent: ensureAccentContrast(blue, bg, isDark), magenta };
	}

	if (strategy === "cursor" && colors.cursorColor && isDistinctFromFgBg(colors.cursorColor, fg, bg)) {
		const { s } = rgbToHsv(colors.cursorColor);
		if (s >= CURSOR_MIN_SATURATION) {
			return {
				accent: ensureAccentContrast(colors.cursorColor, bg, isDark),
				magenta,
			};
		}
	}

	const candidates = paletteCandidates(colors);
	const scored = candidates
		.map((hex) => {
			const { h, s, v } = rgbToHsv(hex);
			const cr = contrastRatio(hex, bg);
			const magentaPenalty = isMagentaHue(h) ? 0.35 : 1;
			const satScore = s >= MIN_ACCENT_SATURATION ? s : s * 0.5;
			const blueBonus = h >= 200 && h <= 260 ? 1.15 : 1;
			const score = cr * satScore * (v + 0.2) * magentaPenalty * blueBonus;
			return { hex, h, s, score, cr };
		})
		.filter((x) => x.cr >= (isDark ? 2.5 : 3.0) && x.s >= 0.12)
		.sort((a, b) => b.score - a.score);

	// Prefer blue (slot 4) when it scores reasonably — matches Iceberg / most themes
	const slot4 = colors.palette[4];
	if (slot4) {
		const s4 = scored.find((x) => x.hex.toLowerCase() === slot4.toLowerCase());
		const best = scored[0];
		if (s4 && (!best || s4.score >= best.score * 0.85)) {
			return { accent: ensureAccentContrast(slot4, bg, isDark), magenta };
		}
	}

	if (scored.length > 0) {
		return { accent: ensureAccentContrast(scored[0].hex, bg, isDark), magenta };
	}

	return { accent: ensureAccentContrast(link, bg, isDark), magenta };
}

export function pickAccentAlt(colors: GhosttyColors, accent: string, magenta: string): string {
	const bg = colors.background;
	const { h: accentHue } = rgbToHsv(accent);
	const cyan = colors.palette[6];
	if (cyan && hueDistance(rgbToHsv(cyan).h, accentHue) > 35) {
		return cyan;
	}
	if (magenta && hueDistance(rgbToHsv(magenta).h, accentHue) > 40) {
		return magenta;
	}
	const warning = colors.palette[3];
	if (warning && hueDistance(rgbToHsv(warning).h, accentHue) > 25) {
		return warning;
	}
	return colors.palette[6] || magenta || accent;
}

function getLuminance(hex: string): number {
	return relativeLuminance(hex);
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

export function generatePiTheme(
	colors: GhosttyColors,
	themeName: string,
	accentStrategy: AccentStrategy = "auto",
): object {
	const bg = colors.background;
	const fg = colors.foreground;
	const isDark = getLuminance(bg) < 0.5;

	const error = colors.palette[1] || "#cc6666";
	const success = colors.palette[2] || "#98c379";
	const warning = colors.palette[3] || "#e5c07b";
	const link = colors.palette[4] || "#61afef";

	const { accent, magenta } = pickUiAccent(colors, accentStrategy);
	const accentAlt = pickAccentAlt(colors, accent, magenta);
	const syntaxMagenta = magenta;

	const muted = mixColors(fg, bg, 0.65);
	const dim = mixColors(fg, bg, 0.45);
	const borderMuted = mixColors(fg, bg, 0.25);

	const bgShift = isDark ? 12 : -12;
	const selectedBg = adjustBrightness(bg, bgShift);
	const userMsgBg = adjustBrightness(bg, Math.round(bgShift * 0.7));
	const toolPendingBg = adjustBrightness(bg, Math.round(bgShift * 0.4));
	const toolSuccessBg = mixColors(bg, success, 0.88);
	const toolErrorBg = mixColors(bg, error, 0.88);
	const customMsgBg = mixColors(bg, accent, 0.92);

	return {
		$schema:
			"https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
		name: themeName,
		vars: {
			bg,
			fg,
			accent,
			accentAlt,
			link,
			magenta: syntaxMagenta,
			error,
			success,
			warning,
			muted,
			dim,
			borderMuted,
			selectedBg,
			userMsgBg,
			toolPendingBg,
			toolSuccessBg,
			toolErrorBg,
			customMsgBg,
		},
		colors: {
			accent: "accent",
			border: "link",
			borderAccent: "link",
			borderMuted: "borderMuted",
			success: "success",
			error: "error",
			warning: "warning",
			muted: "muted",
			dim: "dim",
			text: "",
			thinkingText: "muted",

			selectedBg: "selectedBg",
			userMessageBg: "userMsgBg",
			userMessageText: "",
			customMessageBg: "customMsgBg",
			customMessageText: "",
			customMessageLabel: "link",
			toolPendingBg: "toolPendingBg",
			toolSuccessBg: "toolSuccessBg",
			toolErrorBg: "toolErrorBg",
			toolTitle: "",
			toolOutput: "muted",

			mdHeading: "warning",
			mdLink: "link",
			mdLinkUrl: "dim",
			mdCode: "link",
			mdCodeBlock: "success",
			mdCodeBlockBorder: "muted",
			mdQuote: "muted",
			mdQuoteBorder: "muted",
			mdHr: "muted",
			mdListBullet: "link",

			toolDiffAdded: "success",
			toolDiffRemoved: "error",
			toolDiffContext: "muted",

			syntaxComment: "muted",
			syntaxKeyword: "accent",
			syntaxFunction: "link",
			syntaxVariable: "accentAlt",
			syntaxString: "success",
			syntaxNumber: "accentAlt",
			syntaxType: "accentAlt",
			syntaxOperator: "fg",
			syntaxPunctuation: "muted",

			thinkingOff: "borderMuted",
			thinkingMinimal: "muted",
			thinkingLow: "link",
			thinkingMedium: "accentAlt",
			thinkingHigh: "accent",
			thinkingXhigh: "warning",

			bashMode: "success",
		},
		export: {
			pageBg: isDark ? adjustBrightness(bg, -8) : adjustBrightness(bg, 8),
			cardBg: bg,
			infoBg: mixColors(bg, warning, 0.88),
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