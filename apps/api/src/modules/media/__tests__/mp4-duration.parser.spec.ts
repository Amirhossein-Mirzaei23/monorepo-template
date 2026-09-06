import { parseMp4DurationMs } from '../video/mp4-duration.parser';

/**
 * Hand-built synthetic mp4 buffers — no binary fixtures are committed
 * (mirrors the in-process fixture decision of MEDIA-002's suites). The boxes
 * below carry exactly the fields parseMp4DurationMs reads (size/type headers,
 * mvhd version/flags/timescale/duration); everything else is filler.
 */

/** One ISO-BMFF box: u32 BE size header + 4-byte type + payload. */
function box(type: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length + 8, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, payload]);
}

/** Same box with a 64-bit largesize header (size field = 1, real size follows). */
function largeBox(type: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(16);
  head.writeUInt32BE(1, 0);
  head.write(type, 4, 'latin1');
  head.writeBigUInt64BE(BigInt(payload.length + 16), 8);
  return Buffer.concat([head, payload]);
}

/** mvhd payload: version/flags then v0 (u32) or v1 (u64) timestamps + timescale + duration. */
function mvhdBox(timescale: number, duration: number, version: 0 | 1 = 0): Buffer {
  const body = Buffer.alloc(version === 0 ? 20 : 32);
  body.writeUInt8(version, 0); // version; flags stay 0
  if (version === 0) {
    body.writeUInt32BE(1, 4); // creation_time
    body.writeUInt32BE(2, 8); // modification_time
    body.writeUInt32BE(timescale, 12);
    body.writeUInt32BE(duration, 16);
  } else {
    body.writeBigUInt64BE(1n, 4);
    body.writeBigUInt64BE(2n, 12);
    body.writeUInt32BE(timescale, 20);
    body.writeBigUInt64BE(BigInt(duration), 24);
  }
  return box('mvhd', body);
}

const moovOf = (...children: Buffer[]): Buffer => box('moov', Buffer.concat(children));
const mdatOf = (fill: number): Buffer => box('mdat', Buffer.alloc(fill, 0x5a));

/** Minimal plausible file: ftyp brand box + the given top-level boxes. */
function mp4Of(...tail: Buffer[]): Buffer {
  return Buffer.concat([box('ftyp', Buffer.from('isomiso2avc1mp41', 'latin1')), ...tail]);
}

describe('parseMp4DurationMs (MEDIA-003 mvhd parser)', () => {
  it('reads a version-0 mvhd: timescale 1000, duration 58000 → 58000 ms', () => {
    expect(parseMp4DurationMs(mp4Of(moovOf(mvhdBox(1000, 58_000))))).toBe(58_000);
  });

  it('reads a version-1 mvhd with 64-bit duration', () => {
    expect(parseMp4DurationMs(mp4Of(moovOf(mvhdBox(1000, 90_000, 1))))).toBe(90_000);
  });

  it('parses when moov sits at the END (unbuffered recording: mdat first)', () => {
    expect(parseMp4DurationMs(mp4Of(mdatOf(64), moovOf(mvhdBox(1000, 5_000))))).toBe(5_000);
  });

  it('handles a 64-bit largesize moov box', () => {
    expect(parseMp4DurationMs(mp4Of(largeBox('moov', mvhdBox(1000, 61_000))))).toBe(61_000);
  });

  it('converts units: timescale 30000 / duration 90000 → 3000 ms', () => {
    expect(parseMp4DurationMs(mp4Of(moovOf(mvhdBox(30_000, 90_000))))).toBe(3_000);
  });

  it('rounds to whole milliseconds (timescale 3, duration 1000 → 333333 ms)', () => {
    expect(parseMp4DurationMs(mp4Of(moovOf(mvhdBox(3, 1_000))))).toBe(333_333);
  });

  it('returns null for an mp4 with no moov box (ftyp + mdat only)', () => {
    expect(parseMp4DurationMs(mp4Of(mdatOf(16)))).toBeNull();
  });

  it('returns null when moov has no mvhd child', () => {
    expect(parseMp4DurationMs(mp4Of(moovOf(box('trak', Buffer.alloc(12)))))).toBeNull();
  });

  it('returns null for a zero timescale (divide-by-zero guard)', () => {
    expect(parseMp4DurationMs(mp4Of(moovOf(mvhdBox(0, 1_000))))).toBeNull();
  });

  it('returns null for an unknown mvhd version', () => {
    const body = Buffer.alloc(20);
    body.writeUInt8(2, 0); // neither v0 nor v1
    expect(parseMp4DurationMs(mp4Of(moovOf(box('mvhd', body))))).toBeNull();
  });

  it('returns null on truncated inputs: empty, text, short mvhd, size overrun', () => {
    expect(parseMp4DurationMs(Buffer.alloc(0))).toBeNull();
    expect(parseMp4DurationMs(Buffer.from('definitely not an mp4 file'))).toBeNull();
    expect(parseMp4DurationMs(mp4Of(moovOf(mvhdBox(1000, 58_000)).subarray(0, 14)))).toBeNull();
    // A box whose declared size overruns the buffer is malformed, not parseable.
    const evil = Buffer.alloc(8);
    evil.writeUInt32BE(9999, 0);
    evil.write('moov', 4, 'latin1');
    expect(parseMp4DurationMs(Buffer.concat([box('ftyp', Buffer.alloc(4)), evil]))).toBeNull();
  });

  it('returns null for a v1 duration beyond the safe integer range', () => {
    const body = Buffer.alloc(32);
    body.writeUInt8(1, 0);
    body.writeUInt32BE(1000, 20);
    body.writeBigUInt64BE(2n ** 53n, 24); // > Number.MAX_SAFE_INTEGER
    expect(parseMp4DurationMs(mp4Of(moovOf(box('mvhd', body))))).toBeNull();
  });
});
