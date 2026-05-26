# Stuffed & Scuffed Design System Specs

This document describes the current visual system for the Stuffed & Scuffed mobile app. The product is a cozy plush/photo playpen app with a soft pastel interface, rounded raised controls, dashed inner frames, and playful object interactions.

## Design Personality

- Cozy, playful, soft, minimal, and polished.
- The UI should feel like a plush playpen or small toy/photo app.
- Avoid sharp, technical, glassy, or high-contrast enterprise styling.
- Use warm cream backgrounds, pastel button fills, rounded frames, dashed strokes, and soft shadows.

## Global Foundation

### App Background

- Main screen background: `#FCF1E9`
- Main play surface background: `#FCF1E9`
- Raised surface/card background: `#FBF5EF`

### Dark / Party Mode Background

- Party play area background: `#0D0D0D`
- Party gradient colors:
  - `#0D0D0D`
  - `#171717`
  - `#252525`
  - `#191919`
  - `#0D0D0D`
- Party gradient opacity: `0.5`
- Party vignette:
  - Top: `rgba(0, 0, 0, 0.32)`
  - Middle: `rgba(0, 0, 0, 0.08)`
  - Bottom: `rgba(0, 0, 0, 0.42)`

### Shared Shadow

Use this shadow for raised cards, buttons, name tags, loading tags, and modals.

```css
shadow-color: #000000;
shadow-offset: 0px 4px;
shadow-opacity: 0.16;
shadow-radius: 16px;
```

React Native elevation: `7` for most controls, `8` for modal outer container.

## Typography

### Primary UI Font

- Font family: `Plus Jakarta Sans`
- Weight: `600` / SemiBold
- Letter spacing: `0px`

### Button Label

- Font size: `12px`
- Font weight: `600`
- Line height: `14px`
- Text align: center

### Name Tag Text

- Font size: `14px`
- Font weight: `600`
- Line height: `22px`
- Color: `#C8741D`
- Letter spacing: `0px`
- Text should stay on one line.
- Max name tag width: `280px`
- Max text width: `256px`

### Name Input Placeholder

- Placeholder text: `Give them a name!`
- Placeholder color: `rgba(200, 116, 29, 0.3)`
- Same font specs as name tag text.

### Modal Title Text

- Font size: `15px`
- Font weight: `600`
- Line height: `19px`
- Color: `#B22683`
- Text align: center

### Loading Label Text

- Text: `Stuffing...`
- Font size: `14px`
- Font weight: `600`
- Line height: `22px`
- Color: `#F47F86`

## Iconography

- Icons are SVG-based.
- Default icon size inside action buttons: `24px x 24px`
- Icons inherit the button tone primary color.
- Secondary/accent icon details can use opacity around `0.28`.
- Use soft, rounded icon forms rather than sharp geometric icons.

## Main Plush Play Area

The plush area is the large rounded container where plushes bounce, collide, float, and are edited.

### Layout

- Fills available vertical space between status area and bottom dock.
- Horizontal margin: `16px` left and right.
- Outer frame padding: `4px`
- Children are clipped inside the rounded inner play area.

### Outer Frame

- Background: `#FBF5EF`
- Border radius: `22px`
- Padding: `4px`
- Border: none
- Shadow: shared raised shadow

### Inner Frame

- Background: `#FCF1E9`
- Border radius: `22px`
- Overflow: hidden

### Dashed Play Area Stroke

The dashed stroke is rendered as an overlay.

- Stroke color: `#D9A4DC`
- Stroke width: `2px`
- Dash length: `12px`
- Dash gap: `10px`
- Stroke cap: square / butt
- Corner radius: `28px`
- Stroke inset: `1px`
- Hidden during party mode.

## Bottom Dock

### Layout

- Left padding: `20px`
- Right padding: `20px`
- Top padding: `16px`
- Bottom padding: max safe-area inset or `32px`
- Button row gap: `8px`
- Buttons fill available device width.
- Dock button stage height: `69px`

### Main Dock Buttons

Main dock actions:

- Library
- Camera
- Party
- Reset

Focused dock actions:

- Back
- Pet
- Edit
- Scrap

### Action Button Structure

Every action button has two nested frames: an outer raised frame and an inner dashed frame.

#### Outer Button Frame

- Flex: fill available width
- Height: controlled by row/stage, currently `69px`
- Background: tone `outerBackground`, usually `#FBF5EF`
- Border radius: `22px`
- Padding: `4px`
- Border: none
- Shadow: shared raised shadow
- Pressed scale: `0.97`
- Disabled opacity: `0.3`

#### Inner Button Frame

- Width: `100%`
- Height: `100%`
- Background: tone `background`
- Border radius: `18px`
- Layout: vertical
- Align icon and label center
- Gap between icon and text: `4px`
- Padding: `0px`

#### Inner Dashed Stroke

- Stroke width: `2px`
- Dash length: `6px`
- Dash gap: `6px`
- Stroke cap: square / butt
- Radius: `18px`
- Stroke inset: `1px`

## Button Color Tokens

### Main Dock - Light Mode

| Button | Inner Fill | Dashed Stroke | Outer Fill | Icon/Label |
|---|---|---|---|---|
| Library | `#F9DDF1` | `#E8A1DD` | `#FBF5EF` | `#B22683` |
| Camera | `#E3F0F8` | `#7CBCEB` | `#FBF5EF` | `#2865B8` |
| Party | `#E8DDFC` | `#B89CF0` | `#FBF5EF` | `#5D35A7` |
| Reset | `#E8F2EC` | `#9ACBC2` | `#FBF5EF` | `#1F6762` |

### Main Dock - Party Mode / Dark

| Button | Inner Fill | Dashed Stroke | Outer Fill | Icon/Label |
|---|---|---|---|---|
| Library | `#3A2028` | `#8E3E55` | `#1F1F1F` | `#FFB3C8` |
| Camera | `#1C2A38` | `#416D95` | `#1F1F1F` | `#A9D8FF` |
| Party | `#2B2240` | `#7256A8` | `#1F1F1F` | `#D8C4FF` |
| Reset | `#1D312E` | `#4A7E77` | `#1F1F1F` | `#A9DED5` |

### Focused Dock

| Button | Inner Fill | Dashed Stroke | Outer Fill | Icon/Label |
|---|---|---|---|---|
| Back | `#EAFBDF` | `#B8ECAF` | `#FBF5EF` | `#5BA81E` |
| Pet | `#DCF7F7` | `#73DCE3` | `#FBF5EF` | `#28ACB8` |
| Edit | `#FFF4E8` | `#F0B46B` | `#FBF5EF` | `#C8741D` |
| Scrap | `#FFE6EA` | `#F3A5AD` | `#FBF5EF` | `#BF2C4D` |

## Focused Plush State

When a plush is selected:

- Selected plush floats to the middle/focus position.
- Other plushes fade out.
- The selected plush idles gently.
- The plush can be freely rotated.
- The name tag sits above the plush with a consistent `40px` gap.
- The focused dock replaces the main dock.
- Empty space exits focused mode unless editing a name, in which case it exits editing and returns to focused mode.

### Name Tag

- Background: `#FBF5EF`
- Border radius: `12px`
- Padding horizontal: `12px`
- Padding vertical: `8px`
- Shadow: shared raised shadow
- Max width: `280px`
- Text max width: `256px`
- Text color: `#C8741D`
- Font: Plus Jakarta Sans SemiBold, `14px`, line height `22px`

## Loading State

Shown while preparing/removing background for a new plush.

### Loading Layout

- Centered in plush play area.
- Vertical gap between scribble GIF and label: `26px`
- Loading visual fades in/out.
- Other existing plushes fade out while loading/naming.

### Scribble GIF

- Width: `240px`
- Height: `240px`
- Resize mode: contain
- Translated `-12px` on X axis for optical centering.

### Loading Label

Two-layer button-like tag.

Outer:

- Background: `#FBF5EF`
- Border radius: `12px`
- Padding: `4px`
- Shadow: shared raised shadow

Inner:

- Background: `#FFE5E6`
- Border radius: `12px`
- Padding horizontal: `12px`
- Padding vertical: `8px`
- Dashed stroke:
  - Color: `#FFB6BD`
  - Width: `2px`
  - Dash: `6px 6px`

Text:

- `Stuffing...`
- Color: `#F47F86`
- Plus Jakarta Sans SemiBold
- Font size: `14px`
- Line height: `22px`

## Confirmation Modal

Used for reset all plushes and focused plush deletion.

### Overlay

- Full screen overlay
- Background: `rgba(0, 0, 0, 0.2)`
- Horizontal padding: `20px`
- Fade in/out animation

### Modal Outer Frame

- Width: `288px`
- Background: `#FBF5EF`
- Border radius: `32px`
- Padding: `4px`
- Shadow: shared raised shadow
- Elevation: `8`

### Modal Inner Card

- Background: `#FBF5EF`
- Border radius: `28px`
- Border width: `2px`
- Border style: dashed
- Border color: `#D9A4DC`
- Padding horizontal: `28px`
- Padding vertical: `28px`
- Content gap: `20px`
- Align items: center

### Modal Text

Reset all plushes:

```text
Are you sure you want to delete all of your current plushies?
```

Delete focused plush:

```text
Are you sure you want to delete this plush?
```

Text style:

- Color: `#B22683`
- Font size: `15px`
- Font weight: `600`
- Line height: `19px`
- Text align: center

### Modal Buttons

- Buttons fill the modal action row.
- Action row gap: `8px`
- Modal button frame height: `69px`
- Uses the same action button specs as dock buttons.

## Party Mode

Party mode changes the play area and dock styling.

### Visual Layers

Layer order:

1. Room/background
2. Dark play area/party gradient
3. Sparkles GIF overlay
4. Plushes
5. Disco ball GIF
6. UI controls

### Party Assets

- Disco ball GIF:
  - Width: `180px`
  - Height: `180px`
  - Position: top center of play area
  - Resize mode: contain
- Sparkles GIF:
  - Full play area overlay
  - Resize mode: cover

### Party Motion

- Party chrome transition duration when entering: `1100ms`
- Party chrome transition duration when exiting: `320ms`
- Gradient wash loops every `9000ms` forward and `9000ms` back.

## Plush Interaction Specs

### Plush Creation

- Images are normalized to PNG before plush creation.
- Max preprocessing size: `1024px` on the longest side.
- Background removal API is currently gated by:

```ts
SHOULD_USE_BACKGROUND_REMOVAL_API = false
```

Set this to `true` to re-enable remove.bg.

### Plush Mesh Feel

Current 3D/puff values:

- Target plush size: `1.4`
- Puff amount: `0.215`
- Edge volume amount: `0.08`
- Flat edge band: `0.055`
- Side silhouette smoothing: `0.32`

### Delete / Scrap Effects

Single plush deletion:

- Confirmation modal fades in.
- Name tag fades out.
- Plush ramps into a shake.
- `poof.gif` appears centered on the plush.
- Remaining plushes wait `500ms`, then fade back in over roughly `500ms`.

Delete all/reset:

- Plushes gather toward center and spread slightly.
- Plushes ramp into a shake.
- `poof.gif` appears over the cluster.
- Plushes are removed.

### Pet Effect

- Focused dock includes a Pet action.
- Petting GIF overlays the top of the selected plush.
- Name tag fades out during petting.
- Plush squashes in response to petting.
- Petting GIF plays 3 loops.

## Motion Tokens

### General

- Use smooth ease-out cubic for entering.
- Use smooth ease-in cubic for exiting.
- Prefer subtle animation over exaggerated movement.

### Button Press

- Pressed scale: `0.97`

### Loading Fade

- Fade in duration: `260ms`
- Fade out duration: `140ms`

### Modal Fade

- Fade in duration: `180ms`
- Fade out duration: `140ms`

### Dock Transition

- Main and focused dock layers animate opacity/position.
- Vertical fade offset is subtle, around `8px`.

## Accessibility / Interaction Rules

- Buttons should use clear text labels.
- Destructive actions require confirmation modal.
- Disabled controls use opacity `0.3`.
- Decorative overlays such as sparkles, poof, party visuals, and loading visuals should not block touch interactions unless intentionally modal.

## Implementation Notes for Google Stitch

- Build all buttons from one reusable action button component.
- Use tone tokens for button color variations.
- Preserve the two-layer raised/dashed structure for action buttons, loading label, play area, and modal.
- Preserve Plus Jakarta Sans SemiBold as the primary type style.
- Preserve the warm cream/pastel palette.
- Avoid glassmorphism; the current style intentionally moved away from glass.
- Avoid marketing-page/hero styling. This is an app/tool surface, not a landing page.
