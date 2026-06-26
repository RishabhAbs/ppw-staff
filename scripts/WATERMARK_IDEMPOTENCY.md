# Watermark idempotency — preventing double-stamping on re-edit

## The bug
Re-editing a product image makes the watermark appear **again on top of the
existing one** (double, then triple… stamping). The watermark is baked into the
stored pixels, so when an already-watermarked image is processed a second time
the service cannot tell "fresh" from "already stamped" and stamps it again.

## When it actually triggers
The plain re-edit path is already safe: on load, each slot is `file: null` and
the save only re-uploads slots where the user picked a **new** file
(`if (s.file)` in `ItemDetailsPage.handleSave`). An untouched slot is never
re-sent, so opening an item and saving does **not** re-stamp.

Double-stamping happens when **already-watermarked pixels go through the
watermark step again**, e.g.:
- the user "Change"s a slot using a previously-downloaded watermarked copy, or
- the `watermark-backfill.js` script runs over an image the live upload path
  already stamped (or vice-versa).

## The fix — single source of truth: an S3 metadata flag
Tag every watermarked object with `Metadata: { watermarked: '1' }`
(`x-amz-meta-watermarked: 1`). This is the **same scheme `watermark-backfill.js`
already uses** (see its guard at `head.Metadata.watermarked === '1'`), so the
live path and the backfill share one contract and can never fight each other.

### Required change in `backend/src/item-details/item-details.service.ts`
When the watermark feature is (re)added to the upload path, the stamp step MUST:

1. **Guard before stamping** — if the source is being re-processed from an
   existing S3 object, `HeadObject` first and skip the watermark if
   `Metadata.watermarked === '1'`.
2. **Tag after stamping** — every `PutObjectCommand` that writes a watermarked
   image sets `Metadata: { watermarked: '1' }`.

```ts
// after producing the watermarked webp buffer `marked`:
await this.s3.send(new PutObjectCommand({
  Bucket: this.bucket,
  Key: key,
  Body: marked,
  ContentType: 'image/webp',
  Metadata: { watermarked: '1' },   // ← idempotency tag (matches backfill)
}));
```

Because each upload already generates a **unique cache-busting `url_name`**
(`${code}${slot}-${Date.now().toString(36)}`), a fresh user upload always gets a
new key with no prior metadata — so genuinely new images are always stamped once,
and only re-processed/already-stamped pixels are skipped.

### Why S3 metadata, not a DB column
The flag must travel with the **bytes**, not the row. An image can be
re-downloaded and re-uploaded, or processed by the backfill script outside the
app entirely; only object metadata catches every path. A `media.watermarked`
column would miss images touched outside the normal upload flow.

## Note on current working tree
The live upload path in this branch (restored from commit `a2cb8b2`) currently
has **no watermark code** — it was lost with the discarded corrupt HEAD commit.
So nothing is double-stamping here today. This document defines the contract so
that whenever the watermark step is restored, it is idempotent by construction.
The `watermark-backfill.js` guard already implements the read side of this
contract; the upload path must implement the write side (set the tag) and the
read side (skip if tagged).
