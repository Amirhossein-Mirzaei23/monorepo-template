/**
 * MEDIA-003 — minimal pure-TS ISO-BMFF (mp4) duration reader.
 *
 * The API has no ffmpeg (decision D10), but the mp4 duration is plain data in
 * the `moov` → `mvhd` box: version/flags, timescale (units per second) and
 * duration (units). This file walks the top-level boxes, finds `moov`, then
 * `mvhd` inside it, and returns `duration / timescale` in milliseconds —
 * so the server can re-check the client-reported `durationMs` instead of
 * trusting it for mp4 uploads (the 60 s limit is a product rule, PLAT-003).
 *
 * Scope guards (deliberate, keep it ~50 lines):
 * - WebM has no such in-band duration we can read cheaply → VideoService
 *   trusts the client `durationMs` there (documented residual risk).
 * - Fragmented mp4s that carry duration only in `mvex/mehd` (rare for phone
 *   recordings) parse as null → the caller falls back to the client value.
 * - EVERY malformed input (truncation, bad sizes, zero timescale,
 *   non-representable 64-bit values) returns null — this parser never throws.
 */

/** Half-open payload range [payloadStart, payloadEnd) of one matched box. */
interface BoxPayloadRange {
  payloadStart: number;
  payloadEnd: number;
}

/** mvhd header after version/flags: v0 = creation+mod (u32 ×2) + timescale + duration. */
const MVHD_V0_BODY_BYTES = 16;
/** mvhd header after version/flags: v1 = creation+mod (u64 ×2) + timescale (u32) + duration (u64). */
const MVHD_V1_BODY_BYTES = 28;
const MVHD_VERSION_FLAGS_BYTES = 4;

/**
 * Walks ISO-BMFF boxes inside `[start, end)` and returns the payload range of
 * the FIRST box named `type`. Handles the three size encodings: standard u32
 * size, `size == 1` → 64-bit largesize in the next 8 bytes, and `size == 0` →
 * box extends to the end of the enclosing range (mdat stream-to-EOF marker).
 */
function findBoxPayload(
  buffer: Buffer,
  start: number,
  end: number,
  type: string,
): BoxPayloadRange | null {
  let offset = start;
  while (offset + 8 <= end) {
    const sizeField = buffer.readUInt32BE(offset);
    let headerBytes = 8;
    let boxSize: number;
    if (sizeField === 1) {
      if (offset + 16 > end) {
        return null; // largesize announced but truncated
      }
      const largeSize = buffer.readBigUInt64BE(offset + 8);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) {
        return null; // larger than anything we could address anyway
      }
      boxSize = Number(largeSize);
      headerBytes = 16;
    } else if (sizeField === 0) {
      boxSize = end - offset;
    } else {
      boxSize = sizeField;
    }
    // Malformed (size smaller than its own header, or overruns the parent).
    if (boxSize < headerBytes || offset + boxSize > end) {
      return null;
    }
    if (buffer.toString('latin1', offset + 4, offset + 8) === type) {
      return { payloadStart: offset + headerBytes, payloadEnd: offset + boxSize };
    }
    offset += boxSize;
  }
  return null;
}

/** duration(units) / timescale(units/s) → whole milliseconds, rounded. */
function mvhdDurationMs(timescale: number, duration: number): number | null {
  if (timescale === 0) {
    return null; // would be a divide-by-zero — treat as unparseable
  }
  return Math.round((duration * 1000) / timescale);
}

/** Reads timescale + duration out of an mvhd payload (version 0: u32s, version 1: u64s). */
function readMvhd(buffer: Buffer, payloadStart: number, payloadEnd: number): number | null {
  if (payloadStart + MVHD_VERSION_FLAGS_BYTES > payloadEnd) {
    return null;
  }
  const version = buffer.readUInt8(payloadStart);
  const bodyStart = payloadStart + MVHD_VERSION_FLAGS_BYTES;
  if (version === 0) {
    if (bodyStart + MVHD_V0_BODY_BYTES > payloadEnd) {
      return null;
    }
    const timescale = buffer.readUInt32BE(bodyStart + 8);
    const duration = buffer.readUInt32BE(bodyStart + 12);
    return mvhdDurationMs(timescale, duration);
  }
  if (version === 1) {
    if (bodyStart + MVHD_V1_BODY_BYTES > payloadEnd) {
      return null;
    }
    const timescale = buffer.readUInt32BE(bodyStart + 16);
    const duration = buffer.readBigUInt64BE(bodyStart + 20);
    if (duration > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    return mvhdDurationMs(timescale, Number(duration));
  }
  return null; // unknown mvhd version
}

/**
 * Video duration in WHOLE MILLISECONDS parsed from an mp4 buffer's
 * `moov` → `mvhd` box, or null when anything about the bytes is not a
 * parseable non-fragmented mp4 (caller then falls back to the client-reported
 * duration — and 400s when there is none). `moov` may sit anywhere in the
 * file (uploads buffer the whole file in memory, so an end-of-file moov from
 * an unbuffered recording is still scanned).
 */
export function parseMp4DurationMs(buffer: Buffer): number | null {
  if (buffer.length < 8) {
    return null;
  }
  const moov = findBoxPayload(buffer, 0, buffer.length, 'moov');
  if (!moov) {
    return null;
  }
  const mvhd = findBoxPayload(buffer, moov.payloadStart, moov.payloadEnd, 'mvhd');
  if (!mvhd) {
    return null;
  }
  return readMvhd(buffer, mvhd.payloadStart, mvhd.payloadEnd);
}
