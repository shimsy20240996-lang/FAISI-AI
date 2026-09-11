import { ValidationError } from './errors.js';

/**
 * Pure JavaScript Audio Duration Parser for WAV, WebM (Matroska), MP3, MP4/M4A, and Ogg.
 * Safely parses binary headers to extract exact playback duration without external binaries.
 */

/**
 * Parses duration from standard RIFF/WAVE header.
 * @param {Buffer} buffer
 * @returns {number|null} Duration in seconds
 */
export function parseWavDuration(buffer) {
  if (buffer.length < 44) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let byteRate = 0;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      if (chunkSize >= 14 && offset + 8 + chunkSize <= buffer.length) {
        channels = buffer.readUInt16LE(offset + 10);
        sampleRate = buffer.readUInt32LE(offset + 12);
        byteRate = buffer.readUInt32LE(offset + 16);
        if (chunkSize >= 16) {
          bitsPerSample = buffer.readUInt16LE(offset + 22);
        }
      }
    } else if (chunkId === 'data') {
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
    // Word alignment padding in RIFF
    if (chunkSize % 2 !== 0) {
      offset += 1;
    }
  }

  if (byteRate > 0 && typeof dataSize === 'number') {
    return dataSize / byteRate;
  }

  if (sampleRate > 0 && channels > 0 && bitsPerSample > 0 && typeof dataSize === 'number') {
    const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
    if (bytesPerSec > 0) {
      return dataSize / bytesPerSec;
    }
  }

  return null;
}

/**
 * Reads variable-length integer (VINT) used in EBML/Matroska/WebM.
 */
function readEbmlVint(buffer, offset) {
  if (offset >= buffer.length) return null;
  const firstByte = buffer[offset];
  let length = 0;
  let mask = 0x80;

  for (let i = 1; i <= 8; i++) {
    if ((firstByte & mask) !== 0) {
      length = i;
      break;
    }
    mask >>= 1;
  }

  if (length === 0 || offset + length > buffer.length) return null;

  let value = firstByte & (mask - 1);
  for (let i = 1; i < length; i++) {
    value = (value * 256) + buffer[offset + i];
  }

  return { value, length };
}

/**
 * Reads EBML element ID (preserves lead mask bit).
 */
function readEbmlId(buffer, offset) {
  if (offset >= buffer.length) return null;
  const firstByte = buffer[offset];
  let length = 0;
  let mask = 0x80;

  for (let i = 1; i <= 4; i++) {
    if ((firstByte & mask) !== 0) {
      length = i;
      break;
    }
    mask >>= 1;
  }

  if (length === 0 || offset + length > buffer.length) return null;

  let id = 0;
  for (let i = 0; i < length; i++) {
    id = (id * 256) + buffer[offset + i];
  }

  return { id, length };
}

/**
 * Parses duration from WebM / Matroska EBML header.
 * @param {Buffer} buffer
 * @returns {number|null} Duration in seconds
 */
export function parseWebMDuration(buffer) {
  if (buffer.length < 12) return null;
  // WebM / Matroska header ID: 0x1A 0x45 0xDF 0xA3
  if (buffer[0] !== 0x1a || buffer[1] !== 0x45 || buffer[2] !== 0xdf || buffer[3] !== 0xa3) {
    return null;
  }

  let offset = 0;
  let timecodeScale = 1000000; // default 1ms in nanoseconds
  let durationInScale = null;
  let lastClusterTimecode = null;

  const maxScan = Math.min(buffer.length, 1024 * 1024); // scan first 1MB

  while (offset < maxScan) {
    const idInfo = readEbmlId(buffer, offset);
    if (!idInfo) break;
    offset += idInfo.length;

    const sizeInfo = readEbmlVint(buffer, offset);
    if (!sizeInfo) break;
    offset += sizeInfo.length;

    const elemId = idInfo.id;
    const elemSize = sizeInfo.value;

    // Segment Info (0x1549A966) or Segment (0x18538067) container -> descend
    if (elemId === 0x18538067 || elemId === 0x1549A966) {
      continue;
    }

    // TimecodeScale (0x2AD7B1)
    if (elemId === 0x2ad7b1) {
      if (elemSize <= 8 && offset + elemSize <= buffer.length) {
        let val = 0;
        for (let i = 0; i < elemSize; i++) {
          val = (val * 256) + buffer[offset + i];
        }
        if (val > 0) timecodeScale = val;
      }
      offset += elemSize;
      continue;
    }

    // Duration (0x4489) - 4-byte or 8-byte float
    if (elemId === 0x4489) {
      if (elemSize === 4 && offset + 4 <= buffer.length) {
        durationInScale = buffer.readFloatBE(offset);
      } else if (elemSize === 8 && offset + 8 <= buffer.length) {
        durationInScale = buffer.readDoubleBE(offset);
      }
      if (durationInScale !== null && !isNaN(durationInScale) && durationInScale > 0) {
        return (durationInScale * timecodeScale) / 1000000000;
      }
      offset += elemSize;
      continue;
    }

    // Cluster (0x1F43B675)
    if (elemId === 0x1f43b675) {
      // Look inside cluster for Timecode (0xE7)
      let clusterOffset = offset;
      const clusterEnd = Math.min(offset + elemSize, buffer.length);
      while (clusterOffset + 3 <= clusterEnd) {
        const cId = readEbmlId(buffer, clusterOffset);
        if (!cId) break;
        clusterOffset += cId.length;
        const cSize = readEbmlVint(buffer, clusterOffset);
        if (!cSize) break;
        clusterOffset += cSize.length;

        if (cId.id === 0xe7 && cSize.value <= 8 && clusterOffset + cSize.value <= buffer.length) {
          let tc = 0;
          for (let k = 0; k < cSize.value; k++) {
            tc = (tc * 256) + buffer[clusterOffset + k];
          }
          lastClusterTimecode = tc;
          break;
        }
        clusterOffset += cSize.value;
      }
    }

    offset += elemSize;
  }

  if (lastClusterTimecode !== null && lastClusterTimecode > 0) {
    return (lastClusterTimecode * timecodeScale) / 1000000000;
  }

  return null;
}

/**
 * Parses duration from MP4 / M4A 'mvhd' or 'mdhd' atom.
 * @param {Buffer} buffer
 * @returns {number|null} Duration in seconds
 */
export function parseMp4Duration(buffer) {
  if (buffer.length < 16) return null;

  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (size === 0) break;

    const actualSize = size === 1 && offset + 16 <= buffer.length
      ? Number(buffer.readBigUInt64BE(offset + 8))
      : size;

    if (type === 'moov' || type === 'trak' || type === 'mdia') {
      // Descend into container box
      offset += (size === 1 ? 16 : 8);
      continue;
    }

    if (type === 'mvhd' && offset + 24 <= buffer.length) {
      const headerOffset = offset + (size === 1 ? 16 : 8);
      const version = buffer.readUInt8(headerOffset);
      let timescale = 0;
      let duration = 0;

      if (version === 0 && headerOffset + 20 <= buffer.length) {
        timescale = buffer.readUInt32BE(headerOffset + 12);
        duration = buffer.readUInt32BE(headerOffset + 16);
      } else if (version === 1 && headerOffset + 28 <= buffer.length) {
        timescale = buffer.readUInt32BE(headerOffset + 20);
        duration = Number(buffer.readBigUInt64BE(headerOffset + 24));
      }

      if (timescale > 0 && duration > 0) {
        return duration / timescale;
      }
    }

    offset += actualSize;
  }

  return null;
}

/**
 * Parses duration from Ogg pages (by reading the last page's granule position).
 * @param {Buffer} buffer
 * @returns {number|null} Duration in seconds
 */
export function parseOggDuration(buffer) {
  if (buffer.length < 28 || buffer.toString('ascii', 0, 4) !== 'OggS') {
    return null;
  }

  // Scan backwards for last "OggS" page
  let offset = buffer.length - 27;
  while (offset >= 0) {
    if (
      buffer[offset] === 0x4f &&
      buffer[offset + 1] === 0x67 &&
      buffer[offset + 2] === 0x67 &&
      buffer[offset + 3] === 0x53
    ) {
      // Read 64-bit granule position at offset 6
      const granulePosLow = buffer.readUInt32LE(offset + 6);
      const granulePosHigh = buffer.readUInt32LE(offset + 10);
      const granulePos = granulePosHigh * 4294967296 + granulePosLow;

      // For standard Opus (48 kHz default) or Vorbis:
      if (granulePos > 0) {
        // Opus standard timescale is 48000 Hz
        return granulePos / 48000;
      }
      break;
    }
    offset--;
  }

  return null;
}

/**
 * Parses duration from MP3 frames.
 * @param {Buffer} buffer
 * @returns {number|null} Duration in seconds
 */
export function parseMp3Duration(buffer) {
  if (buffer.length < 10) return null;

  let offset = 0;
  // Skip ID3v2 header if present
  if (buffer.toString('ascii', 0, 3) === 'ID3' && buffer.length >= 10) {
    const id3Size =
      ((buffer[6] & 0x7f) << 21) |
      ((buffer[7] & 0x7f) << 14) |
      ((buffer[8] & 0x7f) << 7) |
      (buffer[9] & 0x7f);
    offset = 10 + id3Size;
  }

  // Bitrate and sample rate lookup tables for MPEG-1 Layer 3
  const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const sampleRates = [44100, 48000, 32000, 0];

  let totalFrames = 0;
  let sampleRate = 44100;

  while (offset + 4 < buffer.length) {
    if (buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0) {
      const b2 = buffer[offset + 1];
      const b3 = buffer[offset + 2];
      const layer = (b2 >> 1) & 0x03;
      const bitrateIdx = (b3 >> 4) & 0x0f;
      const srIdx = (b3 >> 2) & 0x03;
      const padding = (b3 >> 1) & 0x01;

      if (layer === 1 && bitrateIdx > 0 && bitrateIdx < 15 && srIdx < 3) {
        const kbps = bitrates[bitrateIdx];
        sampleRate = sampleRates[srIdx];
        const frameSize = Math.floor((144 * kbps * 1000) / sampleRate) + padding;
        if (frameSize > 0) {
          totalFrames++;
          offset += frameSize;
          continue;
        }
      }
    }
    offset++;
  }

  if (totalFrames > 0 && sampleRate > 0) {
    return (totalFrames * 1152) / sampleRate;
  }

  return null;
}

/**
 * Validates that an audio buffer does not exceed max allowed duration in seconds.
 * @param {Buffer} buffer Raw audio buffer
 * @param {string} mimeType Detected or declared MIME type
 * @param {number} maxDurationSeconds Maximum allowed duration (default 60)
 * @returns {number|null} Validated duration in seconds (or null if uncontainerized stream)
 * @throws {ValidationError} If duration exceeds limit or contains invalid/impossible metadata
 */
export function validateAudioDuration(buffer, mimeType = '', maxDurationSeconds = 60) {
  if (!buffer || buffer.length === 0) {
    throw new ValidationError('Audio file is empty.');
  }

  let duration = null;

  try {
    if (mimeType.includes('wav')) {
      duration = parseWavDuration(buffer);
    } else if (mimeType.includes('webm') || mimeType.includes('matroska') || mimeType.includes('mkv')) {
      duration = parseWebMDuration(buffer);
    } else if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) {
      duration = parseMp4Duration(buffer);
    } else if (mimeType.includes('ogg')) {
      duration = parseOggDuration(buffer);
    } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      duration = parseMp3Duration(buffer);
    } else {
      // Try all parsers in order
      duration =
        parseWebMDuration(buffer) ??
        parseWavDuration(buffer) ??
        parseMp3Duration(buffer) ??
        parseOggDuration(buffer) ??
        parseMp4Duration(buffer);
    }
  } catch (parseErr) {
    throw new ValidationError(`Malformed audio container or corrupt metadata: ${parseErr.message}`);
  }

  if (duration !== null) {
    if (isNaN(duration) || !isFinite(duration) || duration <= 0) {
      throw new ValidationError('Invalid, zero, or impossible audio duration metadata in audio container.');
    }
    if (duration > maxDurationSeconds) {
      throw new ValidationError(
        `Audio recording duration (${duration.toFixed(1)} seconds) exceeds the maximum allowed limit of ${maxDurationSeconds} seconds.`
      );
    }
  }

  return duration;
}
