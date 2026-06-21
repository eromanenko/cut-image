export function applyFFTFilter(srcRgb, dst, threshold, radius) {
    let channels = new cv.MatVector();
    cv.split(srcRgb, channels);
    
    let processedChannels = new cv.MatVector();
    
    // Pad to optimal size first.
    let m = cv.getOptimalDFTSize(srcRgb.rows);
    let n = cv.getOptimalDFTSize(srcRgb.cols);
    
    // Precompute coefs and middle mask for this size
    let {coefs, middle} = getCoefsAndMiddle(n, m, 4); // default middleRatio = 4
    
    for (let i = 0; i < channels.size(); i++) {
        let channel = channels.get(i);
        let processed = processFftChannel(channel, threshold, radius, coefs, middle, n, m);
        processedChannels.push_back(processed);
        channel.delete();
        processed.delete();
    }
    
    cv.merge(processedChannels, dst);
    
    // cleanup
    channels.delete();
    processedChannels.delete();
}

let coefsCache = null;
let middleCache = null;
let lastSize = {w: 0, h: 0, mid: 0};

function getCoefsAndMiddle(w, h, middleRatio) {
    if (coefsCache && lastSize.w === w && lastSize.h === h && lastSize.mid === middleRatio) {
        return {coefs: coefsCache, middle: middleCache};
    }
    
    if (coefsCache) coefsCache.delete();
    if (middleCache) middleCache.delete();
    
    lastSize = {w, h, mid: middleRatio};
    
    coefsCache = new cv.Mat(h, w, cv.CV_32F);
    middleCache = new cv.Mat(h, w, cv.CV_32F);
    
    let coefsData = coefsCache.data32F;
    let middleData = middleCache.data32F;
    
    let cx = w / 2;
    let cy = h / 2;
    
    let mid = middleRatio * 2;
    let ew = w / mid;
    let eh = h / mid;
    let offset = (ew + eh) / 2 / (ew * eh);
    
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
            let dx = Math.abs(c - cx);
            let dy = Math.abs(r - cy);
            let energy = Math.pow(dx, 0.5) + Math.pow(dy, 0.5);
            let val = Math.max(energy * energy, 0.01);
            coefsData[r * w + c] = val;
            
            let xNorm = (c - cx) / ew;
            let yNorm = (r - cy) / eh;
            let isMiddle = (xNorm * xNorm + yNorm * yNorm - offset) <= 1 ? 1.0 : 0.0;
            middleData[r * w + c] = 1.0 - isMiddle; // 1-middle (0 at center, 1 outside)
        }
    }
    
    return {coefs: coefsCache, middle: middleCache};
}

function processFftChannel(src, threshold, radius, coefs, middle, n, m) {
    let padded = new cv.Mat();
    cv.copyMakeBorder(src, padded, 0, m - src.rows, 0, n - src.cols, cv.BORDER_CONSTANT, new cv.Scalar(0,0,0,0));
    
    let planes = new cv.MatVector();
    let complexI = new cv.Mat();
    let paddedF32 = new cv.Mat();
    padded.convertTo(paddedF32, cv.CV_32F);
    
    planes.push_back(paddedF32);
    let zeros = cv.Mat.zeros(padded.rows, padded.cols, cv.CV_32F);
    planes.push_back(zeros);
    cv.merge(planes, complexI);
    
    cv.dft(complexI, complexI, cv.DFT_COMPLEX_OUTPUT);
    shiftDFT(complexI);
    
    let complexPlanes = new cv.MatVector();
    cv.split(complexI, complexPlanes);
    let mag = new cv.Mat();
    let re = complexPlanes.get(0);
    let im = complexPlanes.get(1);
    cv.magnitude(re, im, mag);
    re.delete();
    im.delete();
    complexPlanes.delete();
    
    cv.multiply(mag, coefs, mag);
    
    let ones = cv.Mat.ones(mag.rows, mag.cols, cv.CV_32F);
    cv.add(mag, ones, mag);
    cv.log(mag, mag);
    ones.delete();
    
    let twenty = new cv.Mat(mag.rows, mag.cols, cv.CV_32F, new cv.Scalar(20));
    cv.multiply(mag, twenty, mag);
    twenty.delete();
    
    let threshMat = new cv.Mat();
    let threshValue = threshold * 200;
    cv.threshold(mag, threshMat, threshValue, 255, cv.THRESH_BINARY);
    
    cv.multiply(threshMat, middle, threshMat);
    
    let actualRadius = Math.max(1, radius);
    let ellipseSize = actualRadius * 2 + 1;
    let ellipseElem = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(ellipseSize, ellipseSize));
    cv.dilate(threshMat, threshMat, ellipseElem);
    ellipseElem.delete();
    
    let sigma = actualRadius / 3.0;
    cv.GaussianBlur(threshMat, threshMat, new cv.Size(0,0), sigma, sigma, cv.BORDER_REPLICATE);
    
    let maskF32 = new cv.Mat();
    threshMat.convertTo(maskF32, cv.CV_32F, -1.0/255.0, 1.0);
    
    let maskVector = new cv.MatVector();
    maskVector.push_back(maskF32);
    maskVector.push_back(maskF32);
    let maskComplex = new cv.Mat();
    cv.merge(maskVector, maskComplex);
    
    cv.multiply(complexI, maskComplex, complexI);
    
    shiftDFT(complexI);
    
    cv.dft(complexI, complexI, cv.DFT_INVERSE | cv.DFT_SCALE | cv.DFT_REAL_OUTPUT);
    
    let outPlanes = new cv.MatVector();
    cv.split(complexI, outPlanes);
    let resultF32 = outPlanes.get(0);
    
    let rect = new cv.Rect(0, 0, src.cols, src.rows);
    let cropped = resultF32.roi(rect);
    
    let result8U = new cv.Mat();
    cropped.convertTo(result8U, cv.CV_8U);
    
    // cleanup
    padded.delete(); paddedF32.delete(); zeros.delete(); planes.delete();
    complexI.delete(); mag.delete();
    threshMat.delete(); maskF32.delete(); maskVector.delete(); maskComplex.delete();
    outPlanes.delete(); resultF32.delete(); cropped.delete();
    
    return result8U;
}

function shiftDFT(mag) {
    let cx = Math.floor(mag.cols / 2);
    let cy = Math.floor(mag.rows / 2);

    let q0 = mag.roi(new cv.Rect(0, 0, cx, cy));
    let q1 = mag.roi(new cv.Rect(cx, 0, cx, cy));
    let q2 = mag.roi(new cv.Rect(0, cy, cx, cy));
    let q3 = mag.roi(new cv.Rect(cx, cy, cx, cy));

    let tmp = new cv.Mat();
    q0.copyTo(tmp);
    q3.copyTo(q0);
    tmp.copyTo(q3);

    q1.copyTo(tmp);
    q2.copyTo(q1);
    tmp.copyTo(q2);

    tmp.delete();
    q0.delete(); q1.delete(); q2.delete(); q3.delete();
}
