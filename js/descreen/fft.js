export function applyFFTFilter(srcRgb, dst, threshold, radius) {
    let channels = new cv.MatVector();
    cv.split(srcRgb, channels);
    
    let processedChannels = new cv.MatVector();
    
    for (let i = 0; i < channels.size(); i++) {
        let channel = channels.get(i);
        let processed = processFftChannel(channel, threshold, radius);
        processedChannels.push_back(processed);
        channel.delete();
    }
    
    cv.merge(processedChannels, dst);
    
    // cleanup
    channels.delete();
    for (let i = 0; i < processedChannels.size(); i++) {
        processedChannels.get(i).delete();
    }
    processedChannels.delete();
}

function processFftChannel(src, threshold, radius) {
    // 1. Pad to optimal size
    let m = cv.getOptimalDFTSize(src.rows);
    let n = cv.getOptimalDFTSize(src.cols);
    let padded = new cv.Mat();
    cv.copyMakeBorder(src, padded, 0, m - src.rows, 0, n - src.cols, cv.BORDER_CONSTANT, new cv.Scalar(0,0,0,0));
    
    // 2. Create complex image (real: padded, imaginary: zeros)
    let planes = new cv.MatVector();
    let complexI = new cv.Mat();
    let paddedF32 = new cv.Mat();
    padded.convertTo(paddedF32, cv.CV_32F);
    
    planes.push_back(paddedF32);
    let zeros = cv.Mat.zeros(padded.rows, padded.cols, cv.CV_32F);
    planes.push_back(zeros);
    cv.merge(planes, complexI);
    
    // 3. DFT
    cv.dft(complexI, complexI, cv.DFT_COMPLEX_OUTPUT);
    
    // 4. Compute magnitude
    let magPlanes = new cv.MatVector();
    cv.split(complexI, magPlanes);
    let mag = new cv.Mat();
    cv.magnitude(magPlanes.get(0), magPlanes.get(1), mag);
    
    // Add 1 to all to avoid log(0)
    let ones = cv.Mat.ones(mag.rows, mag.cols, cv.CV_32F);
    cv.add(mag, ones, mag);
    cv.log(mag, mag);
    ones.delete();
    
    // Shift quadrants (center low freq)
    shiftDFT(complexI);
    shiftDFT(mag);
    
    // 5. Peak Detection & Masking
    // Mask out the center (low frequencies/DC) BEFORE normalization so it doesn't skew the min/max
    let cx = Math.floor(mag.cols / 2);
    let cy = Math.floor(mag.rows / 2);
    // Don't filter the center. 15% of the shortest dimension is a safe zone.
    let centerMaskRadius = Math.max(30, Math.min(mag.cols, mag.rows) * 0.15); 
    
    // Zero out the DC component area in the magnitude spectrum
    cv.circle(mag, new cv.Point(cx, cy), centerMaskRadius, new cv.Scalar(0), -1);
    
    // Normalize magnitude to 0-1. Now the highest non-DC peak will be 1.0.
    cv.normalize(mag, mag, 0, 1, cv.NORM_MINMAX); 
    
    let magData = mag.data32F;
    let color = new cv.Scalar(0, 0, 0, 0);
    
    for (let r = 0; r < mag.rows; r++) {
        for (let c = 0; c < mag.cols; c++) {
            let dist = Math.sqrt(Math.pow(c - cx, 2) + Math.pow(r - cy, 2));
            if (dist < centerMaskRadius) continue;
            
            let val = magData[r * mag.cols + c];
            if (val >= threshold) {
                // Apply notch mask at this peak
                cv.circle(complexI, new cv.Point(c, r), radius, color, -1);
            }
        }
    }
    
    // 6. Shift back
    shiftDFT(complexI);
    
    // 7. Inverse DFT
    cv.dft(complexI, complexI, cv.DFT_INVERSE | cv.DFT_SCALE | cv.DFT_REAL_OUTPUT);
    
    // 8. Crop and convert back
    cv.split(complexI, planes);
    let resultF32 = planes.get(0);
    let rect = new cv.Rect(0, 0, src.cols, src.rows);
    let cropped = resultF32.roi(rect);
    
    let result8U = new cv.Mat();
    cropped.convertTo(result8U, cv.CV_8U);
    
    // cleanup
    padded.delete(); paddedF32.delete(); zeros.delete(); planes.delete();
    complexI.delete(); magPlanes.delete(); mag.delete(); cropped.delete();
    
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
