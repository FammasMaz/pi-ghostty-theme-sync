# pi-ghostty-theme-sync

Sync [pi](https://github.com/earendil-works/pi) with your active [Ghostty](https://ghostty.org/) colors — without painting the whole UI ANSI magenta.

Fork/improvement of [@ogulcancelik/pi-ghostty-theme-sync](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-ghostty-theme-sync).

Goals:

- **Match curated pi themes** (e.g. Jellybeans): same `colors` template as [pi-curated-themes](https://github.com/victor-software-house/pi-curated-themes) — accent on chrome, `secondary` for links, `gray` from palette 8.
- **UI accent from `cursor-color`** when saturated (Jellybeans orange `#ffa560`), not blind ANSI magenta.
- **`light:Foo,dark:Bar` pairs**: resolves the active side via macOS appearance (`AppleInterfaceStyle`) or `ghosttyThemeSync.appearance`.
- **Light themes**: down-rank magenta ANSI slot 5 so Iceberg-style themes don’t go full purple.
- Optional `accentStrategy`: `auto` (default), `cursor`, `link`, `ansi5` (legacy).

## Install

```bash
pi install git:github.com/FammasMaz/pi-ghostty-theme-sync
# or after npm publish:
# pi install npm:@fammasmaz/pi-ghostty-theme-sync
```

Replace the old package in `~/.pi/agent/settings.json`:

```diff
- "npm:@ogulcancelik/pi-ghostty-theme-sync"
+ "git:github.com/FammasMaz/pi-ghostty-theme-sync"
```

## Settings

In `~/.pi/settings.json` or `~/.pi/agent/settings.json`:

```json
{
  "ghosttyThemeSync": {
    "appearance": "auto",
    "accentStrategy": "auto",
    "followSystemAppearance": true
  }
}
```

| Field | Values | Default |
|--------|--------|---------|
| `appearance` | `auto`, `light`, `dark` | `auto` — when Ghostty uses `theme = light:Foo,dark:Bar`, `light`/`dark` load that side’s theme file instead of only `+show-config` (macOS often shows the light side in show-config). |
| `followSystemAppearance` | `true`, `false` | `true` on macOS when `appearance` is `auto` — polls system light/dark every ~3s and re-runs sync (Iceberg ↔ Jellybeans, etc.). Set `false` to only sync at pi startup and `/ghostty-sync`. |
| `accentStrategy` | `auto`, `cursor`, `link`, `blue`, `ansi5` | `auto` — `cursor-color` first, else best-scoring ANSI (magenta penalized on **light** bg only). `cursor` — cursor then palette. `link`/`blue` — palette 4. `ansi5` — old behavior (palette 5). |

## Commands

- `/ghostty-sync` — regenerate theme from Ghostty and apply immediately.

## Generated files

- `~/.pi/agent/themes/ghostty-sync-<hash>.json` — hash includes palette, cursor, algorithm version, and `accentStrategy`.
- Older `ghostty-sync-*.json` files are removed on each sync.

## Requirements

- Ghostty installed; `ghostty` on `PATH`
- Node ≥ 18

## Mapping (summary)

| Source | pi var / token |
|--------|----------------|
| `background` / `foreground` | `bg`, `fg`, derived `muted` / `dim` / `borderMuted` |
| `palette[1..3]` | `error`, `success`, `warning` |
| `palette[4]` | `link`; primary UI chrome when accent strategy is link/auto |
| `palette[5]` | `magenta` var (syntax), not global UI accent |
| `palette[6]` | `accentAlt` when distinct from UI accent |
| Smart pick | `accent` — UI highlights, syntax keywords, thinking high |

## License

MIT