const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    crcTable[i] = c;
}

function crc32(buffer, offset, length) {
    let crc = 0xFFFFFFFF;
    for (let i = offset; i < offset + length; i++) {
        crc = crcTable[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

export async function injectPngDpi(blob, dpi) {
    if (blob.type !== 'image/png' || !dpi || dpi <= 0) {
        return blob;
    }

    const arrayBuffer = await blob.arrayBuffer();
    const dataView = new DataView(arrayBuffer);
    const uint8Array = new Uint8Array(arrayBuffer);

    // Check PNG signature
    if (dataView.getUint32(0) !== 0x89504E47 || dataView.getUint32(4) !== 0x0D0A1A0A) {
        return blob;
    }

    const chunks = [];
    let offset = 8;
    let oldPhysLength = 0;

    while (offset < arrayBuffer.byteLength - 11) {
        const length = dataView.getUint32(offset);
        const type = String.fromCharCode(uint8Array[offset + 4], uint8Array[offset + 5], uint8Array[offset + 6], uint8Array[offset + 7]);
        const chunkLength = length + 12;

        if (type === 'pHYs') {
            oldPhysLength += chunkLength;
        } else {
            chunks.push({ type, offset, length: chunkLength });
        }

        offset += chunkLength;
    }

    const pixelsPerMeter = Math.round(dpi / 0.0254);
    
    // Create new pHYs chunk (length 9 + 12 = 21 bytes)
    const physChunk = new Uint8Array(21);
    const physView = new DataView(physChunk.buffer);
    
    physView.setUint32(0, 9); // Length
    physChunk[4] = 112; // 'p'
    physChunk[5] = 72;  // 'H'
    physChunk[6] = 89;  // 'Y'
    physChunk[7] = 115; // 's'
    
    physView.setUint32(8, pixelsPerMeter); // X pixels per unit
    physView.setUint32(12, pixelsPerMeter); // Y pixels per unit
    physChunk[16] = 1; // Unit specifier: 1 = meter

    const crc = crc32(physChunk, 4, 13);
    physView.setUint32(17, crc);

    // Build new ArrayBuffer
    let newLength = 8 + 21; // signature + new pHYs
    for (const chunk of chunks) {
        newLength += chunk.length;
    }

    const newArrayBuffer = new ArrayBuffer(newLength);
    const newUint8Array = new Uint8Array(newArrayBuffer);

    // Copy signature
    newUint8Array.set(uint8Array.subarray(0, 8), 0);
    let currentOffset = 8;

    for (const chunk of chunks) {
        newUint8Array.set(uint8Array.subarray(chunk.offset, chunk.offset + chunk.length), currentOffset);
        currentOffset += chunk.length;

        // Insert pHYs immediately after IHDR
        if (chunk.type === 'IHDR') {
            newUint8Array.set(physChunk, currentOffset);
            currentOffset += physChunk.length;
        }
    }
    
    return new Blob([newArrayBuffer], { type: 'image/png' });
}
