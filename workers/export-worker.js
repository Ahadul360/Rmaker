/**
 * ReelMaker Export & Audio Processing Worker
 * Handles CPU-intensive tasks off the main UI thread:
 * 1. Audio waveform downsampling and RMS peak calculation
 * 2. Project data compression and asset serialization
 * 3. Validation and schema migration for imported projects
 */

self.onmessage = function (e) {
  const { type, payload, id } = e.data;

  try {
    switch (type) {
      case 'PROCESS_WAVEFORM': {
        const { channelData, sampleCount = 120 } = payload;
        const peaks = calculateWaveformPeaks(channelData, sampleCount);
        self.postMessage({ id, type: 'SUCCESS', result: peaks });
        break;
      }

      case 'VALIDATE_PROJECT': {
        const { projectJson } = payload;
        const validation = validateProjectSchema(projectJson);
        self.postMessage({ id, type: 'SUCCESS', result: validation });
        break;
      }

      case 'SERIALIZE_PROJECT': {
        const { project } = payload;
        const serialized = JSON.stringify(project);
        self.postMessage({ id, type: 'SUCCESS', result: serialized });
        break;
      }

      default:
        self.postMessage({ id, type: 'ERROR', error: `Unknown worker task: ${type}` });
    }
  } catch (err) {
    self.postMessage({ id, type: 'ERROR', error: err.message || String(err) });
  }
};

/**
 * Calculates normalized RMS waveform peaks from raw float channel data.
 */
function calculateWaveformPeaks(channelData, sampleCount) {
  if (!channelData || channelData.length === 0) {
    return new Array(sampleCount).fill(0.1);
  }

  const blockSize = Math.floor(channelData.length / sampleCount);
  const peaks = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, channelData.length);
    let sumSquares = 0;

    for (let j = start; j < end; j++) {
      const val = channelData[j];
      sumSquares += val * val;
    }

    const count = Math.max(1, end - start);
    peaks[i] = Math.sqrt(sumSquares / count);
  }

  // Normalize peaks between 0.05 and 1.0
  let max = 0;
  for (let i = 0; i < sampleCount; i++) {
    if (peaks[i] > max) max = peaks[i];
  }

  const result = [];
  const normalizer = max > 0 ? 1 / max : 1;
  for (let i = 0; i < sampleCount; i++) {
    result.push(Math.max(0.08, Number((peaks[i] * normalizer).toFixed(3))));
  }

  return result;
}

/**
 * Validates project JSON format and required fields.
 */
function validateProjectSchema(project) {
  if (!project || typeof project !== 'object') {
    return { valid: false, error: 'Project must be a valid JSON object' };
  }

  if (!project.id || !project.name) {
    return { valid: false, error: 'Project is missing required id or name' };
  }

  if (!Array.isArray(project.elements)) {
    project.elements = [];
  }

  if (!project.duration || project.duration < 1 || project.duration > 180) {
    project.duration = 15;
  }

  if (!project.aspectRatio) {
    project.aspectRatio = '9:16';
  }

  return { valid: true, project };
}
