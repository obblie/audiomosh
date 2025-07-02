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

// Moshing presets for ForeverMosh processing
const FOREVER_MOSH_PRESETS = [
  {
    name: "Breakbeat Chop",
    segments: [
      { from: 0, to: 1, repeat: 16 },      // Kick pattern
      { from: 2, to: 3, repeat: 8 },       // Snare
      { from: 1, to: 2, repeat: 32 },      // Hi-hat rapid
      { from: 4, to: 8, repeat: 2 },       // Fill
      { from: 0, to: 1, repeat: 24 },      // Kick variation
      { from: 3, to: 4, repeat: 12 },      // Crash
      { from: 1, to: 3, repeat: 16 },      // Complex pattern
      { from: 8, to: 12, repeat: 1 },      // Break
      { from: 0, to: 2, repeat: 20 },      // Return to beat
    ]
  },
  {
    name: "Glitch Cascade",
    segments: [
      { from: 0, to: 0.5, repeat: 64 },    // Ultra micro stutter
      { from: 2, to: 6, repeat: 4 },       // Medium chunk
      { from: 0.5, to: 1, repeat: 48 },    // Micro stutter 2
      { from: 8, to: 10, repeat: 8 },      // Rhythmic break
      { from: 1, to: 1.5, repeat: 32 },    // Building intensity
      { from: 12, to: 20, repeat: 1 },     // Long section
      { from: 0, to: 1, repeat: 40 },      // Return to chaos
      { from: 0.2, to: 0.8, repeat: 80 },  // Extreme fragmentation
    ]
  },
  {
    name: "Syncopated Rhythm",
    segments: [
      { from: 0, to: 3, repeat: 5 },       // Downbeat
      { from: 1, to: 2, repeat: 12 },      // Off-beat emphasis
      { from: 4, to: 5, repeat: 8 },       // Syncopation
      { from: 2, to: 4, repeat: 6 },       // Counter-rhythm
      { from: 6, to: 8, repeat: 3 },       // Resolution
      { from: 1, to: 3, repeat: 10 },      // Polyrhythm
      { from: 5, to: 7, repeat: 7 },       // Cross-rhythm
      { from: 8, to: 16, repeat: 1 },      // Breathing space
      { from: 0, to: 2, repeat: 15 },      // Final pattern
    ]
  },
  {
    name: "Tribal Percussion",
    segments: [
      { from: 0, to: 2, repeat: 12 },      // Base drum
      { from: 1, to: 1.5, repeat: 24 },    // High percussion
      { from: 3, to: 4, repeat: 8 },       // Low tom
      { from: 2, to: 3, repeat: 16 },      // Mid percussion
      { from: 4, to: 6, repeat: 4 },       // Accent pattern
      { from: 0.5, to: 1.5, repeat: 20 },  // Polyrhythmic layer
      { from: 6, to: 8, repeat: 6 },       // Building tension
      { from: 1, to: 4, repeat: 8 },       // Complex pattern
      { from: 8, to: 12, repeat: 2 },      // Release
    ]
  },
  {
    name: "Liquid DNB",
    segments: [
      { from: 0, to: 0.25, repeat: 120 },  // Amen break style
      { from: 1, to: 1.25, repeat: 96 },   // Snare rolls
      { from: 0.5, to: 0.75, repeat: 80 }, // Ghost notes
      { from: 2, to: 4, repeat: 8 },       // Bass line
      { from: 0.25, to: 0.5, repeat: 100 }, // Hi-hat work
      { from: 4, to: 8, repeat: 4 },       // Breakdown
      { from: 0, to: 1, repeat: 60 },      // Full pattern
      { from: 8, to: 16, repeat: 2 },      // Atmospheric section
    ]
  },
  {
    name: "IDM Fractal",
    segments: [
      { from: 0, to: 0.1, repeat: 200 },   // Microscopic detail
      { from: 0.3, to: 0.7, repeat: 150 }, // Algorithmic pattern
      { from: 1, to: 1.2, repeat: 100 },   // Nested rhythms
      { from: 0.1, to: 0.3, repeat: 180 }, // Granular texture
      { from: 2, to: 3, repeat: 40 },      // Structural element
      { from: 0.5, to: 1.5, repeat: 80 },  // Cross-fade pattern
      { from: 3, to: 6, repeat: 20 },      // Evolving sequence
      { from: 0, to: 2, repeat: 50 },      // Recursive pattern
    ]
  },
  {
    name: "Trap Rolls",
    segments: [
      { from: 0, to: 1, repeat: 8 },       // 808 kick
      { from: 2, to: 3, repeat: 16 },      // Snare
      { from: 1, to: 1.5, repeat: 32 },    // Hi-hat rolls
      { from: 0.5, to: 1, repeat: 24 },    // Kick variation
      { from: 3, to: 4, repeat: 12 },      // Clap
      { from: 1.5, to: 2, repeat: 28 },    // Complex hi-hats
      { from: 4, to: 8, repeat: 4 },       // 808 slide
      { from: 0, to: 0.5, repeat: 48 },    // Rapid fire kicks
      { from: 8, to: 12, repeat: 2 },      // Drop section
    ]
  },
  {
    name: "Aphex Stutter",
    segments: [
      { from: 0, to: 0.05, repeat: 400 },  // Extreme granulation
      { from: 0.2, to: 0.4, repeat: 200 }, // Pitch-shifted fragments
      { from: 1, to: 1.1, repeat: 180 },   // Micro-edits
      { from: 0.1, to: 0.2, repeat: 300 }, // Glitched transitions
      { from: 2, to: 2.5, repeat: 120 },   // Rhythmic anchor
      { from: 0.05, to: 0.15, repeat: 250 }, // Nested loops
      { from: 3, to: 5, repeat: 60 },      // Breathing room
      { from: 0, to: 1, repeat: 100 },     // Return to chaos
    ]
  },
  {
    name: "Jungle Madness",
    segments: [
      { from: 0, to: 0.5, repeat: 80 },    // Amen chops
      { from: 1, to: 1.5, repeat: 64 },    // Ragga vocals
      { from: 0.25, to: 0.75, repeat: 96 }, // Breakbeat science
      { from: 2, to: 3, repeat: 32 },      // Bass stabs
      { from: 0.5, to: 1, repeat: 72 },    // Snare rush
      { from: 3, to: 4, repeat: 24 },      // Reese bass
      { from: 0, to: 1, repeat: 56 },      // Full break
      { from: 4, to: 8, repeat: 8 },       // Steppers section
      { from: 1, to: 2, repeat: 48 },      // Final chop
    ]
  },
  {
    name: "Minimal Techno",
    segments: [
      { from: 0, to: 4, repeat: 8 },       // Four-on-floor
      { from: 1, to: 2, repeat: 16 },      // Off-beat elements
      { from: 2, to: 3, repeat: 12 },      // Percussion layer
      { from: 0, to: 1, repeat: 20 },      // Kick emphasis
      { from: 4, to: 6, repeat: 6 },       // Filter sweep
      { from: 3, to: 4, repeat: 10 },      // Rhythmic variation
      { from: 6, to: 8, repeat: 4 },       // Build-up
      { from: 0, to: 2, repeat: 14 },      // Pattern return
      { from: 8, to: 16, repeat: 2 },      // Extended groove
    ]
  }
];

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

  // Process multiple videos together into a 30-second moshed clip
  const processMoshPair = async (
    rawVideo: ProcessedVideo, 
    rawAudio: ProcessedAudio
  ): Promise<ProcessedVideo> => {
    const startTime = performance.now();
    console.log('🎭 Starting 30-second mosh processing for pair:', {
      primaryVideo: rawVideo.id,
      audio: rawAudio.id,
      availableVideos: rawVideoQueue.length,
      audioName: rawAudio.freesoundData?.name
    });

    try {
      // ENHANCED PRESET SELECTION - Combine multiple presets for dynamic patterns
      const createDynamicPreset = () => {
        const numPresets = Math.random() < 0.3 ? 1 : (Math.random() < 0.7 ? 2 : 3); // 30% single, 40% dual, 30% triple
        const selectedPresets = [];
        const usedIndices = new Set();
        
        // Select random unique presets
        for (let i = 0; i < numPresets; i++) {
          let index;
          do {
            index = Math.floor(Math.random() * FOREVER_MOSH_PRESETS.length);
          } while (usedIndices.has(index));
          usedIndices.add(index);
          selectedPresets.push(FOREVER_MOSH_PRESETS[index]);
        }
        
        if (selectedPresets.length === 1) {
          return selectedPresets[0];
        }
        
        // COMBINE MULTIPLE PRESETS INTO HYBRID PATTERN
        const combinedSegments = [];
        const totalDuration = 150; // Base timeline
        const sectionDuration = totalDuration / selectedPresets.length;
        
        selectedPresets.forEach((preset, presetIndex) => {
          const sectionStart = presetIndex * sectionDuration;
          const sectionEnd = (presetIndex + 1) * sectionDuration;
          
          // Add segments from this preset, offset to its section
          preset.segments.forEach(segment => {
            const offsetSegment = {
              from: sectionStart + (segment.from * (sectionDuration / 100)), // Scale to section
              to: sectionStart + (segment.to * (sectionDuration / 100)),
              repeat: segment.repeat + Math.floor(Math.random() * 3) // Add variation to repeats
            };
            
            // Ensure segment stays within bounds
            if (offsetSegment.from < sectionEnd && offsetSegment.to <= sectionEnd) {
              combinedSegments.push(offsetSegment);
            }
          });
          
          // Add transition effects between presets
          if (presetIndex < selectedPresets.length - 1) {
            const transitionStart = sectionEnd - 5;
            const transitionEnd = sectionEnd + 5;
            
            // Create transition stutter
            combinedSegments.push({
              from: transitionStart,
              to: transitionEnd,
              repeat: 8 + Math.floor(Math.random() * 16) // 8-24 repeats for transition
            });
          }
        });
        
        // Add some cross-preset mixing segments
        if (selectedPresets.length > 1) {
          const mixSegments = Math.floor(Math.random() * 4) + 2; // 2-5 mix segments
          for (let i = 0; i < mixSegments; i++) {
            const mixStart = Math.random() * (totalDuration - 10);
            const mixDuration = 2 + Math.random() * 6; // 2-8 frame segments
            combinedSegments.push({
              from: mixStart,
              to: mixStart + mixDuration,
              repeat: 4 + Math.floor(Math.random() * 20) // 4-24 repeats
            });
          }
        }
        
        // Sort segments by start time for coherent playback
        combinedSegments.sort((a, b) => a.from - b.from);
        
        const presetNames = selectedPresets.map(p => p.name).join(' + ');
        return {
          name: `${presetNames} (Hybrid)`,
          segments: combinedSegments
        };
      };
      
      const preset = createDynamicPreset();
      console.log('🎭 Created dynamic preset:', preset.name, 'with', preset.segments.length, 'segments');

      // Collect videos for mixing (primary + up to 1 other for stability)
      const availableVideos = [rawVideo, ...rawVideoQueue.slice(0, 1)];
      const videoSources: { video: ProcessedVideo; chunks: any[]; config: VideoDecoderConfig; width: number; height: number }[] = [];

      console.log('🎭 Processing', availableVideos.length, 'videos for 30-second mixing');

      // Get FFmpeg instance (we need to create one for ForeverMosh)
      const ffmpeg = new (await import('@ffmpeg/ffmpeg')).FFmpeg();
      const { toBlobURL } = await import('@ffmpeg/util');
      
      // Load FFmpeg if not already loaded
      if (!ffmpeg.loaded) {
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
      }

      // Process each video to get chunks for mixing
      for (const video of availableVideos) {
        try {
          // Analyze video
          const videoElement = document.createElement('video');
          videoElement.crossOrigin = 'anonymous';
          videoElement.src = video.processedUrl;
          
          await new Promise((resolve, reject) => {
            videoElement.onloadedmetadata = resolve;
            videoElement.onerror = reject;
            videoElement.load();
          });

          const videoWidth = videoElement.videoWidth || 640;
          const videoHeight = videoElement.videoHeight || 480;

          // Convert to file for processing
          const videoResponse = await fetch(video.processedUrl);
          const videoBlob = await videoResponse.blob();
          const videoFile = new File([videoBlob], `${video.id}.mp4`, { type: 'video/mp4' });

          let videoConfig: VideoDecoderConfig | null = null;

          // Extract chunks
          const chunks = await computeChunks(
            ffmpeg,
            videoFile,
            video.id,
            videoWidth,
            videoHeight,
            (config: VideoDecoderConfig) => {
              videoConfig = config;
            }
          );

          if (videoConfig && chunks.length > 0) {
            videoSources.push({ video, chunks, config: videoConfig, width: videoWidth, height: videoHeight });
            console.log('🎭 Processed video source:', video.id, '- chunks:', chunks.length);
          }

        } catch (error) {
          console.warn('⚠️ Failed to process video source:', video.id, error);
        }
      }

      if (videoSources.length === 0) {
        throw new Error('No video sources could be processed for mixing');
      }
      
      // If we have multiple sources but they have very different dimensions, use only the primary video
      if (videoSources.length > 1) {
        const primaryDimensions = `${videoSources[0].width}x${videoSources[0].height}`;
        const hasConflictingDimensions = videoSources.some(source => 
          `${source.width}x${source.height}` !== primaryDimensions
        );
        
        if (hasConflictingDimensions) {
          console.log('🎭 Dimension conflicts detected, using only primary video for stability');
          videoSources.splice(1); // Keep only the first (primary) video
        }
      }

      // Target 30 seconds at 30 FPS = 900 frames max
      const TARGET_DURATION_FRAMES = 900;
      
      // ENHANCED RHYTHMIC SEGMENT ADAPTATION
      const createRhythmicSegments = (baseSegments: any[]) => {
        const adaptedSegments = [];
        
        // Apply tempo variations - create different rhythmic feels
        const tempoModes = ['steady', 'accelerating', 'decelerating', 'syncopated', 'polyrhythmic'];
        const selectedTempo = tempoModes[Math.floor(Math.random() * tempoModes.length)];
        console.log('🎵 Applying rhythmic mode:', selectedTempo);
        
        baseSegments.forEach((segment, index) => {
          // Base scaling
          const scaleFactor = TARGET_DURATION_FRAMES / 150;
          let baseFrom = segment.from * scaleFactor;
          let baseTo = segment.to * scaleFactor;
          let baseRepeat = segment.repeat;
          
          // Apply tempo-based modifications
          switch (selectedTempo) {
            case 'accelerating':
              // Segments get shorter and faster over time
              const accelFactor = 1 - (index / baseSegments.length) * 0.7; // 30% to 100% speed
              baseFrom *= accelFactor;
              baseTo *= accelFactor;
              baseRepeat = Math.max(1, Math.floor(baseRepeat * (1 + index * 0.3)));
              break;
              
            case 'decelerating':
              // Segments get longer and slower over time
              const decelFactor = 1 + (index / baseSegments.length) * 0.8; // 100% to 180% length
              baseFrom *= decelFactor;
              baseTo *= decelFactor;
              baseRepeat = Math.max(1, Math.floor(baseRepeat * (1 - index * 0.2)));
              break;
              
            case 'syncopated':
              // Add rhythmic offsets and emphasis
              const offset = (index % 3) * 2; // Stagger segments
              baseFrom += offset;
              baseTo += offset;
              baseRepeat += (index % 2) * 4; // Emphasize every other segment
              break;
              
            case 'polyrhythmic':
              // Create overlapping patterns
              const polyFactor = [1, 1.5, 0.75, 2, 0.5][index % 5];
              baseFrom *= polyFactor;
              baseTo *= polyFactor;
              baseRepeat = Math.max(1, Math.floor(baseRepeat * polyFactor));
              break;
              
            default: // steady
              // Keep original timing but add micro-variations
              const microVariation = 1 + (Math.random() - 0.5) * 0.1; // ±5% variation
              baseFrom *= microVariation;
              baseTo *= microVariation;
              break;
          }
          
          // Ensure segments are valid and within bounds
          baseFrom = Math.max(0, Math.floor(baseFrom));
          baseTo = Math.min(TARGET_DURATION_FRAMES - 1, Math.floor(baseTo));
          
          if (baseFrom < baseTo) {
            adaptedSegments.push({
              name: `${selectedTempo}_segment_${index}`,
              from: baseFrom,
              to: baseTo,
              repeat: Math.max(1, baseRepeat),
              rhythmicMode: selectedTempo,
              // Enhanced audio configuration with rhythmic awareness
              audio: Math.random() > 0.6 ? { // 40% chance of audio effects per segment
                type: ['sine', 'noise', 'sample'][Math.floor(Math.random() * 3)] as 'sine' | 'noise' | 'sample',
                frequency: selectedTempo === 'accelerating' ? 400 + index * 50 : 
                          selectedTempo === 'decelerating' ? 600 - index * 30 :
                          200 + Math.random() * 600,
                volume: selectedTempo === 'syncopated' && index % 2 ? 0.8 : 0.3 + Math.random() * 0.4,
                noiseType: ['white', 'pink', 'brown'][Math.floor(Math.random() * 3)] as 'white' | 'pink' | 'brown',
                sampleUrl: rawAudio.processedUrl
              } : undefined
            });
          }
        });
        
        // Add rhythmic fill segments for more complex patterns
        if (Math.random() < 0.6) { // 60% chance of adding fills
          const fillCount = Math.floor(Math.random() * 4) + 2; // 2-5 fills
          console.log('🥁 Adding', fillCount, 'rhythmic fill segments');
          
          for (let i = 0; i < fillCount; i++) {
            const fillStart = Math.random() * (TARGET_DURATION_FRAMES - 30);
            const fillDuration = 5 + Math.random() * 15; // 5-20 frame fills
            const fillRepeats = 2 + Math.floor(Math.random() * 8); // 2-10 repeats
            
            adaptedSegments.push({
              name: `rhythmic_fill_${i}`,
              from: Math.floor(fillStart),
              to: Math.floor(fillStart + fillDuration),
              repeat: fillRepeats,
              rhythmicMode: 'fill',
              audio: Math.random() > 0.5 ? {
                type: 'noise' as const,
                frequency: 800 + Math.random() * 400,
                volume: 0.2 + Math.random() * 0.3,
                noiseType: 'white' as const,
                sampleUrl: rawAudio.processedUrl
              } : undefined
            });
          }
        }
        
        // Sort by start time and remove overlaps
        adaptedSegments.sort((a, b) => a.from - b.from);
        
        return adaptedSegments;
      };
      
      const adaptedSegments = createRhythmicSegments(preset.segments);

      console.log('🎭 Created supermosh segments:', adaptedSegments.length, 'segments with', videoSources.length, 'video sources for moshing');

      // ACTUAL SUPERMOSH PROCESSING INTEGRATION
      try {
        console.log('🎭 Starting 30-second mixed supermosh processing...');

        // Apply SUPERMOSH ALGORITHM with multi-video mixing
        console.log('🎭 Applying supermosh algorithm with', videoSources.length, 'video sources');

        // Normalize all video sources to the same dimensions (use most common size)
        const dimensionCounts = new Map();
        videoSources.forEach(source => {
          const key = `${source.width}x${source.height}`;
          dimensionCounts.set(key, (dimensionCounts.get(key) || 0) + 1);
        });
        
        const [commonDimensions] = [...dimensionCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        const [targetWidth, targetHeight] = commonDimensions.split('x').map(Number);
        
        console.log('🎭 Target dimensions for moshing:', targetWidth, 'x', targetHeight);

        // Apply the ACTUAL SUPERMOSH ALGORITHM: segments define chunk reordering/repeating
        const moshedChunks: any[] = [];
        
        console.log('🎭 Applying', adaptedSegments.length, 'supermosh segments');
        
        // This is the CORE SUPERMOSH ALGORITHM - segments define how chunks are reordered and repeated
        for (const segment of adaptedSegments) {
          // Select which video source to use for this segment (rotate through available videos)
          const sourceIndex = Math.floor(Math.random() * videoSources.length);
          const selectedSource = videoSources[sourceIndex];
          
          console.log(`🎭 Segment: from=${segment.from} to=${segment.to} repeat=${segment.repeat} source=${selectedSource.video.id.slice(-6)}`);
          
          // Calculate actual frame range for this segment (map to available frames)
          const maxFrames = selectedSource.chunks.length;
          const segmentStart = Math.floor((segment.from / 900) * maxFrames);
          const segmentEnd = Math.min(Math.floor((segment.to / 900) * maxFrames), maxFrames - 1);
          
          // Extract the chunk sequence for this segment
          const segmentChunks = selectedSource.chunks.slice(segmentStart, segmentEnd);
          
          // REPEAT THE CHUNKS - this creates the stuttering/moshing effect
          for (let repeat = 0; repeat < segment.repeat; repeat++) {
            moshedChunks.push(...segmentChunks);
          }
          
          console.log(`🎭 Added ${segmentChunks.length} chunks × ${segment.repeat} repeats = ${segmentChunks.length * segment.repeat} total chunks`);
        }
        
        console.log('🎭 Supermosh algorithm complete:', moshedChunks.length, 'total moshed chunks created');

        // Trim to exactly 30 seconds (900 frames) if longer
        const finalChunks = moshedChunks.slice(0, TARGET_DURATION_FRAMES);

        console.log('🎭 Final moshed chunks:', finalChunks.length, 'frames (~' + (finalChunks.length / 30).toFixed(1) + 's)');

        if (finalChunks.length === 0) {
          throw new Error('No chunks created from video processing');
        }

        // Use the target dimensions for rendering
        const renderSettings = {
          width: targetWidth,
          height: targetHeight,
        };

                // Decide if we should chop the audio to match video moshing (80% chance)
        const shouldChopAudio = Math.random() < 0.8;
        console.log('🎭 Audio chopping decision:', shouldChopAudio ? 'YES - audio will follow video stuttering/moshing' : 'NO - audio plays normally');

        // Record the moshed video using primary video's config
        const mimeType = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
        
        let moshedVideoUrl: string;
        
        let actuallyChoppedAudio = false;
        
        try {
          if (shouldChopAudio) {
            // Try recordWithAudio first, but fall back to video-only if it fails
            console.log('🎵 Attempting synchronized audio chopping...');
            
            try {
              // Create segments that match our moshing pattern for audio sync
              const audioSyncSegments = adaptedSegments.map(segment => ({
                ...segment,
                audio: {
                  type: 'sample' as const,
                  sampleUrl: rawAudio.processedUrl,
                  volume: 0.6 + Math.random() * 0.4, // 0.6-1.0 volume
                }
              }));

              moshedVideoUrl = await recordWithAudio(
                finalChunks,
                videoSources[0].config,
                mimeType,
                renderSettings,
                audioSyncSegments,
                0.8, // Audio volume
                ffmpeg,
                (progress: number) => {
                  console.log('🎭 Moshing with audio progress:', Math.round(progress * 100) + '%');
                }
              );
              
              console.log('🎵 Audio chopping successful!');
              actuallyChoppedAudio = true;
            } catch (audioError) {
              console.warn('⚠️ Audio chopping failed, falling back to video-only:', audioError);
              
              // Fall back to video-only recording
              moshedVideoUrl = await record(
                finalChunks,
                videoSources[0].config,
                mimeType,
                renderSettings,
                (progress: number) => {
                  console.log('🎭 Moshing progress (fallback):', Math.round(progress * 100) + '%');
                }
              );
            }
          } else {
            // Record video only, audio will play separately
            moshedVideoUrl = await record(
              finalChunks,
              videoSources[0].config,
              mimeType,
              renderSettings,
              (progress: number) => {
                console.log('🎭 Moshing progress:', Math.round(progress * 100) + '%');
              }
            );
          }
        } catch (recordingError) {
          console.error('🎭 All video recording methods failed, using simplified approach:', recordingError);
          
          // Final fallback: use single video source without mixing
          console.log('🎭 Fallback: Using single video source without multi-video mixing');
          const singleVideoChunks = videoSources[0].chunks.slice(0, Math.min(900, videoSources[0].chunks.length));
          
          moshedVideoUrl = await record(
            singleVideoChunks,
            videoSources[0].config,
            mimeType,
            renderSettings,
            (progress: number) => {
              console.log('🎭 Moshing progress (single video fallback):', Math.round(progress * 100) + '%');
            }
          );
        }

        console.log('🎭 Moshed video created:', moshedVideoUrl);

        const processingTime = performance.now() - startTime;
        
        // Return the moshed video
        const moshedVideo: ProcessedVideo = {
          ...rawVideo,
          id: `moshed-30s-${Date.now()}-${rawVideo.originalId}`,
          processedUrl: moshedVideoUrl,
          moshingData: {
            preset: preset.name + (actuallyChoppedAudio ? ' + Audio Chop' : '') + ` (${videoSources.length} sources mixed)`,
            segments: adaptedSegments,
            processingTime,
            audioIncluded: actuallyChoppedAudio
          }
        };

        console.log('🎭 30-second mosh processing complete:', {
          preset: preset.name,
          processingTime: processingTime.toFixed(2) + 'ms',
          segmentsWithAudio: adaptedSegments.filter(s => s.audio).length,
          totalSegments: adaptedSegments.length,
          videoSourcesUsed: videoSources.length,
          finalChunks: finalChunks.length,
          finalDuration: (finalChunks.length / 30).toFixed(1) + 's'
        });

        return moshedVideo;

      } catch (moshError) {
        console.error('🎭 Supermosh processing failed, skipping video:', moshError);
        
        // Don't create fallback - throw error to skip this video
        throw new Error('Moshing failed - skipping video');
      }

    } catch (error) {
      console.error('🎭 Mosh processing failed:', error);
      // Don't create fallback - throw error to skip this video
      throw new Error('Moshing failed - skipping video');
    }
  };

  // Process the next item in the processing queue
  const processNextInQueue = async () => {
    if (processingQueue.length === 0) return;

    const { video, audio, preset } = processingQueue[0];
    console.log('🎭 Processing queue item:', { video: video.id, audio: audio.id });

    try {
      // Add timeout to prevent hanging
      const processedVideo = await Promise.race([
        processMoshPair(video, audio),
        new Promise<ProcessedVideo>((_, reject) => 
          setTimeout(() => reject(new Error('Processing timeout after 5 minutes')), 5 * 60 * 1000)
        )
      ]);
      
      // Check if this is a fallback video and skip it
      if (processedVideo.moshingData?.preset?.includes('fallback') || 
          processedVideo.id?.includes('fallback')) {
        console.log('🎭 Skipping fallback video:', processedVideo.id);
        // Remove from processing queue without adding to video queue
        setProcessingQueue(prev => prev.slice(1));
        setStats(prev => ({
          ...prev,
          processingCount: prev.processingCount - 1
        }));
        return;
      }
      
      // Add to final video queue
      setVideoQueue(prev => [...prev, processedVideo]);
      
      // Only add audio to queue if it wasn't chopped into the video
      if (!processedVideo.moshingData?.audioIncluded) {
        setAudioQueue(prev => [...prev, audio]);
      } else {
        console.log('🎵 Audio was chopped into video, not adding to separate audio queue');
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

      console.log('📊 Stats updated after processing:', {
        videosProcessed: stats.videosProcessed + 1,
        queueLength: videoQueue.length + 1,
        audioIncluded: processedVideo.moshingData?.audioIncluded
      });

      console.log('✅ Processed and queued video:', processedVideo.id, 'with audio:', audio.id);

    } catch (error) {
      console.error('❌ Processing failed:', error);
      
      // Don't create fallback video - just remove from processing queue
      console.log('🎭 Skipping failed video - no fallback created');
      
      // Remove failed item from queue
      setProcessingQueue(prev => prev.slice(1));
      setStats(prev => ({ 
        ...prev, 
        processingCount: prev.processingCount - 1
      }));
    }
  };

  // Auto-process items when raw queues have content
  useEffect(() => {
    const processInterval = setInterval(() => {
      // Only process if we have both raw video and audio, and processing queue isn't full
      if (rawVideoQueue.length > 0 && rawAudioQueue.length > 0 && processingQueue.length < 3) {
        const rawVideo = rawVideoQueue[0];
        const rawAudio = rawAudioQueue[0];
        const preset = FOREVER_MOSH_PRESETS[Math.floor(Math.random() * FOREVER_MOSH_PRESETS.length)];

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
      console.log('📹 Fetching raw video from Pexels...');
      
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
        console.error('❌ Pexels proxy error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Pexels API error: ${response.status} - ${errorText}`);
      }

      const pexelsData: PexelsResponse = await response.json();
      
      if (pexelsData.videos.length === 0) {
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
      
    } catch (err) {
      console.error('Error fetching raw video:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    }
  };

  const fetchAndProcessAudio = async () => {
    try {
      console.log('🎵 Fetching raw audio from Freesound...');
      
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
      
    } catch (err) {
      console.error('Error fetching raw audio:', err);
    }
  };

  // Initialize intervals only after started
  useEffect(() => {
    if (!isStarted) return;

    const fetchInterval = setInterval(() => {
      const totalVideosInPipeline = videoQueue.length + processingQueue.length + rawVideoQueue.length;
      console.log('🔄 Periodic fetch check - Total videos in pipeline:', totalVideosInPipeline, 'Ready:', videoQueue.length, 'Processing:', processingQueue.length, 'Raw:', rawVideoQueue.length);
      
      // Maintain a healthy pipeline of 8-10 videos total
      if (totalVideosInPipeline < 8) {
        console.log('📹 Pipeline running low, fetching more raw videos');
        fetchAndProcessVideos();
      }
      
      if (rawAudioQueue.length + processingQueue.length < 6) {
        console.log('🎵 Fetching more raw audio');
        fetchAndProcessAudio();
      }
      
      if (totalVideosInPipeline >= 10) {
        console.log('✅ Video pipeline is full, skipping video fetch');
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

  if (!isStarted) {
    const hasEnoughContent = videoQueue.length >= MIN_PRELOAD_VIDEOS;
    const isCurrentlyPreloading = isPreloading && !error;
    
    return (
      <main className="ForeverMosh">
        <div className="forever-start">
          <div className="start-content">
            <h1>🎬🎵 Forever Mosh</h1>
                          <p>Endless moshing powered by <a href="https://github.com/ninofiliu/supermosh" target="_blank" rel="noopener noreferrer" style={{ color: '#4ecdc4', textDecoration: 'underline' }}>Supermosh</a></p>
            
            {/* Pre-loading status */}
            {isCurrentlyPreloading && (
              <div style={{ marginBottom: '1.5rem', color: '#4ecdc4' }}>
                <div className="loading-spinner" style={{ width: '24px', height: '24px', margin: '0 auto 0.5rem' }}></div>
                <div>Pre-loading {MIN_PRELOAD_VIDEOS} moshed videos... ({videoQueue.length}/{MIN_PRELOAD_VIDEOS})</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.8, marginTop: '0.5rem' }}>
                  Processing: {stats.processingCount} | Raw Materials: {stats.rawVideoCount} Videos + {stats.rawAudioCount} Audio tracks
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

            {currentVideo && (
              <div className="current-content">
                <div>📹 Video: {currentVideo.pexelsData ? 
                  `by ${currentVideo.pexelsData.user.name} (${currentVideo.pexelsData.duration}s)` : 
                  currentVideo.id
                }</div>
                {currentVideo.moshingData && (
                  <div>🎭 Preset: {currentVideo.moshingData.preset} ({currentVideo.moshingData.segments.length} segments, {currentVideo.moshingData.processingTime.toFixed(0)}ms)</div>
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