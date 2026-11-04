// Minimal, dependency-free, deterministic ZIP writer/reader.
//
// Why not a library: DNN only needs plain ZIP (stored/deflate, no ZIP64), and a
// ~150 line implementation removes a supply-chain dependency while letting us
// guarantee determinism: sorted entries, fixed timestamps, no extra fields, no
// OS-specific attributes. Byte-identical output additionally requires the same
// zlib build, i.e. the Node version pinned in .node-version.
import zlib from 'node:zlib';
import { BondError, compareOrdinal } from './util.mjs';

const DEFLATE = 8;
const STORE = 0;

function dosDateTime(date) {
  // DOS timestamps have no time zone; use UTC so every machine writes the same bytes.
  const y = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((y - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

export function assertSafeEntryName(name) {
  if (!name || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) ||
      name.split('/').some((seg) => seg === '..' || seg === '.' || seg === '') || name.includes('\0')) {
    throw new BondError(`Unsafe ZIP entry name: "${name}"`, 'BOND510');
  }
}

/**
 * @param {{name: string, data: Buffer}[]} entries
 * @param {{mtime: Date}} opts
 */
export function createZip(entries, { mtime }) {
  const { time, date } = dosDateTime(mtime);
  const seen = new Set();
  const sorted = [...entries].sort((a, b) => compareOrdinal(a.name, b.name));
  if (sorted.length > 0xffff) throw new BondError('Too many ZIP entries (ZIP64 not supported).', 'BOND511');
  const locals = []; const centrals = []; let offset = 0;

  for (const { name, data } of sorted) {
    assertSafeEntryName(name);
    const key = name.toLowerCase();
    if (seen.has(key)) throw new BondError(`Duplicate ZIP entry (case-insensitive): ${name}`, 'BOND512');
    seen.add(key);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data) >>> 0;
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    if (body.length >= 0xffffffff || offset >= 0xffffffff) throw new BondError('ZIP too large (ZIP64 not supported).', 'BOND511');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // flags: UTF-8 names
    local.writeUInt16LE(useDeflate ? DEFLATE : STORE, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);          // made by: MS-DOS/FAT, spec 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? DEFLATE : STORE, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);     // extra/comment/disk/attrs stay 0
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Parse a ZIP, verifying structure and CRCs. Returns [{name, data, method}]. */
export function readZip(buf) {
  const need = (off, len, what) => {
    if (!Number.isInteger(off) || off < 0 || off + len > buf.length) throw new BondError(`Corrupt ZIP: ${what} out of bounds.`, 'BOND513');
  };
  if (buf.length < 22) throw new BondError('Not a ZIP file (too short).', 'BOND513');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new BondError('Not a ZIP file (no end of central directory).', 'BOND513');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = []; const seen = new Set();
  for (let n = 0; n < count; n++) {
    need(p, 46, 'central directory entry');
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new BondError('Corrupt ZIP central directory.', 'BOND513');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    need(p + 46, nlen + elen + clen, 'central directory name');
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue; // directory entry
    assertSafeEntryName(name);
    if (seen.has(name.toLowerCase())) throw new BondError(`Duplicate ZIP entry: ${name}`, 'BOND512');
    seen.add(name.toLowerCase());
    need(lho, 30, 'local header');
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new BondError(`Corrupt local header for ${name}`, 'BOND513');
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    need(start, csize, `data of ${name}`);
    const raw = buf.subarray(start, start + csize);
    const data = method === DEFLATE ? zlib.inflateRawSync(raw) : method === STORE ? Buffer.from(raw) : null;
    if (!data) throw new BondError(`Unsupported compression method ${method} for ${name}`, 'BOND513');
    if (data.length !== usize || (zlib.crc32(data) >>> 0) !== crc) throw new BondError(`CRC/size mismatch for ${name}`, 'BOND514');
    entries.push({ name, data, method });
  }
  return entries;
}
