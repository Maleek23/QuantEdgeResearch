/**
 * Minimal .zip reader for uploads (no dependency): reads the central
 * directory and inflates each entry with the browser's DecompressionStream
 * ('deflate-raw'). Supports stored (0) and deflate (8) entries — what every
 * OS "Compress" and DiscordChatExporter bundles produce. No zip64, no
 * encryption. Used by the Discord forum import to unpack a zip of thread
 * exports in the browser, so the server only ever receives JSON text.
 */
export interface ZipEntry { name: string; text: () => Promise<string> }

export async function readZip(buf: ArrayBuffer, filter: (name: string) => boolean = () => true): Promise<ZipEntry[]> {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // End of central directory: signature 0x06054b50 within the last 64 KiB + 22.
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file (no central directory)');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip central directory');
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || name.startsWith('__MACOSX/') || !filter(name)) continue;
    if (dv.getUint32(localOff, true) !== 0x04034b50) throw new Error(`Corrupt zip entry ${name}`);
    const dataStart = localOff + 30 + dv.getUint16(localOff + 26, true) + dv.getUint16(localOff + 28, true);
    const data = u8.subarray(dataStart, dataStart + compSize);
    if (method !== 0 && method !== 8) throw new Error(`${name}: unsupported zip compression (method ${method})`);
    out.push({
      name,
      text: async () => {
        if (method === 0) return dec.decode(data);
        if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unzip — upload the .json files instead');
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
        return new Response(stream).text();
      },
    });
  }
  return out;
}
