# Data guide

Two files drive the whole app: `pandals.json` and `places.json`. `routes.json` is generated.

## Fields
- id: short lowercase slug, unique, never changes (visitors' "seen" marks use it).
- name / name_bn: English and Bengali. Bengali is optional.
- zone: any label. Routes are built per zone group (see scripts/build-routes.mjs).
- lat / lng: decimal degrees. Drop the pin on the actual pandal gate, not the road.
- verified: set true only after the checklist below.

## Verification checklist (do this per pandal)
1. Find the club's official name and its 2026 location (club Facebook or Instagram page, or Kolkata Police / KMC puja list).
2. Pin the exact spot on OpenStreetMap or Google Maps and copy the coordinates.
3. Confirm a second source (news report or a local) because pandal sites sometimes move between years.
4. Note the theme in `theme` once announced.
5. Set `verified: true`.

## Tips
- Start with 60-100 famous pandals, not 3000. Quality beats count.
- Keep an `id` forever; change only name/coords.
- Add eateries only with a name you've confirmed is open during puja.
