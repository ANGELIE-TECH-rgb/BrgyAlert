const fs = require('fs');
const path = require('path');

function generateWavFile(filePath, duration, getFrequencyAtTime, isSiren = false) {
  const sampleRate = 44100;
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

  // Generate PCM wave samples
  let phase = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const frequency = getFrequencyAtTime(t);
    
    // Accumulate phase based on instantaneous frequency to support clean sweeps
    phase += (2 * Math.PI * frequency) / sampleRate;

    const sampleVal = Math.sin(phase);

    // Apply envelope
    let envelope = 1;
    if (isSiren) {
      // Emergency siren tremolo (volume pulsation) at 2Hz
      const tremolo = 0.85 + 0.15 * Math.sin(2 * Math.PI * 2 * t);
      // Fade out only at the very end to avoid sudden pop cuts
      const endFade = t > (duration - 0.1) ? (duration - t) / 0.1 : 1;
      envelope = tremolo * endFade;
    } else {
      // Standard linear fade-out envelope
      envelope = 1 - (i / numSamples);
    }

    const scaledSample = Math.floor(sampleVal * 28000 * envelope);
    buffer.writeInt16LE(scaledSample, 44 + i * 2);
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated WAV sound at ${filePath}`);
}

const soundsDir = path.join(__dirname, '..', '..', 'assets', 'sounds');

// 1. Message Sound: 0.25s at 1100Hz (High-pitch quick chime)
generateWavFile(
  path.join(soundsDir, 'message.wav'),
  0.25,
  () => 1100,
  false
);

// 2. Incident Report Sound: 0.5s at 660Hz (Standard alert chime)
generateWavFile(
  path.join(soundsDir, 'report.wav'),
  0.50,
  () => 660,
  false
);

// 3. Emergency Siren Sound: 1.5s with LFO frequency sweep (850Hz to 1150Hz warning siren)
generateWavFile(
  path.join(soundsDir, 'emergency.wav'),
  1.50,
  (t) => 1000 + 150 * Math.sin(2 * Math.PI * 3.5 * t), // 3.5Hz frequency sweep LFO
  true
);

// 4. Default notification.wav fallback (compatibility copy)
generateWavFile(
  path.join(soundsDir, 'notification.wav'),
  0.50,
  () => 660,
  false
);
