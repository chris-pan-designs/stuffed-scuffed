# Stuffed & Scuffed Product Overview

Stuffed & Scuffed is a playful mobile app for turning photos into soft, animated plushies. The core experience is a cozy plush playpen: users add a photo, the app turns it into a plush-like object, and the plushies bounce, tumble, collide, get named, get petted, party, and can be scrapped when the user is done with them.

The app is intentionally toy-like rather than utility-like. It is built around tactile motion, soft colors, silly interactions, and the feeling that the user's photos have become little stuffed characters.

## Product Concept

The main promise of the app is:

> Turn any photo into a weird little plush friend.

Users can make plushies from their camera or photo library, collect multiple plushies in one play area, interact with them physically, and focus on individual plushies to name, pet, rotate, or delete them.

The product tone is cozy, playful, soft, minimal, and a little strange. It should feel more like a plush toy/photo playpen than a photo editor.

## Main Screen

The main screen is the entire app experience. There is no marketing landing page or separate onboarding flow.

The screen is made of two primary regions:

- A large plush play area where plushies live and move.
- A bottom action dock for adding, editing, partying, and deleting plushies.

The play area uses a warm cream background, rounded raised frame, dashed inner border, and soft shadow. It is designed to feel like a padded container or small toy box.

## Plush Creation

Users can create plushies in two ways:

- **Library**: choose an existing image from the device photo library.
- **Camera**: take a new photo with the device camera.

When a photo is selected or captured, the app normalizes it into a PNG and resizes it if needed so the longest side is no larger than `1024px`.

Background removal support exists in the codebase, but it is currently disabled:

```ts
SHOULD_USE_BACKGROUND_REMOVAL_API = false
```

With the API disabled, the app uses the normalized image directly as the plush source.

While the app prepares a new plush, it shows a playful loading state with a scribbling GIF and a `Stuffing...` label. Existing plushies fade back visually during this preparation/naming flow so the new plush can become the center of attention.

## Plush Play Area

Once plushies are created, they appear inside the main play area as soft 3D-ish objects built from the photo image.

Plushies can:

- Fall into the play area.
- Bounce against the container edges.
- Collide with other plushies.
- Rotate and tumble.
- Cast soft shadows.
- Squash, stretch, dent, wobble, and recover after impacts.
- Be dragged and thrown by the user.

The physical behavior is meant to feel plush and handmade, not perfectly realistic. Impacts create softness effects like squashing, wobbling, bending, and denting so each plush feels like a stuffed object rather than a flat image.

## Dragging And Throwing

In the normal play state, users can drag plushies around the play area.

While dragging, the plush hangs from the grabbed point and can rotate based on the drag motion. When released, it keeps some release velocity and torque so it can tumble naturally.

If the user taps a plush instead of dragging it, the app enters focused plush mode.

## Focused Plush Mode

When a plush is selected, it moves into a focused presentation state:

- The selected plush floats near the center of the play area.
- Other plushies fade out.
- The selected plush idles gently.
- The plush can be rotated by touch.
- A name tag appears above the plush.
- The bottom dock changes from global actions to focused actions.

Tapping empty space exits focused mode. If the user is editing the plush name, tapping empty space finishes editing and returns to focused mode.

## Naming

Every plush can have a name.

When a new plush is created, the app moves into a naming flow. The name tag appears above the plush with the placeholder:

```text
Give them a name!
```

Users can also rename an existing plush from focused mode using the **Edit** action.

If the user submits an empty name, the app assigns a fallback name based on the plush's position in the collection, such as:

```text
plush 1
```

The name tag has a max width of `280px`, with text capped at `256px`. Long names stay on one line and are visually constrained inside the tag.

## Main Dock

The normal bottom dock contains four global actions:

- **Library**: choose a photo from the photo library.
- **Camera**: take a new photo.
- **Party**: toggle party mode.
- **Reset**: delete all current plushies after confirmation.

Each dock button is styled like a soft raised toy control with:

- Rounded outer frame.
- Colored inner fill.
- Dashed inner border.
- Icon and label.
- Pressed scale feedback.

When there are no plushies, reset is disabled.

## Focused Dock

When a plush is focused, the dock switches to focused plush actions:

- **Back**: return to the full playpen.
- **Pet**: play the petting interaction.
- **Edit**: edit the plush name.
- **Scrap**: delete the focused plush after confirmation.

This keeps focused interactions close to the selected plush and removes unrelated global actions from the immediate flow.

## Petting

Focused plushies can be petted.

When the user taps **Pet**:

- A petting GIF appears over the top of the plush.
- The plush responds with a squash/softness effect.
- The name tag fades out while petting is active.
- The petting animation plays for three loops.

The effect is intentionally affectionate and toy-like. It gives the plush a small moment of personality rather than acting like a productivity command.

## Party Mode

Party mode transforms the playpen into a darker, more celebratory scene.

When enabled:

- The play area darkens.
- A moving gradient wash appears.
- Sparkles overlay the play area.
- A disco ball GIF appears near the top.
- Dock colors switch to darker party-mode tones.
- Plushies receive periodic party impulses so they bounce and tumble more energetically.

Party mode is exited automatically when the user starts camera/library creation or focuses a plush.

## Reset And Scrap

The app supports two destructive flows:

- **Reset**: delete all plushies.
- **Scrap**: delete the currently focused plush.

Both flows use a confirmation modal before deleting.

Reset asks:

```text
Are you sure you want to delete all of your current plushies?
```

Focused scrap asks:

```text
Are you sure you want to delete this plush?
```

Deletion is animated rather than instant. Plushies shake, gather or focus depending on the flow, and then a `poof.gif` appears as the plush or group disappears.

## Confirmation Modal

The confirmation modal is used for destructive actions. It has:

- A dimmed full-screen overlay.
- A rounded raised modal frame.
- A dashed inner card.
- Clear cancel and confirm actions.

The modal follows the same soft visual language as the rest of the app, so even destructive flows still feel consistent with the plush toy world.

## Visual Style

The app uses a soft pastel interface with warm cream surfaces, rounded frames, dashed strokes, and gentle shadows.

The main visual ingredients are:

- Warm cream backgrounds.
- Pastel dock buttons.
- Rounded cards and controls.
- Dashed inner borders.
- Soft drop shadows.
- SemiBold Plus Jakarta Sans typography.
- GIF overlays for playful effects.

The interface should avoid sharp, technical, glassy, or enterprise-feeling UI. It should feel crafted, soft, and friendly.

## Current Asset Set

The app currently uses these playful animated assets:

- `scribbling.gif` for plush creation/loading.
- `petting.gif` for the pet interaction.
- `poof.gif` for deletion.
- `sparkles.gif` for party mode.
- `disco.gif` for party mode.

It also uses custom SVG icons for camera, photo library, party, reset, back, edit, pet, and delete actions.

## Permissions

The app requests device permissions only when needed:

- Photo library permission when the user taps **Library**.
- Camera permission when the user taps **Camera**.

If permission is denied, the app shows a short alert explaining what access is needed.

## Current Product State

The current app is a single-screen plush creation and play experience. The main feature set includes:

- Photo-based plush creation.
- Camera capture.
- Photo library import.
- Animated plush playpen.
- Dragging, throwing, collision, bouncing, and soft-body reactions.
- Focused plush mode.
- Plush naming and renaming.
- Petting interaction.
- Party mode.
- Single plush deletion.
- Delete-all reset.
- Confirmation modal for destructive actions.

There is no account system, cloud saving, gallery, sharing flow, onboarding, or monetization flow currently represented in the app.

## Product Direction Notes

The strongest parts of the experience are the toy-like plush physics and the focused plush interactions. Future product additions should probably preserve that directness: users should be able to make a plush quickly, play with it immediately, and discover charming behaviors through touch.

Good future-fit feature ideas would be things like plush collections, sharing, stickers, outfits, room themes, or saved playpens. Features that turn the app into a heavy photo editor or management tool would likely fight the current product personality.
