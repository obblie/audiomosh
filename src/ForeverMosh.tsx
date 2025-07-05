import { useCallback, useEffect, useRef, useState } from "react";
import { Segment } from "./types";
import { computeChunks, record, recordWithAudio } from "./lib";

/**
 * ForeverMosh - Continuous Video Stream with Proxy API Integration
 * 
 * This component creates an endless video stream by:
 * 1. Fetching random videos from Pexels API via proxy service
 * 2. Fetching audio from Freesound API via proxy service
 * 3. Processing them with supermosh algorithm
 * 4. Displaying them in a continuous full-screen stream
 * 
 * Required Environment Variables:
 * - VITE_PEXELS_PROXY_BASE: Proxy service URL for Pexels API (e.g., http://localhost:3001/api/pexels)
 * - VITE_FREESOUND_PROXY_BASE: Proxy service URL for Freesound API (e.g., http://localhost:3001/api/freesound)
 * 
 * Features:
 * - Automatic video fetching from Pexels with randomized keywords
 * - Automatic audio fetching from Freesound with Creative Commons filtering
 * - Smart quality selection (prefers HD/SD)
 * - Error handling with fallback videos
 * - Real-time stats overlay
 * - Mobile responsive design
 * - Proxy-based API calls for security
 */

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  user: {
    id: number;
    name: string;
    url: string;
  };
  video_files: Array<{
    id: number;
    quality: string;
    file_type: string;
    width: number;
    height: number;
    link: string;
  }>;
  video_pictures: Array<{
    id: number;
    picture: string;
    nr: number;
  }>;
}

interface PexelsResponse {
  page: number;
  per_page: number;
  total_results: number;
  next_page?: string;
  videos: PexelsVideo[];
}

interface FreesoundSound {
  id: number;
  name: string;
  description: string;
  username: string;
  duration: number;
  filesize: number;
  samplerate: number;
  channels: number;
  bitrate: number;
  tags: string[];
  license: string;
  previews: {
    'preview-hq-mp3': string;
    'preview-lq-mp3': string;
    'preview-hq-ogg': string;
    'preview-lq-ogg': string;
  };
}

interface FreesoundResponse {
  count: number;
  next?: string;
  results: FreesoundSound[];
}

interface ProcessedAudio {
  id: string;
  originalId: string;
  originalUrl: string;
  processedUrl: string;
  timestamp: Date;
  freesoundData?: FreesoundSound;
}

interface ProcessedVideo {
  id: string;
  originalId: string;
  originalUrl: string;
  processedUrl: string;
  timestamp: Date;
  pexelsData?: PexelsVideo;
  moshingData?: {
    preset: string;
    segments: Segment[];
    processingTime: number;
    audioIncluded: boolean;
  };
}

// Moshing presets for ForeverMosh processing (new structure)
const MOSH_PRESETS = [
  { name: "Classic Melt", type: "classic" },
  { name: "Swap Morph", type: "swap" },
  { name: "Stutter", type: "stutter" },
  { name: "Random Chaos", type: "random" },
  { name: "Ghost Blend", type: "blend" }
];

// Utility to pick a random preset
function pickRandomPreset() {
  return MOSH_PRESETS[Math.floor(Math.random() * MOSH_PRESETS.length)];
}

// Efficient datamosh implementations - focus on Classic Melt and Stutter
function moshClassic(chunks: EncodedVideoChunk[], targetFrames: number = 150): EncodedVideoChunk[] {
  console.log('🎭 Applying Classic Melt datamosh...');
  
  if (chunks.length < 10) return chunks;
  
  const result: EncodedVideoChunk[] = [];
  
  // Find the first I-frame (key frame) efficiently
  const iFrameIndex = chunks.findIndex(chunk => chunk.type === 'key');
  if (iFrameIndex === -1) {
    console.warn('🎭 No I-frame found, using first chunk');
    result.push(chunks[0]);
    return result;
  }
  
  // Add the I-frame
  result.push(chunks[iFrameIndex]);
  
  // Find P-frames to repeat (delta frames) - limit to 15 for efficiency
  const pFrames = chunks.slice(iFrameIndex + 1, iFrameIndex + 16).filter(chunk => chunk.type === 'delta');
  
  if (pFrames.length === 0) {
    console.warn('🎭 No P-frames found after I-frame');
    return result;
  }
  
  // Repeat P-frames to create melting effect - efficient calculation
  const repeatCount = Math.min(20, Math.floor(targetFrames / pFrames.length));
  console.log(`🎭 Repeating ${pFrames.length} P-frames ${repeatCount} times for melting effect`);
  
  // Efficient repetition using Array.fill and flatMap
  const repeatedPFrames = Array(repeatCount).fill(pFrames).flat();
  result.push(...repeatedPFrames);
  
  // Add some random P-frames for extra chaos - limited for efficiency
  const allPFrames = chunks.filter(chunk => chunk.type === 'delta');
  const randomCount = Math.min(8, allPFrames.length);
  for (let i = 0; i < randomCount; i++) {
    result.push(allPFrames[Math.floor(Math.random() * allPFrames.length)]);
  }
  
  console.log(`🎭 Classic Melt complete: ${result.length} chunks`);
  return result;
}

function moshStutter(chunks: EncodedVideoChunk[], targetFrames: number = 150): EncodedVideoChunk[] {
  console.log('🎭 Applying Stutter datamosh...');
  
  if (chunks.length < 10) return chunks;
  
  const result: EncodedVideoChunk[] = [];
  
  // Find I-frames efficiently
  const iFrames = chunks.map((chunk, index) => chunk.type === 'key' ? index : -1).filter(index => index !== -1);
  
  if (iFrames.length === 0) {
    console.warn('🎭 No I-frames found for stutter');
    return chunks;
  }
  
  // Create stutter patterns efficiently
  for (let i = 0; i < iFrames.length && result.length < targetFrames; i++) {
    const iFrameIndex = iFrames[i];
    
    // Add the I-frame
    result.push(chunks[iFrameIndex]);
    
    // Find P-frames after this I-frame - limit to 8 for efficiency
    const pFrames = chunks.slice(iFrameIndex + 1, iFrameIndex + 9).filter(chunk => chunk.type === 'delta');
    
    if (pFrames.length > 0) {
      // Stutter: repeat the P-frame sequence 3-6 times
      const stutterCount = 3 + Math.floor(Math.random() * 4);
      for (let stutter = 0; stutter < stutterCount; stutter++) {
        result.push(...pFrames);
      }
    }
  }
  
  // Add micro-stutters efficiently
  const allPFrames = chunks.filter(chunk => chunk.type === 'delta');
  if (allPFrames.length > 0) {
    const microStutterCount = Math.min(4, Math.floor(Math.random() * 5) + 2);
    for (let i = 0; i < microStutterCount; i++) {
      const randomPFrame = allPFrames[Math.floor(Math.random() * allPFrames.length)];
      const microRepeat = 5 + Math.floor(Math.random() * 8);
      for (let j = 0; j < microRepeat; j++) {
        result.push(randomPFrame);
      }
    }
  }
  
  console.log(`🎭 Stutter complete: ${result.length} chunks`);
  return result;
}

// Keep other presets as stubs for now
function moshSwap(chunks: EncodedVideoChunk[]): EncodedVideoChunk[] {
  // TODO: Implement swap morph (I-frame + P-frames from another GOP)
  return chunks;
}
function moshRandom(chunks: EncodedVideoChunk[]): EncodedVideoChunk[] {
  // TODO: Implement random chaos (I-frame + random P-frames)
  return chunks;
}
function moshBlend(chunks: EncodedVideoChunk[]): EncodedVideoChunk[] {
  // TODO: Implement blend (I-frame + crossfaded P-frames)
  return chunks;
}

// Add logging utility at the top of the file
let allLogs: string[] = [];

const logToFile = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const csvLine = `${timestamp},"${message.replace(/"/g, '""')}","${JSON.stringify(data || '').replace(/"/g, '""')}"\n`;
  
  // Add to all logs array
  allLogs.push(csvLine);
  
  // Also log to console for debugging
  console.log(`[${timestamp}] ${message}`, data);
  console.log(`📊 Total logs accumulated: ${allLogs.length}`);
};

const downloadLogFile = () => {
  if (allLogs.length === 0) {
    console.log('No logs to download');
    return;
  }
  
  console.log(`📊 Preparing to download ${allLogs.length} log entries...`);
  
  // Create CSV header
  const header = 'timestamp,message,data\n';
  const csvContent = header + allLogs.join('');
  
  console.log(`📊 CSV content length: ${csvContent.length} characters`);
  
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'forevermosh_complete_log.csv';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log(`✅ Downloaded ${allLogs.length} log entries as single file`);
};

export const ForeverMosh = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentVideo, setCurrentVideo] = useState<ProcessedVideo | null>(null);
  const [currentAudio, setCurrentAudio] = useState<ProcessedAudio | null>(null);
  const [videoQueue, setVideoQueue] = useState<ProcessedVideo[]>([]);
  const [audioQueue, setAudioQueue] = useState<ProcessedAudio[]>([]);
  const [rawVideoQueue, setRawVideoQueue] = useState<ProcessedVideo[]>([]); // Raw videos waiting for processing
  const [rawAudioQueue, setRawAudioQueue] = useState<ProcessedAudio[]>([]); // Raw audio waiting for processing
  const [processingQueue, setProcessingQueue] = useState<{video: ProcessedVideo, audio: ProcessedAudio, preset: any}[]>([]); // Items being processed
  const [isLoading, setIsLoading] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isPreloading, setIsPreloading] = useState(true);
  const [showDebug, setShowDebug] = useState(true); // Debug text toggle
  const [isFirstVideo, setIsFirstVideo] = useState(true); // Track if this is the first video
  const MIN_PRELOAD_VIDEOS = 4; // Minimum videos to preload before starting
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    videosProcessed: 0,
    audiosProcessed: 0,
    queueLength: 0,
    audioQueueLength: 0,
    rawVideoCount: 0,
    rawAudioCount: 0,
    processingCount: 0,
    failedProcessing: 0,
    uptime: 0,
    startTime: Date.now()
  });

  // API configuration (using backend proxy endpoints)
  const PEXELS_PROXY_BASE = import.meta.env.VITE_PEXELS_PROXY_BASE || 'http://localhost:3001/api/pexels';
  const FREESOUND_PROXY_BASE = import.meta.env.VITE_FREESOUND_PROXY_BASE || 'http://localhost:3001/api/freesound';

  // Debug logging for proxy URLs
  console.log('🔧 Proxy URLs:', {
    PEXELS_PROXY_BASE,
    FREESOUND_PROXY_BASE,
    envVars: {
      VITE_PEXELS_PROXY_BASE: import.meta.env.VITE_PEXELS_PROXY_BASE,
      VITE_FREESOUND_PROXY_BASE: import.meta.env.VITE_FREESOUND_PROXY_BASE
    }
  });
  
  // Search keywords for video variety
  const searchKeywords = [
    'nature', 'ocean', 'city', 'abstract', 'technology', 'space', 'mountains', 
    'sunset', 'clouds', 'forest', 'water', 'fire', 'light', 'motion', 'art'
  ];

  // Search keywords for audio variety
  const audioKeywords = [
    'ambient', 'synth', 'drum', 'bass', 'melody', 'electronic', 'experimental',
    'texture', 'atmosphere', 'rhythm', 'harmony', 'soundscape', 'loop', 'beat', 'tone'
  ];

  // Keyboard listener for debug toggle
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 't' || event.key === 'T') {
        setShowDebug(prev => !prev);
        console.log('🔧 Debug text toggled:', !showDebug);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showDebug]);

  // Clear fallback videos from queue
  const clearFallbackVideos = useCallback(() => {
    setVideoQueue(prev => {
      const filtered = prev.filter(video => 
        !video.id?.includes('fallback') && 
        !video.moshingData?.preset?.includes('fallback')
      );
      const removed = prev.length - filtered.length;
      if (removed > 0) {
        console.log(`🧹 Removed ${removed} fallback videos from queue`);
      }
      return filtered;
    });
    
    setAudioQueue(prev => {
      const filtered = prev.filter(audio => 
        !audio.id?.includes('fallback')
      );
      const removed = prev.length - filtered.length;
      if (removed > 0) {
        console.log(`🧹 Removed ${removed} fallback audio tracks from queue`);
      }
      return filtered;
    });
  }, []);

  // Force queue function to manually trigger playback
  const forceQueue = useCallback(() => {
    console.log('🚀 Force queue triggered with', videoQueue.length, 'videos ready');
    if (videoQueue.length > 0) {
      playNextVideo();
    } else {
      console.log('⚠️ No videos in queue to force play');
    }
  }, [videoQueue]);

  // Process multiple videos together into a 20-second moshed clip
  const processMoshPair = async (
    rawVideo: ProcessedVideo, 
    rawAudio: ProcessedAudio
  ): Promise<ProcessedVideo> => {
    const startTime = performance.now();
    console.log('🎭 Starting supermosh processing for pair:', {
      primaryVideo: rawVideo.id,
      audio: rawAudio.id,
      availableVideos: rawVideoQueue.length,
      audioName: rawAudio.freesoundData?.name
    });

    try {
      // Target variable duration between 3-7 seconds at 30 FPS = 90-210 frames
      const minDuration = 3; // 3 seconds
      const maxDuration = 7; // 7 seconds
      const TARGET_DURATION_SECONDS = Math.random() * (maxDuration - minDuration) + minDuration;
      const TARGET_DURATION_FRAMES = Math.floor(TARGET_DURATION_SECONDS * 30);

      // Get FFmpeg instance
      const ffmpeg = new (await import('@ffmpeg/ffmpeg')).FFmpeg();
      const { toBlobURL, fetchFile } = await import('@ffmpeg/util');
      if (!ffmpeg.loaded) {
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
      }

      // Download the video file
      const videoResponse = await fetch(rawVideo.processedUrl);
          const videoBlob = await videoResponse.blob();
      const videoFile = new File([videoBlob], `${rawVideo.id}.mp4`, { type: 'video/mp4' });

      // Extract video chunks and config
          let videoConfig: VideoDecoderConfig | null = null;
          const chunks = await computeChunks(
            ffmpeg,
            videoFile,
        rawVideo.id,
        640, // You may want to detect or set dynamically
        480,
            (config: VideoDecoderConfig) => {
              videoConfig = config;
            }
          );
      if (!videoConfig || chunks.length === 0) throw new Error('Failed to extract video chunks');

      // Build a segment list for neverending mosh effect using the Blends preset
      const BLENDS_PRESET = [
        { from: 0, to: 39, repeat: 1 },
        { from: 38, to: 44, repeat: 39 },
        { from: 4, to: 50, repeat: 1 },
        { from: 48, to: 55, repeat: 40 },
        { from: 53, to: 57, repeat: 25 },
        { from: 90, to: 120, repeat: 1 },
        { from: 118, to: 122, repeat: 54 }
      ];
      // Adapt segments to the current video length
      const segments = BLENDS_PRESET.map((seg, i) => ({
        name: rawVideo.id,
        from: Math.max(0, Math.min(seg.from, chunks.length - 1)),
        to: Math.max(seg.from + 1, Math.min(seg.to, chunks.length)),
        repeat: seg.repeat,
        audio: {
          type: 'sample' as const,
          sampleUrl: rawAudio.processedUrl,
          volume: 0.5 + 0.1 * (i % 3) // vary volume a bit for variety
        }
      }));

      // Prepare audio volume (default 0.5)
      const audioVolume = 0.5;
      const settings = { width: 640, height: 480 };
      const mimeType = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
              
      // Build the chunks array exactly like Studio does in Rendering.tsx
      const processedChunks = segments.flatMap((s) =>
        Array(s.repeat)
          .fill(null)
          .flatMap(() =>
            chunks.slice(s.from, s.to)
          )
      );

      logToFile('🎭 Built chunks array', {
        originalChunks: chunks.length,
        processedChunks: processedChunks.length,
        segments: segments.map(s => ({
          from: s.from,
          to: s.to,
          repeat: s.repeat,
          chunkCount: (s.to - s.from) * s.repeat,
          audio: s.audio ? 'configured' : 'missing'
        }))
      });
          
      // Call recordWithAudio as in Studio
      const moshedVideoUrl = await recordWithAudio(
        processedChunks, // Pass the properly built chunks array
        videoConfig,
            mimeType,
        settings,
        segments,
        audioVolume,
        ffmpeg,
            (progress: number) => {
          const progressPercent = Math.round(progress * 100);
          logToFile('🎭 Moshing progress', {
            progress: progressPercent,
            timestamp: performance.now()
          });
        }
          );

        const processingTime = performance.now() - startTime;
        const moshedVideo: ProcessedVideo = {
          ...rawVideo,
        id: `moshed-supermosh-${Date.now()}-${rawVideo.originalId}`,
          processedUrl: moshedVideoUrl,
          moshingData: {
          preset: 'supermosh',
          segments,
            processingTime,
          audioIncluded: true
          }
        };
      logToFile('🎭 Supermosh processing complete', {
          processingTime: processingTime.toFixed(2) + 'ms',
        finalDuration: (TARGET_DURATION_FRAMES / 30).toFixed(1) + 's',
        segmentsCount: segments.length,
        audioConfigured: segments.some(s => s.audio)
        });
        return moshedVideo;
    } catch (error) {
      logToFile('🎭 Supermosh processing failed', {
        error: error instanceof Error ? error.message : String(error),
        videoId: rawVideo.id,
        audioId: rawAudio.id
      });
      throw new Error('Moshing failed - skipping video');
    }
  };

  // Process the next item in the processing queue
  const processNextInQueue = async () => {
    if (processingQueue.length === 0) return;

    const { video, audio, preset } = processingQueue[0];
    logToFile('🎭 Processing queue item', { 
      video: video.id, 
      audio: audio.id,
      preset,
      queueLength: processingQueue.length,
      timestamp: performance.now()
    });

    try {
      // Add timeout to prevent hanging (increased to 10 minutes for complex processing)
      const processedVideo = await Promise.race([
        processMoshPair(video, audio),
        new Promise<ProcessedVideo>((_, reject) => 
          setTimeout(() => reject(new Error('Processing timeout after 10 minutes')), 10 * 60 * 1000)
        )
      ]);
      
      // Check if this is a fallback video and skip it
      if (processedVideo.moshingData?.preset?.includes('fallback') || 
          processedVideo.id?.includes('fallback')) {
        logToFile('🎭 Skipping fallback video', { processedVideoId: processedVideo.id });
        // Remove from processing queue without adding to video queue
        setProcessingQueue(prev => prev.slice(1));
        setStats(prev => ({
          ...prev,
          processingCount: prev.processingCount - 1
        }));
        return;
      }
      
      // Add to final video queue
      setVideoQueue(prev => {
        const newQueue = [...prev, processedVideo];
        logToFile('🎭 Video queue updated', {
          previousLength: prev.length,
          newLength: newQueue.length,
          addedVideo: processedVideo.id,
          queueIds: newQueue.map(v => v.id),
          audioIncluded: processedVideo.moshingData?.audioIncluded
        });
        return newQueue;
      });
      
      // Only add audio to queue if it wasn't chopped into the video
      if (!processedVideo.moshingData?.audioIncluded) {
        setAudioQueue(prev => [...prev, audio]);
        logToFile('🎵 Audio added to separate queue', { audioId: audio.id });
      } else {
        logToFile('🎵 Audio was chopped into video', { 
          audioId: audio.id,
          videoId: processedVideo.id,
          audioIncluded: true
        });
      }
      
      // Remove from processing queue
      setProcessingQueue(prev => prev.slice(1));
      
      // Update stats
      setStats(prev => ({
        ...prev,
        videosProcessed: prev.videosProcessed + 1,
        audiosProcessed: processedVideo.moshingData?.audioIncluded ? prev.audiosProcessed : prev.audiosProcessed + 1,
        queueLength: prev.queueLength + 1,
        audioQueueLength: processedVideo.moshingData?.audioIncluded ? prev.audioQueueLength : prev.audioQueueLength + 1,
        processingCount: prev.processingCount - 1
      }));

      logToFile('📊 Stats updated after processing', {
        videosProcessed: stats.videosProcessed + 1,
        queueLength: videoQueue.length + 1,
        audioIncluded: processedVideo.moshingData?.audioIncluded,
        processingTime: processedVideo.moshingData?.processingTime
      });

      logToFile('✅ Processed and queued video', { 
        processedVideoId: processedVideo.id, 
        audioId: audio.id,
        preset: processedVideo.moshingData?.preset
      });

    } catch (error) {
      logToFile('❌ Processing failed', {
        error: error instanceof Error ? error.message : String(error),
        videoId: video.id,
        audioId: audio.id,
        preset
      });
      
      // Discard failed video completely - no fallback created
      logToFile('🎭 Discarding failed video', { 
        reason: 'moshing failed, removing from queue',
        videoId: video.id
      });
      
      // Remove failed item from queue and update stats
      setProcessingQueue(prev => prev.slice(1));
      setStats(prev => ({ 
        ...prev, 
        processingCount: prev.processingCount - 1,
        failedProcessing: (prev.failedProcessing || 0) + 1
      }));
    }
  };

  // Auto-process items when raw queues have content
  useEffect(() => {
    const processInterval = setInterval(() => {
      // Only process if we have both raw video and audio, and processing queue isn't full
      if (rawVideoQueue.length > 0 && rawAudioQueue.length > 0 && processingQueue.length < 1) {
        const rawVideo = rawVideoQueue[0];
        const rawAudio = rawAudioQueue[0];
        const preset = pickRandomPreset();

        // Add to processing queue
        setProcessingQueue(prev => [...prev, { video: rawVideo, audio: rawAudio, preset }]);
        
        // Remove from raw queues
        setRawVideoQueue(prev => prev.slice(1));
        setRawAudioQueue(prev => prev.slice(1));
        
        // Update stats
        setStats(prev => ({
          ...prev,
          rawVideoCount: prev.rawVideoCount - 1,
          rawAudioCount: prev.rawAudioCount - 1,
          processingCount: prev.processingCount + 1
        }));

        console.log('🎭 Added to processing queue:', { video: rawVideo.id, audio: rawAudio.id });
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(processInterval);
  }, [rawVideoQueue, rawAudioQueue, processingQueue]);

  // Process the processing queue
  useEffect(() => {
    if (processingQueue.length > 0) {
      processNextInQueue();
    }
  }, [processingQueue]);

  // Fetch and add to raw queues (modified from original functions)
  const fetchAndProcessVideos = async () => {
    try {
      logToFile('📹 Fetching raw video from Pexels', { timestamp: performance.now() });
      
      if (!PEXELS_PROXY_BASE) {
        console.warn('Pexels proxy base not configured. Skipping video fetch.');
        return;
      }

      const randomKeyword = searchKeywords[Math.floor(Math.random() * searchKeywords.length)];
      const response = await fetch(
        `${PEXELS_PROXY_BASE}?url=search?query=${randomKeyword}&orientation=landscape&size=large&per_page=15&page=${Math.floor(Math.random() * 10) + 1}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        logToFile('❌ Pexels proxy error response', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Pexels API error: ${response.status} - ${errorText}`);
      }

      const pexelsData: PexelsResponse = await response.json();
      
      if (pexelsData.videos.length === 0) {
        logToFile('❌ No videos found in Pexels response', { 
          totalResults: pexelsData.total_results,
          page: pexelsData.page
        });
        throw new Error('No videos found');
      }

      const randomVideo = pexelsData.videos[Math.floor(Math.random() * pexelsData.videos.length)];
      const videoFile = randomVideo.video_files.find(file => 
        file.quality === 'hd' || file.quality === 'sd'
      ) || randomVideo.video_files[0];

      console.log('📹 Fetching raw video blob...');
      const videoResponse = await fetch(videoFile.link);
      if (!videoResponse.ok) {
        throw new Error(`Failed to fetch video: ${videoResponse.status}`);
      }
      
      const videoBlob = await videoResponse.blob();
      const blobUrl = URL.createObjectURL(videoBlob);
      
      const rawVideo: ProcessedVideo = {
        id: `raw-video-${Date.now()}-${randomVideo.id}`,
        originalId: randomVideo.id.toString(),
        originalUrl: videoFile.link,
        processedUrl: blobUrl,
        timestamp: new Date(),
        pexelsData: randomVideo
      };
      
      setRawVideoQueue(prev => [...prev, rawVideo]);
      setStats(prev => ({ ...prev, rawVideoCount: prev.rawVideoCount + 1 }));
      
      logToFile('📹 Video added to raw queue', {
        videoId: rawVideo.id,
        originalId: randomVideo.id,
        duration: randomVideo.duration,
        quality: videoFile.quality,
        queueLength: rawVideoQueue.length + 1
      });
      
    } catch (err) {
      console.error('Error fetching raw video:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    }
  };

  const fetchAndProcessAudio = async () => {
    try {
      logToFile('🎵 Fetching raw audio from Freesound', { timestamp: performance.now() });
      
      if (!FREESOUND_PROXY_BASE) {
        console.warn('Freesound proxy base not configured. Skipping audio fetch.');
        return;
      }

      const randomKeyword = audioKeywords[Math.floor(Math.random() * audioKeywords.length)];
      const response = await fetch(
        `${FREESOUND_PROXY_BASE}?url=search/text/?query=${randomKeyword}&filter=duration:[10 TO 60] channels:2 license:"Creative Commons 0" OR license:"Attribution" OR license:"Attribution Noncommercial"&sort=downloads_desc&page_size=15&fields=id,name,description,username,duration,filesize,samplerate,channels,bitrate,tags,license,previews`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Freesound proxy error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Freesound API error: ${response.status} - ${errorText}`);
      }

      const freesoundData: FreesoundResponse = await response.json();
      
      // Debug the response structure
      console.log('🎵 Freesound API response:', {
        count: freesoundData.count,
        resultsCount: freesoundData.results?.length || 0,
        firstResult: freesoundData.results?.[0] ? {
          id: freesoundData.results[0].id,
          name: freesoundData.results[0].name,
          hasPreviews: !!freesoundData.results[0].previews
        } : 'no results'
      });
      
      if (freesoundData.results.length === 0) {
        console.warn('No free Creative Commons audio found');
        return;
      }

      const randomSound = freesoundData.results[Math.floor(Math.random() * freesoundData.results.length)];
      
      // Debug the sound structure
      console.log('🎵 Freesound result structure:', {
        id: randomSound.id,
        name: randomSound.name,
        hasPreviews: !!randomSound.previews,
        previewKeys: randomSound.previews ? Object.keys(randomSound.previews) : 'no previews',
        previews: randomSound.previews
      });
      
      // Handle different preview URL structures
      let audioUrl = null;
      if (randomSound.previews) {
        audioUrl = randomSound.previews['preview-hq-mp3'] || 
                  randomSound.previews['preview-lq-mp3'] ||
                  randomSound.previews['preview-hq-ogg'] ||
                  randomSound.previews['preview-lq-ogg'];
      }
      
      if (!audioUrl) {
        console.warn('⚠️ No preview URL found for sound:', randomSound.id, randomSound.name);
        return;
      }

      console.log('📥 Downloading raw audio blob...');
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
      }
      
      const audioBlob = await audioResponse.blob();
      const blobUrl = URL.createObjectURL(audioBlob);
      
      const rawAudio: ProcessedAudio = {
        id: `raw-audio-${Date.now()}-${randomSound.id}`,
        originalId: randomSound.id.toString(),
        originalUrl: audioUrl,
        processedUrl: blobUrl,
        timestamp: new Date(),
        freesoundData: randomSound
      };
      
      setRawAudioQueue(prev => [...prev, rawAudio]);
      setStats(prev => ({ ...prev, rawAudioCount: prev.rawAudioCount + 1 }));
      
      logToFile('🎵 Audio added to raw queue', {
        audioId: rawAudio.id,
        originalId: randomSound.id,
        duration: randomSound.duration,
        samplerate: randomSound.samplerate,
        channels: randomSound.channels,
        queueLength: rawAudioQueue.length + 1
      });
      
    } catch (err) {
      console.error('Error fetching raw audio:', err);
    }
  };

  // Initialize intervals only after started
  useEffect(() => {
    if (!isStarted) return;

    const fetchInterval = setInterval(() => {
      const totalVideosInPipeline = videoQueue.length + processingQueue.length + rawVideoQueue.length;
      logToFile('🔄 Periodic fetch check', {
        totalVideosInPipeline,
        readyQueue: videoQueue.length,
        processingQueue: processingQueue.length,
        rawVideoQueue: rawVideoQueue.length,
        rawAudioQueue: rawAudioQueue.length
      });
      
      // Maintain a healthy pipeline of 4-6 videos total (reduced for efficiency)
      if (totalVideosInPipeline < 4) {
        logToFile('📹 Pipeline running low, fetching more raw videos', { totalVideosInPipeline });
        fetchAndProcessVideos();
      }
      
      if (rawAudioQueue.length + processingQueue.length < 6) {
        logToFile('🎵 Fetching more raw audio', { rawAudioQueue: rawAudioQueue.length });
        fetchAndProcessAudio();
      }
      
      if (totalVideosInPipeline >= 6) {
        logToFile('✅ Video pipeline is full, skipping video fetch', { totalVideosInPipeline });
      }
    }, 30000); // Check every 30 seconds (more frequent)

    const uptimeInterval = setInterval(() => {
      setStats(prev => ({ ...prev, uptime: prev.uptime + 1 }));
    }, 1000);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(uptimeInterval);
    };
  }, [isStarted, rawVideoQueue, rawAudioQueue, processingQueue, videoQueue]);

  // Pre-load content immediately when component mounts
  const preloadContent = async () => {
    console.log('🚀 Pre-loading content for ForeverMosh...');
    try {
      // Start fetching content in background
      await Promise.all([
        fetchAndProcessVideos(),
        fetchAndProcessAudio()
      ]);
      console.log('✅ Content pre-loaded successfully');
    } catch (err) {
      console.error('⚠️ Pre-loading failed:', err);
      setError('Failed to pre-load content');
    }
  };

  // Play next video in queue and pair with audio
  const playNextVideo = useCallback(() => {
    console.log('🎯 Playing next video, queue length:', videoQueue.length, 'audioQueue length:', audioQueue.length);
    if (videoQueue.length > 0) {
      const nextVideo = videoQueue[0];
      console.log('▶️ Starting video:', nextVideo.id, 'blob URL:', nextVideo.processedUrl);
      setCurrentVideo(nextVideo);
      setVideoQueue(prev => prev.slice(1));
      setStats(prev => ({ 
        ...prev, 
        queueLength: prev.queueLength - 1
      }));
      
      if (videoRef.current) {
        console.log('🔄 Setting video source:', nextVideo.processedUrl);
        videoRef.current.src = nextVideo.processedUrl;
        videoRef.current.load();
        
        // Set frame offset: first video starts at frame 0, subsequent videos start at frame 3
        const frameOffset = isFirstVideo ? 0 : 3;
        const timeOffset = frameOffset / 30; // Assuming 30fps, adjust if needed
        
        videoRef.current.addEventListener('loadedmetadata', () => {
          if (videoRef.current) {
            videoRef.current.currentTime = timeOffset;
            console.log(`🎬 Set video start time to ${timeOffset}s (frame ${frameOffset})`);
          }
        }, { once: true });
        
        videoRef.current.play().catch((err) => {
          console.error('❌ Video play failed:', err);
        });
        
        // Mark that this is no longer the first video
        setIsFirstVideo(false);
        
        // Handle audio based on whether it was chopped into the video
        if (nextVideo.moshingData?.audioIncluded) {
          console.log('🎵 Video has embedded chopped audio, no separate audio needed');
          setCurrentAudio(null);
          // Unmute the video since it has its own audio
          if (videoRef.current) {
            videoRef.current.muted = false;
          }
        } else {
          // Pair with separate audio track
          if (audioQueue.length > 0 && audioRef.current) {
            const pairedAudio = audioQueue[0];
            console.log('🎵 Pairing separate audio with video:', pairedAudio);
            
            setCurrentAudio(pairedAudio);
            setAudioQueue(prev => prev.slice(1));
            setStats(prev => ({ 
              ...prev, 
              audioQueueLength: prev.audioQueueLength - 1
            }));
            
            audioRef.current.src = pairedAudio.processedUrl;
            audioRef.current.load();
            audioRef.current.play().catch((err) => {
              console.error('❌ Audio play failed:', err);
            });
            
            // Keep video muted since separate audio is playing
            if (videoRef.current) {
              videoRef.current.muted = true;
            }
          } else {
            console.log('⚠️ No separate audio available to pair with video');
            setCurrentAudio(null);
            // Keep video muted if no audio
            if (videoRef.current) {
              videoRef.current.muted = true;
            }
          }
        }
      } else {
        console.error('❌ Video ref not available');
      }
    } else {
      console.log('⚠️ No videos in queue - setting currentVideo to null');
      // CRITICAL FIX: Set currentVideo to null when queue is empty
      // This allows the auto-play logic to trigger when new videos are added
      setCurrentVideo(null);
      setCurrentAudio(null);
    }
  }, [videoQueue, audioQueue]);

  // Handle audio cleanup
  const handleAudioCleanup = useCallback(() => {
    if (currentAudio && currentAudio.processedUrl.startsWith('blob:')) {
      console.log('🧹 Cleaning up audio blob URL:', currentAudio.processedUrl);
      URL.revokeObjectURL(currentAudio.processedUrl);
    }
  }, [currentAudio]);

  // Handle video ended event
  const handleVideoEnded = () => {
    console.log('🎬 Video ended, switching to next video-audio pair');
    
    // Clean up current video blob URL to prevent memory leaks
    if (currentVideo && currentVideo.processedUrl.startsWith('blob:')) {
      console.log('🧹 Cleaning up video blob URL:', currentVideo.processedUrl);
      URL.revokeObjectURL(currentVideo.processedUrl);
    }
    
    // Clean up current paired audio as well
    handleAudioCleanup();
    
    // Stop current audio since video ended
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    // Play next video-audio pair
    playNextVideo();
  };

  // Pre-load content on mount with aggressive fetching to get 4-5 videos ready
  useEffect(() => {
    const startAggressivePreloading = async () => {
      // Start multiple preload operations in parallel to build up the queue faster
      const preloadPromises = [];
      for (let i = 0; i < 6; i++) { // Start 6 parallel operations to get 4-5 videos faster
        preloadPromises.push(preloadContent());
      }
      await Promise.allSettled(preloadPromises); // Use allSettled to not fail if some requests fail
    };
    startAggressivePreloading();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up any remaining blob URLs
      videoQueue.forEach(video => {
        if (video.processedUrl.startsWith('blob:')) {
          URL.revokeObjectURL(video.processedUrl);
        }
      });
      audioQueue.forEach(audio => {
        if (audio.processedUrl.startsWith('blob:')) {
          URL.revokeObjectURL(audio.processedUrl);
        }
      });
      if (currentVideo && currentVideo.processedUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentVideo.processedUrl);
      }
      if (currentAudio && currentAudio.processedUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudio.processedUrl);
      }
    };
  }, []);

  // Auto-play when videos are added to queue with preloading logic
  useEffect(() => {
    console.log('📊 Queue updated, length:', videoQueue.length, 'Current video:', !!currentVideo, 'isLoading:', isLoading, 'isStarted:', isStarted, 'isPreloading:', isPreloading);
    
    // Check if we have enough videos to complete preloading (or force complete after 2 minutes)
    const hasEnoughVideos = videoQueue.length >= MIN_PRELOAD_VIDEOS;
    const shouldForceComplete = videoQueue.length > 0 && (Date.now() - stats.startTime) > 120000; // 2 minutes
    
    if (isPreloading && (hasEnoughVideos || shouldForceComplete)) {
      console.log('🎬 Preloading complete!', hasEnoughVideos ? 'Target reached' : 'Timeout - forcing start', 'with', videoQueue.length, 'videos');
      setIsPreloading(false);
    }
    
    // Auto-play logic: Start playback when we have videos and no current video is playing
    if (videoQueue.length > 0 && !currentVideo && !isLoading && isStarted && !isPreloading) {
      console.log('🚀 Starting playback automatically (fallback)');
      playNextVideo();
    } 
    // Additional trigger: If we have videos and we're in playback mode but no video is currently playing
    else if (videoQueue.length > 0 && isStarted && !isPreloading && !isLoading) {
      console.log('🔄 Queue replenished, restarting playback');
      playNextVideo();
    }
    else if (videoQueue.length > 0 && isStarted) {
      console.log('⚠️ Auto-play conditions not met:', {
        hasVideos: videoQueue.length > 0,
        noCurrentVideo: !currentVideo,
        notLoading: !isLoading,
        isStarted: isStarted,
        isPreloading: isPreloading
      });
    }
  }, [videoQueue, currentVideo, isLoading, isStarted, isPreloading, playNextVideo, stats.startTime]);

  // Format uptime
  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Test logging system on mount
  useEffect(() => {
    logToFile('🚀 ForeverMosh component mounted', { 
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent 
    });
  }, []);

  if (!isStarted) {
    const hasEnoughContent = videoQueue.length >= MIN_PRELOAD_VIDEOS;
    const isCurrentlyPreloading = isPreloading && !error;
    
    return (
      <main className="ForeverMosh">
        <div className="forever-start">
          <div className="start-content">
            <h1 className="bitcount-grid-double" style={{ fontSize: '6em' }}>evermosh</h1>
                          <p>Endless moshing powered by <a href="https://github.com/ninofiliu/supermosh" target="_blank" rel="noopener noreferrer" style={{ color: '#4ecdc4', textDecoration: 'underline' }}>Supermosh</a>, <a href="https://www.pexels.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#4ecdc4', textDecoration: 'underline' }}>Pexels</a>, and <a href="https://freesound.org/" target="_blank" rel="noopener noreferrer" style={{ color: '#4ecdc4', textDecoration: 'underline' }}>Freesound</a></p>    
            
            {/* Pre-loading status */}
            {isCurrentlyPreloading && (
              <div style={{ marginBottom: '1.5rem', color: '#4ecdc4' }}>
                <div className="loading-spinner" style={{ width: '24px', height: '24px', margin: '0 auto 0.5rem' }}></div>
                <div>Pre-loading {MIN_PRELOAD_VIDEOS} moshed videos... ({videoQueue.length}/{MIN_PRELOAD_VIDEOS})</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.8, marginTop: '0.5rem' }}>
                  Processing: {stats.processingCount} A/V Pairs | Raw Materials: {stats.rawVideoCount} Videos + {stats.rawAudioCount} Audio tracks
                </div>
              </div>
            )}
            
            {/* Ready status */}
            {hasEnoughContent && !isLoading && (
              <div style={{ marginBottom: '1.5rem', color: '#00ff88', fontWeight: 'bold' }}>
                ✅ Ready to mosh! ({videoQueue.length} videos processed, {audioQueue.length} audio tracks)
              </div>
            )}
            
            <button 
              className="start-button"
              onClick={async () => {
                if (hasEnoughContent) {
                  // User clicked to start - enable autoplay immediately
                  console.log('🎬 User clicked Start Forever Mosh');
                  clearFallbackVideos(); // Remove any existing fallback videos
                  setIsStarted(true);
                  setIsPreloading(false);
                  setIsFirstVideo(true); // Reset to first video for frame 0 start
                  
                  // Immediately try to play the first video in the user gesture context
                  setTimeout(() => {
                    if (videoQueue.length > 0 && !currentVideo) {
                      console.log('🎬 Starting playback immediately after user click');
                      playNextVideo();
                    }
                  }, 100);
                } else {
                  // User clicked to begin preloading - enable autoplay when ready
                  console.log('🎬 User clicked Begin Pre-loading');
                  setIsLoading(true);
                  setIsPreloading(true);
                  
                                      try {
                      await preloadContent();
                      // After preloading completes, automatically start
                      console.log('🎬 Pre-loading complete, auto-starting...');
                      clearFallbackVideos(); // Remove any existing fallback videos
                      setIsStarted(true);
                      setIsPreloading(false);
                      setIsFirstVideo(true); // Reset to first video for frame 0 start
                      
                      // Start playback immediately after preloading
                      setTimeout(() => {
                        if (videoQueue.length > 0 && !currentVideo) {
                          console.log('🎬 Starting playback after preloading');
                          playNextVideo();
                        }
                      }, 100);
                    } catch (error) {
                    console.error('🎬 Pre-loading failed:', error);
                    setError('Pre-loading failed. Please try again.');
                  } finally {
                    setIsLoading(false);
                  }
                }
              }}
              disabled={isLoading || isCurrentlyPreloading}
            >
              {isLoading ? (
                <>
                  <div className="loading-spinner"></div>
                  Starting...
                </>
              ) : isCurrentlyPreloading ? (
                <>
                  <div className="loading-spinner"></div>
                  Moshing videos... {videoQueue.length}/{MIN_PRELOAD_VIDEOS}
                </>
              ) : hasEnoughContent ? (
                'Start Forever Mosh'
              ) : (
                'Begin Pre-loading'
              )}
            </button>
            
            {/* Emergency override button if stuck */}
            {isCurrentlyPreloading && videoQueue.length > 0 && (
              <button 
                className="start-button"
                style={{ 
                  marginTop: '1rem', 
                  backgroundColor: '#ff6b35',
                  fontSize: '0.9rem'
                }}
                onClick={() => {
                  console.log('🚨 Emergency override: Starting with', videoQueue.length, 'videos');
                  clearFallbackVideos(); // Remove any existing fallback videos
                  setIsStarted(true);
                  setIsPreloading(false);
                  setIsFirstVideo(true); // Reset to first video for frame 0 start
                  
                  // Immediately start playback in user gesture context
                  setTimeout(() => {
                    if (videoQueue.length > 0 && !currentVideo) {
                      console.log('🎬 Emergency override: Starting playback immediately');
                      playNextVideo();
                    }
                  }, 100);
                }}
              >
                Start Now ({videoQueue.length} videos ready)
              </button>
            )}
            
            {!PEXELS_PROXY_BASE && (
              <div style={{ marginTop: '1rem', color: '#ffc107', fontSize: '0.9rem' }}>
                ⚠️ Pexels proxy not configured. Using fallback videos.
              </div>
            )}
            {!FREESOUND_PROXY_BASE && (
              <div style={{ marginTop: '0.5rem', color: '#ffc107', fontSize: '0.9rem' }}>
                ⚠️ Freesound proxy not configured. Audio will be disabled.
              </div>
            )}
            {error && (
              <div style={{ marginTop: '1rem', color: '#dc3545', fontSize: '0.9rem' }}>
                ❌ {error}
              </div>
            )}
            
            {/* Download logs button - always visible */}
            <div style={{ marginTop: '1rem' }}>
              <button 
                onClick={downloadLogFile}
                style={{ 
                  background: 'var(--accent-magenta)', 
                  color: 'white', 
                  border: 'none', 
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  borderRadius: '4px'
                }}
              >
                📊 Download Logs ({allLogs.length} entries)
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="ForeverMosh">
        <div className="forever-loading">
          <div className="loading-spinner"></div>
          <h2>🎬🎵 Starting Forever Mosh...</h2>
          <p>Fetching videos from Pexels and audio from Freesound</p>
          
          {/* Download logs button - always visible */}
          <div style={{ marginTop: '2rem' }}>
            <button 
              onClick={downloadLogFile}
              style={{ 
                background: 'var(--accent-magenta)', 
                color: 'white', 
                border: 'none', 
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                borderRadius: '4px'
              }}
            >
              📊 Download Logs ({allLogs.length} entries)
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="ForeverMosh">
      {/* Debug overlay with stats - toggleable with 't' key */}
      {showDebug && (
        <div className="forever-overlay">
          <div className="forever-mosh-stats">
            <div className="stats-row">
              <div className="stat-item">
                <span className="stat-label">📹 Processed Videos:</span>
                <span className="stat-value">{stats.videosProcessed}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">🎵 Audio Tracks:</span>
                <span className="stat-value">{stats.audiosProcessed}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">⏱️ Uptime:</span>
                <span className="stat-value">{Math.floor(stats.uptime / 60)}:{(stats.uptime % 60).toString().padStart(2, '0')}</span>
              </div>
            </div>
            
            <div className="stats-row">
              <div className="stat-item">
                <span className="stat-label">📦 Ready Queue:</span>
                <span className="stat-value">{stats.queueLength}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">🔄 Processing:</span>
                <span className="stat-value">{stats.processingCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">📥 Raw Materials:</span>
                <span className="stat-value">{stats.rawVideoCount}v + {stats.rawAudioCount}a</span>
              </div>
            </div>
            
            <div className="stats-row">
              <div className="stat-item">
                <button 
                  onClick={downloadLogFile}
                  style={{ 
                    background: 'var(--accent-magenta)', 
                    color: 'white', 
                    border: 'none', 
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    borderRadius: '4px'
                  }}
                                  >
                    📊 Download Logs ({allLogs.length} entries)
                  </button>
              </div>
            </div>

            {currentVideo && (
              <div className="current-content">
                <div>📹 Video: {currentVideo.pexelsData ? 
                  `by ${currentVideo.pexelsData.user.name} (${currentVideo.pexelsData.duration}s)` : 
                  currentVideo.id
                }</div>
                {currentVideo.moshingData && (
                  <div>🎭 Preset: {currentVideo.moshingData.preset} ({currentVideo.moshingData.processingTime.toFixed(0)}ms)</div>
                )}
                {currentAudio && currentAudio.freesoundData && (
                  <div>🎵 Audio: "{currentAudio.freesoundData.name}" by {currentAudio.freesoundData.username} ({currentAudio.freesoundData.duration.toFixed(1)}s) - {currentAudio.freesoundData.license}</div>
                )}
                {currentVideo && currentAudio && (
                  <div>🔁 Audio loops: ~{Math.ceil((currentVideo.pexelsData?.duration || 30) / (currentAudio.freesoundData?.duration || 30))} times</div>
                )}
              </div>
            )}
          </div>
          
          {error && (
            <div className="forever-error">
              ⚠️ API Error: {error}
            </div>
          )}
        </div>
      )}

      {/* Force Queue Button - Lower Left Corner */}
      {isStarted && (
        <button 
          className="force-queue-button"
          onClick={forceQueue}
          disabled={videoQueue.length === 0}
          title={`Force play next video (${videoQueue.length} ready)`}
        >
          🚀 Force Queue ({videoQueue.length})
        </button>
      )}

      {/* Clear Fallback Button - Lower Right Corner */}
      {isStarted && (
        <button 
          className="clear-fallback-button"
          onClick={clearFallbackVideos}
          title="Clear any fallback videos from queue"
        >
          🧹 Clear Fallbacks
        </button>
      )}

      {/* Full-screen video display */}
      <video
        ref={videoRef}
        className="forever-video"
        autoPlay
        muted
        crossOrigin="anonymous"
        onEnded={handleVideoEnded}
        onError={(e) => {
          console.error('Video playback error:', e);
          console.error('Current video source:', videoRef.current?.src);
          handleVideoEnded(); // Skip to next video on error
        }}
        onLoadStart={() => console.log('Video load started:', videoRef.current?.src)}
        onLoadedData={() => console.log('Video loaded successfully:', videoRef.current?.src)}
        onCanPlay={() => console.log('Video can start playing:', videoRef.current?.src)}
      />

      {/* Hidden audio element for background audio - controlled by video */}
      <audio
        ref={audioRef}
        autoPlay={false}
        loop={false}
        crossOrigin="anonymous"
        onEnded={() => {
          console.log('🎵 Audio ended');
          if (videoRef.current && !videoRef.current.ended && !videoRef.current.paused) {
            console.log('🔁 Video still playing, looping audio');
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch((err) => {
                console.error('❌ Audio loop failed:', err);
              });
            }
          } else {
            console.log('🎵 Video ended/paused, not looping audio');
            handleAudioCleanup();
          }
        }}
        onError={(e) => {
          console.error('Audio playback error:', e);
          console.error('Current audio source:', audioRef.current?.src);
          handleAudioCleanup(); // Clean up on error
        }}
        onLoadStart={() => {
          console.log('Audio load started:', audioRef.current?.src);
          if (audioRef.current) {
            audioRef.current.volume = 0.5; // Slightly lower volume so video and audio balance well
          }
        }}
        onLoadedData={() => console.log('Audio loaded successfully:', audioRef.current?.src)}
        onCanPlay={() => console.log('Audio can start playing:', audioRef.current?.src)}
        style={{ display: 'none' }}
      />

      {/* Background processing indicator */}
      {videoQueue.length < 2 && (
        <div className="forever-processing">
          <div className="processing-spinner"></div>
          <span>Processing videos...</span>
        </div>
      )}
    </main>
  );
}; 