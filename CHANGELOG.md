# Changelog

## 0.3.6 — 2026-06-17

### Changed

- **Independent of other extensions**: no hooks into pi-claude-style-tools; always `setTheme` after writing theme file (including when name unchanged) so pi reloads JSON.

## 0.3.5 — 2026-06-17

- Removed: cross-extension palette bust (reverted in 0.3.6).

## 0.3.4 — 2026-06-17

### Fixed

- Light mode: softer `dim` / `muted` for tool ○ and labels; `success` keeps Ghostty green without over-darkening.

## 0.3.3

- macOS system appearance polling (`followSystemAppearance`).

## 0.3.2

- Follow macOS Light/Dark while pi runs.

## 0.3.0

- Curated-style theme mapping; cursor accent; Jellybeans-like sync.

## 0.2.0

- Initial smart accent (no forced ANSI magenta).