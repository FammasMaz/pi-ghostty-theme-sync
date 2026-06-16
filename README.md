# pi-ghostty-theme-sync

Sync [pi](https://github.com/earendil-works/pi) with your active [Ghostty](https://ghostty.org/) colors — without painting the whole UI ANSI magenta.

Fork/improvement of [@ogulcancelik/pi-ghostty-theme-sync](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-ghostty-theme-sync). The original maps **palette[5] (magenta)** directly to pi’s **`accent`**, which drives borders, list bullets, inline code, thinking levels, and more. Most terminal themes keep purple in slot 5 for shell highlighting, so pi looked purple everywhere.

This package:

- Picks a **UI accent** with contrast/saturation heuristics (same idea as [Starship Ghostty sync](https://github.com/FammasMaz/dotfiles/blob/main/lib/sync_starship_ghostty_palette.py) in dotfiles).
- Prefers **blue / link (palette 4)** for chrome: `borderAccent`, `mdCode`, `mdListBullet`, `customMessageLabel`.
- Keeps **magenta in `vars.magenta`** for syntax where it belongs; keywords use the chosen UI accent.
- Supports **`light:…,dark:…`** Ghostty theme pairs via optional appearance override.
- Bumps theme hash when the mapping algorithm changes so stale themes are regenerated.

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
    "accentStrategy": "auto"
  }
}
```

| Field | Values | Default |
|--------|--------|---------|
| `appearance` | `auto`, `light`, `dark` | `auto` — when Ghostty uses `theme = light:Foo,dark:Bar`, `light`/`dark` load that side’s theme file instead of only `+show-config` (macOS often shows the light side in show-config). |
| `accentStrategy` | `auto`, `link`, `blue`, `cursor` | `auto` — score ANSI colors for contrast/saturation; deprioritize magenta hue; prefer slot 4 when competitive. `link`/`blue` force palette 4. `cursor` uses `cursor-color` when saturated and distinct from fg/bg. |

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