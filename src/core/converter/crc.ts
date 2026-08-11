/**
 * CRC-8 and CRC-16 as used by FLAC frames.
 *
 * CRC-8:  polynomial x^8 + x^2 + x + 1  (0x07), MSB-first, init 0.
 * CRC-16: polynomial x^16 + x^15 + x^2 + 1 (0x8005), MSB-first, init 0.
 * These match CRC-8/SMBUS and CRC-16/UMTS check values.
 */
const CRC8_TABLE = buildCrc8();
const CRC16_TABLE = buildCrc16();

function buildCrc8(): Uint8Array {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
    table[i] = crc;
  }
  return table;
}

function buildCrc16(): Uint16Array {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
    }
    table[i] = crc;
  }
  return table;
}

/** CRC-8 over bytes[start..end). */
export function crc8(bytes: Uint8Array, start: number, end: number, init = 0): number {
  let crc = init;
  for (let i = start; i < end; i++) {
    crc = CRC8_TABLE[(crc ^ bytes[i]!) & 0xff]!;
  }
  return crc & 0xff;
}

/** CRC-16 over bytes[start..end). */
export function crc16(bytes: Uint8Array, start: number, end: number, init = 0): number {
  let crc = init;
  for (let i = start; i < end; i++) {
    crc = ((crc << 8) & 0xffff) ^ CRC16_TABLE[((crc >> 8) ^ bytes[i]!) & 0xff]!;
  }
  return crc & 0xffff;
}
