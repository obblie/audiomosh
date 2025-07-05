import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { createFile, DataStream, MP4ArrayBuffer, MP4File } from "mp4box";

import { AudioSegment, Segment, Settings } from "./types";

export const FPS = 30;

// Generate minimal silent audio without AudioContext for performance
const generateSilentAudio = (duration: number): Blob => {
  const sampleRate = 44100; // Standard sample rate
  const bufferSize = Math.floor(sampleRate * duration);
  const arrayBuffer = new ArrayBuffer(44 + bufferSize * 2);
  const view = new DataView(arrayBuffer);
  
  // WAV header for silent audio
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + bufferSize * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, bufferSize * 2, true);
  
  // All data is already zero (silent), so we don't need to write anything
  // The ArrayBuffer is initialized with zeros
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
};

// Audio generation functions
const generateNoiseBuffer = (
  audioContext: AudioContext,
  type: 'white' | 'pink' | 'brown',
  duration: number
): AudioBuffer => {
  const sampleRate = audioContext.sampleRate;
  const bufferSize = Math.floor(sampleRate * duration);
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  
  switch (type) {
    case 'white':
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      break;
      
    case 'pink':
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
      break;
      
    case 'brown':
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      }
      break;
  }
  
  return buffer;
};

const generateSineBuffer = (
  audioContext: AudioContext,
  frequency: number,
  duration: number
): AudioBuffer => {
  const sampleRate = audioContext.sampleRate;
  const bufferSize = Math.floor(sampleRate * duration);
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  
  return buffer;
};

const generateSegmentAudio = async (
  audioContext: AudioContext,
  audioSegment: AudioSegment,
  duration: number,
  volume: number = 0.5
): Promise<AudioBuffer> => {
  let sourceBuffer: AudioBuffer;
  
  switch (audioSegment.type) {
    case 'noise':
      sourceBuffer = generateNoiseBuffer(
        audioContext,
        audioSegment.noiseType || 'white',
        duration
      );
      break;
      
    case 'sine':
      sourceBuffer = generateSineBuffer(
        audioContext,
        audioSegment.frequency || 440,
        duration
      );
      break;
      
    case 'sample':
      if (audioSegment.sampleUrl) {
        try {
          console.log(`🎵 Loading sample from: ${audioSegment.sampleUrl}`);
          const response = await fetch(audioSegment.sampleUrl);
          const arrayBuffer = await response.arrayBuffer();
          const sampleBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Create a buffer for the desired duration
          const targetSamples = Math.floor(audioContext.sampleRate * duration);
          sourceBuffer = audioContext.createBuffer(1, targetSamples, audioContext.sampleRate);
          const targetData = sourceBuffer.getChannelData(0);
          const sampleData = sampleBuffer.getChannelData(0);
          
          // Play the sample once, padding with silence if needed
          // This allows each repeat to truly retrigger the sample from the beginning
          const copyLength = Math.min(sampleData.length, targetSamples);
          for (let i = 0; i < copyLength; i++) {
            targetData[i] = sampleData[i];
          }
          // The rest remains silent (zeros) if sample is shorter than duration
          
          console.log(`🎵 Sample loaded successfully:`, {
            originalLength: sampleData.length,
            targetLength: targetSamples,
            duration: duration.toFixed(3),
            sampleRate: audioContext.sampleRate
          });
        } catch (error) {
          console.error('🎵 Failed to load sample, using silence:', error);
          sourceBuffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
        }
      } else {
        console.warn('🎵 No sample URL provided, using silence');
        sourceBuffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
      }
      break;
      
    default:
      // Generate silence
      sourceBuffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
  }
  
  // Apply volume
  const segmentVolume = (audioSegment.volume || 1.0) * volume;
  if (segmentVolume !== 1.0) {
    const data = sourceBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] *= segmentVolume;
    }
  }
  
  return sourceBuffer;
};

const generateTimelineAudio = async (
  segments: Segment[],
  audioVolume: number = 0.5
): Promise<Blob> => {
  // Early exit: Check if any segments have audio before initializing AudioContext
  const hasAudioSegments = segments.some(segment => segment.audio);
  if (!hasAudioSegments) {
    console.log('🎵 No audio segments found, generating minimal silent audio');
    // Return minimal silent audio without AudioContext
    return generateSilentAudio(1.0); // 1 second of silence
  }
  
  console.log('🎵 Initializing AudioContext for audio generation...');
  const startTime = performance.now();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Calculate total duration
  let totalDuration = 0;
  const segmentDurations: number[] = [];
  
  segments.forEach(segment => {
    const segmentFrames = segment.to - segment.from;
    const segmentDuration = segmentFrames / FPS;
    const totalSegmentDuration = segmentDuration * segment.repeat;
    segmentDurations.push(totalSegmentDuration);
    totalDuration += totalSegmentDuration;
  });
  
  if (totalDuration === 0) {
    // Return silent audio
    console.log('🎵 Total duration is 0, generating silent audio');
    await audioContext.close(); // Clean up
    return generateSilentAudio(1.0);
  }
  
  // Create final audio buffer
  const finalBuffer = audioContext.createBuffer(
    1,
    Math.floor(audioContext.sampleRate * totalDuration),
    audioContext.sampleRate
  );
  const finalData = finalBuffer.getChannelData(0);
  
  let currentOffset = 0;
  
  // Generate audio for each segment, handling repeats properly
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    if (segment.audio) {
      console.log(`🎵 Generating audio for segment ${i}:`, {
        type: segment.audio.type,
        repeat: segment.repeat,
        volume: segment.audio.volume,
        frequency: segment.audio.frequency,
        noiseType: segment.audio.noiseType,
        sampleUrl: segment.audio.sampleUrl
      });
      
      // Calculate duration for a single play of this segment (without repeats)
      const segmentFrames = segment.to - segment.from;
      const singlePlayDuration = segmentFrames / FPS;
      
      // Generate audio for each repeat
      for (let repeatIndex = 0; repeatIndex < segment.repeat; repeatIndex++) {
        console.log(`🎵 Generating repeat ${repeatIndex + 1}/${segment.repeat} for segment ${i}:`, {
          singlePlayDuration: singlePlayDuration.toFixed(3),
          audioType: segment.audio.type,
          currentOffset: currentOffset,
          totalDuration: totalDuration
        });
        
        const segmentBuffer = await generateSegmentAudio(
          audioContext,
          segment.audio,
          singlePlayDuration, // Use single play duration, not total duration
          audioVolume
        );
        
        const segmentData = segmentBuffer.getChannelData(0);
        const copyLength = Math.min(segmentData.length, finalData.length - currentOffset);
        
        // Check if audio data actually has non-zero values (only log for first repeat to avoid spam)
        if (repeatIndex === 0) {
          let hasNonZeroData = false;
          let maxValue = 0;
          for (let j = 0; j < Math.min(100, segmentData.length); j++) {
            if (Math.abs(segmentData[j]) > 0.001) {
              hasNonZeroData = true;
              maxValue = Math.max(maxValue, Math.abs(segmentData[j]));
            }
          }
          
          console.log(`🎵 Segment ${i} audio data check (${segment.repeat} repeats):`, {
            singlePlayDuration: singlePlayDuration.toFixed(3),
            bufferLength: segmentData.length,
            copyLength,
            hasNonZeroData,
            maxValue: maxValue.toFixed(4),
            firstFewSamples: Array.from(segmentData.slice(0, 10)).map(v => v.toFixed(4))
          });
        }
        
        // Copy audio data for this repeat
        for (let j = 0; j < copyLength; j++) {
          finalData[currentOffset + j] = segmentData[j];
        }
        
        currentOffset += Math.floor(audioContext.sampleRate * singlePlayDuration);
      }
    } else {
      // If no audio, advance by the total segment duration (including all repeats)
      const segmentFrames = segment.to - segment.from;
      const singlePlayDuration = segmentFrames / FPS;
      const totalSegmentDuration = singlePlayDuration * segment.repeat;
      currentOffset += Math.floor(audioContext.sampleRate * totalSegmentDuration);
    }
  }
  
  // Check final audio buffer for actual content
  const finalAudioData = finalBuffer.getChannelData(0);
  let finalHasAudio = false;
  let finalMaxValue = 0;
  for (let i = 0; i < Math.min(1000, finalAudioData.length); i++) {
    if (Math.abs(finalAudioData[i]) > 0.001) {
      finalHasAudio = true;
      finalMaxValue = Math.max(finalMaxValue, Math.abs(finalAudioData[i]));
    }
  }
  
  console.log('🎵 Final audio buffer check:', {
    totalLength: finalAudioData.length,
    duration: finalAudioData.length / audioContext.sampleRate,
    hasAudio: finalHasAudio,
    maxValue: finalMaxValue.toFixed(4),
    sampleRate: audioContext.sampleRate
  });

  // Convert AudioBuffer to WAV Blob
  const result = audioBufferToWav(finalBuffer);
  
  // Clean up AudioContext to free memory
  await audioContext.close();
  const endTime = performance.now();
  const duration = (endTime - startTime) / 1000;
  console.log(`🎵 AudioContext closed, audio generation complete in ${duration.toFixed(2)}s`);
  
  return result;
};

// Convert AudioBuffer to WAV format
const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  const arrayBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(arrayBuffer);
  const data = buffer.getChannelData(0);
  
  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);
  
  // Convert float32 to int16
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, sample * 0x7FFF, true);
    offset += 2;
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
};

const computeDescription = (file: MP4File, trackId: number) => {
  const track = file.getTrackById(trackId);
  for (const entry of track.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer, 8);
    }
  }
  throw new Error("avcC, hvcC, vpcC, or av1C box not found");
};

export const computeChunks = (
  ffmpeg: FFmpeg,
  inputFile: File,
  name: string,
  width: number,
  height: number,
  onConfig: (config: VideoDecoderConfig) => unknown
) =>
  new Promise<EncodedVideoChunk[]>(async (resolve, reject) => {
    try {
      const inputName = `input_${name}.mp4`;
      const outputName = `output_${name}_${Math.random()
        .toFixed(10)
        .substring(2)}.mp4`;
      await ffmpeg.writeFile(inputName, await fetchFile(inputFile));
      await ffmpeg.exec(
        `-i ${inputName} -vf scale=${width}:${height} -vcodec libx264 -g 99999999 -bf 0 -flags:v +cgop -pix_fmt yuv420p -movflags faststart -crf 15 ${outputName}`.split(
          " "
        )
      );
      const data = (await ffmpeg.readFile(outputName)) as Uint8Array;

      const file = createFile();
      file.onError = console.error;
      file.onReady = (info) => {
        const track = info.videoTracks[0];
        onConfig({
          codec: track.codec.startsWith("vp08") ? "vp8" : track.codec,
          codedHeight: track.video.height,
          codedWidth: track.video.width,
          description: computeDescription(file, track.id),
        });
        file.setExtractionOptions(track.id);
        file.start();
      };
      file.onSamples = async (_trackId, _ref, samples) => {
        const chunks = samples.map(
          (sample) =>
            new EncodedVideoChunk({
              type: sample.is_sync ? "key" : "delta",
              timestamp: (1e6 * sample.cts) / sample.timescale,
              duration: (1e6 * sample.duration) / sample.timescale,
              data: sample.data,
            })
        );

        resolve(chunks);
      };
      const buffer = new ArrayBuffer(data.byteLength) as MP4ArrayBuffer;
      new Uint8Array(buffer).set(data);
      buffer.fileStart = 0;
      file.appendBuffer(buffer);
    } catch (e) {
      reject(e);
    }
  });

// New function that records video with audio
export const recordWithAudio = async (
  chunks: EncodedVideoChunk[],
  config: VideoDecoderConfig,
  mimeType: string,
  settings: Settings,
  segments: Segment[],
  audioVolume: number,
  ffmpeg: FFmpeg,
  onProgress: (progress: number) => unknown
): Promise<string> => {
  try {
    console.log('🎵 Starting video+audio rendering...');
    console.log('🎵 Chunks:', chunks.length, 'Segments with audio:', segments.filter(s => s.audio).length);
    console.log('🎵 Audio volume:', audioVolume);
    console.log('🎵 Segments details:', segments.map(s => ({
      name: s.name,
      from: s.from,
      to: s.to,
      repeat: s.repeat,
      hasAudio: !!s.audio,
      audioType: s.audio?.type,
      audioVolume: s.audio?.volume
    })));
    
    // First, record the video without audio using the existing record function
    const videoSrc = await record(chunks, config, mimeType, settings, (progress) => {
      onProgress(progress * 0.7); // Video is 70% of total progress
    });

    console.log('🎬 Video recording complete:', videoSrc);
    onProgress(0.7); // Video complete
    
    // Convert video URL to blob for FFmpeg processing
    const videoResponse = await fetch(videoSrc);
    const videoBlob = await videoResponse.blob();
    console.log('🎬 Video blob size:', videoBlob.size, 'bytes');
  
    // Generate audio for the timeline
    const audioBlob = await generateTimelineAudio(segments, audioVolume);
    console.log('🎵 Audio blob size:', audioBlob.size, 'bytes');
    console.log('🎵 Audio blob type:', audioBlob.type);
    
    // Test the WAV file by reading its header
    const audioArray = new Uint8Array(await audioBlob.arrayBuffer());
    const header = String.fromCharCode(...audioArray.slice(0, 12));
    console.log('🎵 WAV file header check:', {
      header: header,
      isValidWAV: header.startsWith('RIFF') && header.includes('WAVE'),
      fileSize: audioArray.length,
      firstBytes: Array.from(audioArray.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    });
    
    onProgress(0.8); // Audio generated
    
    // Use FFmpeg to combine video and audio
    // Force MP4 extension for better compatibility
    const timestamp = Date.now();
    const videoFileName = `video_${timestamp}.mp4`;
    const audioFileName = `audio_${timestamp}.wav`;
    const outputFileName = `output_${timestamp}.mp4`;
    
    console.log('🎵 File names:', { videoFileName, audioFileName, outputFileName });
    
    await ffmpeg.writeFile(videoFileName, new Uint8Array(await videoBlob.arrayBuffer()));
    
    // Try generating audio directly in FFmpeg as a test
    const testAudioFileName = `test_audio_${timestamp}.wav`;
    
    // Generate a simple test tone with FFmpeg to compare
    console.log('🎵 Generating test audio with FFmpeg...');
    await ffmpeg.exec([
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:duration=10',
      '-ar', '44100',
      '-ac', '1',
      testAudioFileName
    ]);
    
    await ffmpeg.writeFile(audioFileName, new Uint8Array(await audioBlob.arrayBuffer()));
    console.log('🎵 Files written to FFmpeg (including test audio)');
    
    // Check if files exist in FFmpeg filesystem
          try {
        const videoFileInfo = await ffmpeg.readFile(videoFileName) as Uint8Array;
        const audioFileInfo = await ffmpeg.readFile(audioFileName) as Uint8Array;
        const testAudioFileInfo = await ffmpeg.readFile(testAudioFileName) as Uint8Array;
        console.log('🎵 FFmpeg file verification:', {
          videoFile: { name: videoFileName, size: videoFileInfo.byteLength },
          audioFile: { name: audioFileName, size: audioFileInfo.byteLength },
          testAudioFile: { name: testAudioFileName, size: testAudioFileInfo.byteLength }
        });
      } catch (error) {
        console.error('🎵 Error reading files from FFmpeg:', error);
      }
    
    onProgress(0.85); // Files written
    
    // Combine video and audio with FFmpeg
    console.log('🎵 Starting FFmpeg processing...');
    console.log('🎵 FFmpeg command:', [
      '-i', videoFileName,
      '-i', audioFileName,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      outputFileName
    ]);
    
          try {
        // First, let's probe the input files to see what FFmpeg sees
        console.log('🎵 Probing input files...');
        
        // Try a different approach - let FFmpeg handle the audio conversion more explicitly
        await ffmpeg.exec([
          '-i', videoFileName,
          '-i', audioFileName,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ar', '44100',
          '-ac', '1',  // Force mono to match our generated audio
          '-pix_fmt', 'yuv420p',
          '-map', '0:v:0',  // Explicitly map video stream
          '-map', '1:a:0',  // Explicitly map audio stream
          '-shortest',
          outputFileName
        ]);
        console.log('🎵 FFmpeg processing completed successfully');
        
        // Check if output file was created and has reasonable size
        const outputCheck = await ffmpeg.readFile(outputFileName) as Uint8Array;
        console.log('🎵 Output file check:', {
          outputSize: outputCheck.byteLength,
          outputExists: outputCheck.byteLength > 0
        });
      } catch (error) {
        console.error('🎵 FFmpeg processing failed:', error);
        console.log('🎵 Trying fallback FFmpeg command...');
        
        // Fallback: try with stream mapping
        try {
          await ffmpeg.exec([
            '-i', videoFileName,
            '-i', audioFileName,
            '-map', '0:v',
            '-map', '1:a',
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-shortest',
            outputFileName
          ]);
          console.log('🎵 Fallback FFmpeg processing succeeded');
        } catch (fallbackError) {
          console.error('🎵 Fallback FFmpeg processing also failed:', fallbackError);
          console.log('🎵 Trying with FFmpeg-generated test audio...');
          
          // Last resort: try with the FFmpeg-generated test audio
          try {
            await ffmpeg.exec([
              '-i', videoFileName,
              '-i', testAudioFileName,
              '-c:v', 'libx264',
              '-c:a', 'aac',
              '-b:a', '128k',
              '-ar', '44100',
              '-ac', '1',
              '-pix_fmt', 'yuv420p',
              '-map', '0:v:0',
              '-map', '1:a:0',
              '-shortest',
              outputFileName
            ]);
            console.log('🎵 Test audio FFmpeg processing succeeded!');
          } catch (testError) {
            console.error('🎵 Even test audio failed:', testError);
            throw testError;
          }
        }
      }
    
    onProgress(0.95); // FFmpeg processing complete
    
    // Read the final output
    const outputData = await ffmpeg.readFile(outputFileName) as Uint8Array;
    const finalBlob = new Blob([outputData], { type: 'video/mp4' });
    console.log('🎵 Final video+audio blob size:', finalBlob.size, 'bytes');
    
    // Compare sizes to verify audio was added
    console.log('🎵 Size comparison:', {
      originalVideo: videoBlob.size,
      audioOnly: audioBlob.size,
      finalWithAudio: finalBlob.size,
      sizeIncrease: finalBlob.size - videoBlob.size,
      expectedIncrease: audioBlob.size
    });
    
    // Clean up temporary files
    await ffmpeg.deleteFile(videoFileName);
    await ffmpeg.deleteFile(audioFileName);
    await ffmpeg.deleteFile(outputFileName);
    
    // Clean up the temporary video URL
    URL.revokeObjectURL(videoSrc);
    
    onProgress(1.0); // Complete
    
    return URL.createObjectURL(finalBlob);
  } catch (error) {
    console.error('🎵 Error in recordWithAudio:', error);
    onProgress(0); // Reset progress on error
    throw error;
  }
};

export const record = async (
  chunks: EncodedVideoChunk[],
  config: VideoDecoderConfig,
  mimeType: string,
  settings: Settings,
  onProgress: (progress: number) => unknown
) =>
  new Promise<string>((resolve) => {
    const startTime = performance.now();
    console.log('🎬 Starting video recording...', { chunks: chunks.length, settings });
    const canvas = document.createElement("canvas");
    canvas.width = settings.width;
    canvas.height = settings.height;
    const ctx = canvas.getContext("2d")!;

    let currentFrame: VideoFrame | null = null;
    const decoder = new VideoDecoder({
      error: console.error,
      output: (frame) => {
        // Close previous frame to prevent memory leaks
        if (currentFrame) {
          currentFrame.close();
        }
        currentFrame = frame;
        ctx.drawImage(frame, 0, 0);
      },
    });
    decoder.configure(config);

    // Use a fixed frame rate stream
    const stream = canvas.captureStream(FPS);
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.addEventListener("dataavailable", (evt) => {
      // Clean up the last frame
      if (currentFrame) {
        currentFrame.close();
      }
      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000;
      console.log(`🎬 Video recording complete in ${duration.toFixed(2)}s`);
      const src = URL.createObjectURL(evt.data);
      resolve(src);
    });

    recorder.start();
    let i = 0;
    
    // Use high-precision timing with setTimeout
    const frameInterval = 1000 / FPS; // Exactly 33.333... ms per frame
    let nextFrameTime = performance.now();
    
    const scheduleNextFrame = () => {
      if (i >= chunks.length) {
        // Wait a bit for the last frame to be captured, then stop
        setTimeout(() => {
          recorder.stop();
        }, frameInterval * 2);
        return;
      }
      
      // Only report progress every 10 frames to prevent oscillation
      if (i % 10 === 0) {
        onProgress(i / chunks.length);
      }
      
      decoder.decode(chunks[i]);
      i++;
      
      // Schedule next frame with precise timing
      nextFrameTime += frameInterval;
      const now = performance.now();
      const delay = Math.max(0, nextFrameTime - now);
      
      setTimeout(scheduleNextFrame, delay);
    };
    
    // Start processing
    scheduleNextFrame();
  });
