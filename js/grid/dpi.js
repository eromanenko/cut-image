export function extractTiffDpi(ifd) {
    try {
        let xRes = ifd.t282;
        const resUnit = ifd.t296 || 2;

        if (xRes) {
            let dpiValue;
            if (Array.isArray(xRes)) {
                dpiValue = xRes[0] / (xRes[1] || 1);
            } else {
                dpiValue = xRes;
            }

            if (resUnit === 3) {
                return Math.round(dpiValue * 2.54);
            }
            if (resUnit === 2 && dpiValue > 0) {
                return Math.round(dpiValue);
            }
        }
    } catch (e) {
        console.warn('TIFF DPI extraction failed:', e);
    }
    return null;
}

export function extractImageDpi(bytes, mimeType) {
    try {
        if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
            return extractJpegDpi(bytes);
        } else if (mimeType === 'image/png') {
            return extractPngDpi(bytes);
        }
    } catch (e) {
        console.warn('DPI detection failed:', e);
    }
    return null;
}

function extractJpegDpi(bytes) {
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;

    let offset = 2;
    while (offset < bytes.length - 4) {
        if (bytes[offset] !== 0xFF) break;
        const marker = bytes[offset + 1];
        const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];

        if (marker === 0xE0) {
            const sig = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
            if (sig === 'JFIF') {
                const densityUnits = bytes[offset + 11];
                const xDensity = (bytes[offset + 12] << 8) | bytes[offset + 13];
                const yDensity = (bytes[offset + 14] << 8) | bytes[offset + 15];
                
                if (densityUnits === 1 && xDensity > 0) {
                    return xDensity;
                } else if (densityUnits === 2 && xDensity > 0) {
                    return Math.round(xDensity * 2.54);
                }
            }
        }

        if (marker === 0xE1) {
            const exifDpi = parseExifForDpi(bytes, offset + 4, segLen - 2);
            if (exifDpi) return exifDpi;
        }

        if (marker === 0xDA) break;

        offset += 2 + segLen;
    }
    return null;
}

function parseExifForDpi(bytes, start, length) {
    const sig = String.fromCharCode(bytes[start], bytes[start + 1], bytes[start + 2], bytes[start + 3]);
    if (sig !== 'Exif') return null;

    const tiffStart = start + 6;
    
    const byteOrder = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1]);
    const isLE = byteOrder === 'II';

    function readU16(off) {
        if (isLE) return bytes[off] | (bytes[off + 1] << 8);
        return (bytes[off] << 8) | bytes[off + 1];
    }
    function readU32(off) {
        if (isLE) return bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24);
        return (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3];
    }

    const ifdOffset = readU32(tiffStart + 4);
    const ifdStart = tiffStart + ifdOffset;
    const numEntries = readU16(ifdStart);

    let resUnit = 2;
    let xRes = null;

    for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifdStart + 2 + i * 12;
        const tag = readU16(entryOffset);
        const type = readU16(entryOffset + 2);

        if (tag === 0x0128) {
            resUnit = readU16(entryOffset + 8);
        }

        if (tag === 0x011A) {
            const valueOffset = readU32(entryOffset + 8);
            const num = readU32(tiffStart + valueOffset);
            const den = readU32(tiffStart + valueOffset + 4);
            if (den > 0) xRes = num / den;
        }
    }

    if (xRes && xRes > 0) {
        if (resUnit === 3) {
            return Math.round(xRes * 2.54);
        }
        return Math.round(xRes);
    }
    return null;
}

function extractPngDpi(bytes) {
    if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;

    let offset = 8;
    while (offset < bytes.length - 12) {
        const chunkLen = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
        const chunkType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

        if (chunkType === 'pHYs') {
            const dataStart = offset + 8;
            const xPPU = (bytes[dataStart] << 24) | (bytes[dataStart + 1] << 16) | (bytes[dataStart + 2] << 8) | bytes[dataStart + 3];
            const yPPU = (bytes[dataStart + 4] << 24) | (bytes[dataStart + 5] << 16) | (bytes[dataStart + 6] << 8) | bytes[dataStart + 7];
            const unit = bytes[dataStart + 8];

            if (unit === 1 && xPPU > 0) {
                return Math.round(xPPU * 0.0254);
            }
        }

        if (chunkType === 'IDAT' || chunkType === 'IEND') break;
        offset += 12 + chunkLen;
    }
    return null;
}
