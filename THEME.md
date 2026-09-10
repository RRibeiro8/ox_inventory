# River City theme

The theme is **one stylesheet plus two variable fonts**. No component or logic
changes, so it survives an ox_inventory upgrade with a rebuild.

Built against **ox_inventory 2.47.9** (`overextended/ox_inventory`).

## Rebuild and deploy

The theme lives in this repo now, so a build needs no copying:

```bash
cd web
bun install --frozen-lockfile   # bun, not npm: npm fails on a react-redux peer dep
bun run build
cp -a build "<server-data>/resources/[ox]/ox_inventory/web/build"
```

Deploy **only `web/build`**. The rest of the installed resource carries Qbox's
customised `data/items.lua` and ~181 item images upstream does not ship - a
wholesale copy would lose both.

Preview without touching the game server:

```bash
<workspace>/tools/preview.sh <path-to-this-repo>/web
```

## Two things that are easy to get wrong

**The fxmanifest must serve the fonts.** Stock `files {}` lists only `*.js` and
`*.css` under `web/build/assets/`. Without `'web/build/assets/*.woff2'` the fonts
404 silently and everything falls back to system monospace:

```lua
files {
    ...
    'web/build/assets/*.css',
    'web/build/assets/*.woff2',
    'web/build/assets/*.png',
}
```

**Never replace the whole resource with the upstream repo.** The Qbox deploy
customises `data/items.lua` and ships ~181 extra item images in `web/images/`
that upstream does not have. Only `web/build` is ours.

## Layout

Both grids stack on the left so the centre of the screen stays clear. Reading
down the column: **primary inventory, control row, secondary inventory**.

The control row is `logo | input | Use | Give | Close`. The logo is `::before`
on `.inventory-control-wrapper` - on a flex container that is a real flex item,
so it leads the row with no component change. The controls sit between the grids
simply by leaving their source order alone (Left, Control, Right).

### Icon buttons

Use/Give/Close show icons instead of text, with the name as a hover tooltip.
They are targeted by the classes our fork adds (`inventory-control-use`,
`-give`, `-close`), not by DOM position, so adding or reordering a button
upstream can no longer put the wrong icon on the wrong button.

This is why the fork exists. The positional `:nth-of-type` version broke the
moment we added the stepper buttons - two new `<button>` elements in the same
row would have shifted every icon.

Use and Give are a deliberate pair: arrow *into* the tray vs *out of* it. The
icon database had no match for "use", so that one is hand-authored.

Height is the binding constraint. The column computes to ~82.3vh:

    header 3 + grid 34 + controls 5.5 + header 3 + grid 34 + gaps 3

Slots are 8vh with 4 visible rows. Capacity is unchanged - the grid holds
whatever the server gives it and the rest scrolls. Raising either number, or
adding another element to the column, pushes past the safe zone; trade one
against another rather than just adding.

## Rollback

The stock bundle and manifest are kept alongside:

```bash
cd "<server-data>/resources/[ox]/ox_inventory"
rm -rf web/build && mv web/build.stock-2.47.9 web/build
mv fxmanifest.lua.stock fxmanifest.lua
```

## Known upstream bug (not ours)

The console logs `Unable to load file web/build/none for resource ox_inventory`
once per empty slot. Upstream ox_inventory 2.47.9 does this in three files:

```tsx
backgroundImage: `url(${item?.name ? getItemUrl(item) : 'none'}`,
```

Two faults in one line: the template literal never closes its `)`, and empty
slots emit the literal string `none` as a URL, which CEF resolves to
`web/build/none`. Verified byte-identical in the stock bundle, so it pre-dates
this theme. Cosmetic - console noise only. Fixing it means editing
`InventorySlot.tsx`, `InventoryHotbar.tsx` and `ItemNotifications.tsx`:

```tsx
backgroundImage: item?.name ? `url(${getItemUrl(item as SlotWithItem)})` : 'none',
```

## Design

Follows `.claude/skills/nui-design`. Cyan is the single accent; magenta is
reserved for danger and low durability. Chamfered corners via `clip-path`,
static scanlines on the tooltip, neon glow via `box-shadow`/`text-shadow` -
all cheap. `backdrop-filter` is used on exactly one surface (the controls
modal). Transitions are `transform`/`opacity` only, 140-180ms.

Orbitron and JetBrains Mono are both **variable** fonts: one file each covers
the whole weight range, declared with `font-weight: 400 900` / `100 800`.
Declaring per-weight faces just ships the same bytes repeatedly.
