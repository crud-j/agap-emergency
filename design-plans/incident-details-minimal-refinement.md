# Plan — Incident details: official AGAP logo + minimal cleanup

## Status
Executed on commit `4688f59` (working tree). All three changes (A/B/C) applied to `mobile/app/incidents/[id].tsx`; style cleanup done; no orphaned references; no new `tsc` errors beyond the repo's pre-existing Ionicons/`@types/react` noise.

## Provenance
- Repo: `agap-emergency` (pnpm monorepo).
- Base commit at authoring: `4688f59`.
- Target file at authoring had uncommitted local edits (`git status` → ` M mobile/app/incidents/[id].tsx`). Re-read the file before editing; line numbers below are from the audited state and may have shifted.

## Scope
One surface, one file: `mobile/app/incidents/[id].tsx` (the citizen "Incident Details" screen). Make the header read as "clean/professional/minimal" by (A) replacing the hand-built brand placeholder with the official AGAP wordmark, (B) removing the triplicated incident-type chip, and (C) trimming one line of non-informational header copy. No other files change. No behavior, data, routing, or navigation changes.

This is a presentation-only change. Do **not** alter the tab logic, queries, live-tracking, map wiring, or any `on*` handlers.

## Design system in force (for the executor)
- This surface has **no `DESIGN.md`** and does **not** use the shared `@/src/theme/tokens`. It owns an in-file palette object `C` (defined ~line 145) and a `SHADOW` object (~line 163), consumed through a local `StyleSheet.create` named `styles` (~line 979). Reuse those; do not introduce new colors or a new token source.
- Brand exemplar to match: `mobile/app/home/index.tsx` renders the official logo as
  `<Image source={require('../../assets/icons/agap-icon.png')} style={styles.headerLogo} resizeMode="contain" />`
  with `headerLogo: { width: 130, height: 44 }`.
- Asset facts (verified): `assets/icons/agap-icon.png` is the **full horizontal wordmark** — it already contains the teal "A" mark, the word "AGAP", and the tagline "Incident Management Platform". Therefore the separate text "AGAP" + tagline in the current app bar are redundant once the image is used.
- Path from this file: `mobile/app/incidents/[id].tsx` → `../../assets/icons/agap-icon.png` resolves to `mobile/assets/icons/agap-icon.png` (same relative depth as the home exemplar).

## Change A — Replace the placeholder brand cluster with the official wordmark

### A1. Add the `Image` import
In the `react-native` import block (currently importing `View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, StatusBar, RefreshControl, Share, Platform`), add `Image`.

### A2. Replace the brand JSX
Current (app bar, ~lines 837–846):
```tsx
{/* AGAP branding */}
<View style={styles.brandRow}>
  <View style={styles.brandIcon}>
    <Text style={styles.brandIconText}>A</Text>
  </View>
  <View>
    <Text style={styles.brandName}>AGAP</Text>
    <Text style={styles.brandTagline}>Incident Management Platform</Text>
  </View>
</View>
```
Replace with:
```tsx
{/* AGAP branding — official wordmark (contains the mark, name, and tagline) */}
<View style={styles.brandRow}>
  <Image
    source={require('../../assets/icons/agap-icon.png')}
    style={styles.brandLogo}
    resizeMode="contain"
    accessibilityRole="image"
    accessibilityLabel="AGAP — Incident Management Platform"
  />
</View>
```

### A3. Styles
- Keep `brandRow` but it no longer needs `gap`; set it to `{ flex: 1, flexDirection: 'row', alignItems: 'center' }` (the `flex: 1` must stay so the right-side cluster keeps its position).
- Add:
  ```ts
  brandLogo: { width: 130, height: 40 },
  ```
  (Matches the home exemplar aspect; `height: 40` fits the app bar's `paddingVertical: 8`. `resizeMode="contain"` preserves aspect, so the box will not distort the mark.)
- Delete the now-unused styles: `brandIcon`, `brandIconText`, `brandName`, `brandTagline`.

## Change B — Remove the redundant "Incident Type" chip

The incident type is already conveyed by the type icon circle and the card title "{type} Incident". The right-column chip restates it a third time.

Current (incident card right column, ~lines 903–914):
```tsx
<View style={styles.incidentCardRight}>
  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
    {badge.icon && (
      <Ionicons name={badge.icon} size={12} color={badge.text} style={{ marginRight: 4 }} />
    )}
    <Text style={[styles.badgeText, { color: badge.text }]}>{statusLabel}</Text>
  </View>
  <View style={styles.incidentTypeChip}>
    <Text style={styles.incidentTypeLabel}>Incident Type</Text>
    <Text style={styles.incidentTypeValue}>{typeLabel}</Text>
  </View>
</View>
```
Replace with:
```tsx
<View style={styles.incidentCardRight}>
  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
    {badge.icon && (
      <Ionicons name={badge.icon} size={12} color={badge.text} style={{ marginRight: 4 }} />
    )}
    <Text style={[styles.badgeText, { color: badge.text }]}>{statusLabel}</Text>
  </View>
</View>
```
Styles: delete `incidentTypeChip`, `incidentTypeLabel`, `incidentTypeValue`. Leave `incidentCardRight` as-is (its `gap: 8` is harmless with a single child; `typeLabel` is still used elsewhere so keep that variable).

## Change C — Trim one line of filler header copy

The page header stacks a 26px title plus a non-informational subtitle. Remove only the subtitle line for a cleaner, more minimal header; keep the "Incident Details" title and the Share button.

Current (~lines 868–872):
```tsx
<View style={{ flex: 1 }}>
  <Text style={styles.pageTitle}>Incident Details</Text>
  <Text style={styles.pageSubtitle}>Complete information about this incident.</Text>
</View>
```
Replace with:
```tsx
<View style={{ flex: 1 }}>
  <Text style={styles.pageTitle}>Incident Details</Text>
</View>
```
Styles: delete `pageSubtitle`. (Optional tidy: the `pageHeader` has `alignItems: 'flex-start'` with a `shareBtn` that uses `marginTop: 4` to align with the subtitle baseline — after removing the subtitle, change `pageHeader.alignItems` to `'center'` so the Share button vertically centers against the single title line, and drop `shareBtn.marginTop`.)

## Explicitly out of scope (do not change)
- The in-file `C` palette and the navy/teal dual-accent identity — this is the surface's established identity, not a defect.
- Card borders + `SHADOW` on every card — established identity.
- The hotline reminder appearing in both Overview and Resolution tabs — consistent with the project rule that 911/MDRRMO guidance stays available; leave it.
- Tab set, tab styling, timeline/notification/location/resolution content.

## Acceptance criteria
- The app bar shows the official `agap-icon.png` wordmark (mark + "AGAP" + tagline), not a navy box with a letter "A" and re-typed text.
- No `brandIcon` / `brandIconText` / `brandName` / `brandTagline` references remain (JSX or styles).
- The incident card right column shows only the status badge; no "Incident Type" chip; no `incidentTypeChip*` styles remain.
- The page header shows "Incident Details" with no subtitle line; no `pageSubtitle` style remains.
- `tsc --noEmit` in `mobile/` surfaces no *new* errors versus baseline (the repo has pre-existing `@types/react`/Ionicons JSX-type noise; compare against baseline, do not treat those as introduced).
- No change to any query, handler, navigation, or map wiring.

## Documentation
No `DESIGN.md` exists for this surface; no documentation update is required. If one is later created, record that the AGAP brand lockup in app bars must use `assets/icons/agap-icon.png` (wordmark) rather than a reconstructed text mark.

## Verification (manual, after execution)
Reload Metro and open an incident from `/incidents`. Confirm: official logo in the app bar; single status badge (no type chip); title with no subtitle. Spot-check one active and one resolved/cancelled incident so both the badge states and the (unchanged) tabs still render.
