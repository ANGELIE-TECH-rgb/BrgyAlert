const fs = require('fs');
const path = require('path');

function generateBeepWav(filePath) {
  const sampleRate = 11025;
  const duration = 0.5; // seconds
  const frequency = 880; // Hz (A5 pitch, clean chime beep)
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2; // 16-bit mono
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8);

  // Format chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Chunk size
  buffer.writeUInt16LE(1, 20);  // PCM format
  buffer.writeUInt16LE(1, 22);  // Mono
  buffer.writeUInt32LE(sampleRate, 24); // Sample rate
  buffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  buffer.writeUInt16LE(2, 32);  // Block align
  buffer.writeUInt16LE(16, 34); // Bits per sample

  // Data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Generate sine wave
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sampleVal = Math.sin(2 * Math.PI * frequency * t);
    // Scale to 16-bit signed integer range (-32768 to 32767)
    // Add simple fade-out envelope to avoid clicking sounds
    const envelope = 1 - (i / numSamples);
    const scaledSample = Math.floor(sampleVal * 28000 * envelope);
    buffer.writeInt16LE(scaledSample, 44 + i * 2);
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated WAV chime at ${filePath}`);
}

const targetPath = path.join(__dirname, '..', '..', 'assets', 'sounds', 'notification.wav');
generateBeepWav(targetPath);
