// Assemble two synthetic 1x1 WebP frames; no metadata or personal content.
export function animatedWebp(frames: Buffer[]) {
  const chunk = (type: string, data: Buffer) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length);
    return Buffer.concat([
      Buffer.from(type),
      size,
      data,
      ...(data.length % 2 ? [Buffer.alloc(1)] : []),
    ]);
  };
  const extended = Buffer.alloc(10);
  extended[0] = 0x12; // animation + alpha, 1x1 canvas
  const chunks = [chunk("VP8X", extended), chunk("ANIM", Buffer.alloc(6))];
  for (const source of frames) {
    if (source.toString("ascii", 8, 12) !== "WEBP")
      throw new Error("Expected synthetic WebP frame");
    const image: Buffer[] = [];
    for (let offset = 12; offset + 8 <= source.length; ) {
      const type = source.toString("ascii", offset, offset + 4),
        size = source.readUInt32LE(offset + 4);
      if (["VP8 ", "VP8L", "ALPH"].includes(type))
        image.push(source.subarray(offset, offset + 8 + size + (size % 2)));
      offset += 8 + size + (size % 2);
    }
    if (!image.length) throw new Error("Missing synthetic WebP image data");
    const frame = Buffer.alloc(16);
    frame.writeUIntLE(1000, 12, 3);
    frame[15] = 2;
    chunks.push(chunk("ANMF", Buffer.concat([frame, ...image])));
  }
  const body = Buffer.concat([Buffer.from("WEBP"), ...chunks]),
    size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from("RIFF"), size, body]);
}
