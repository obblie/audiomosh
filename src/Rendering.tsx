import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";

import { AudioEngine } from "./AudioEngine";
import { Section } from "./components/Section";
import { record, recordWithAudio } from "./lib";
import { NumberInput } from "./NumberInput";
import { AudioSettings, Segment, Settings, Vid } from "./types";
import { FFmpeg } from "@ffmpeg/ffmpeg";

export const Rendering = ({
  segments,
  vids,
  config,
  settings,
  setSettings,
  preprocessSettings,
  onRenderedVideo,
  ffmpeg,
  onSamplesChange,
}: {
  segments: Segment[];
  vids: Vid[];
  config: VideoDecoderConfig | null;
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  preprocessSettings: Settings;
  onRenderedVideo?: (src: string) => void;
  ffmpeg?: FFmpeg;
  onSamplesChange?: (samples: { name: string; url: string; file?: File }[]) => void;
}) => {
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [src, setSrc] = useState("");
  const [downloadName, setDownloadName] = useState("");
  
  // Audio engine state
  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    volume: 0.5,
    enabled: false,
  });
  
  // Video playback tracking for audio sync
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackTimerRef = useRef<number | null>(null);
  
  // Calculate segment timing for audio sync
  const calculateSegmentTiming = () => {
    const segmentTimings: { startTime: number; duration: number; segmentIndex: number }[] = [];
    let currentTime = 0;
    
    segments.forEach((segment, segmentIndex) => {
      const vid = vids.find(v => v.name === segment.name);
      if (!vid) return;
      
      const segmentFrames = segment.to - segment.from;
      const segmentDuration = segmentFrames / 30; // Assuming 30 FPS
      
      // Add each repeat of the segment
      for (let repeat = 0; repeat < segment.repeat; repeat++) {
        segmentTimings.push({
          startTime: currentTime,
          duration: segmentDuration,
          segmentIndex,
        });
        currentTime += segmentDuration;
      }
    });
    
    return segmentTimings;
  };
  
  // Track video playback and sync audio
  const syncAudioWithVideo = () => {
    if (!videoRef.current || !isVideoPlaying) return;
    
    const currentTime = videoRef.current.currentTime;
    const segmentTimings = calculateSegmentTiming();
    
    // Find current segment based on video time
    const currentSegment = segmentTimings.find(
      timing => currentTime >= timing.startTime && currentTime < timing.startTime + timing.duration
    );
    
    if (currentSegment && currentSegment.segmentIndex !== currentSegmentIndex) {
      setCurrentSegmentIndex(currentSegment.segmentIndex);
    } else if (!currentSegment && currentSegmentIndex !== -1) {
      setCurrentSegmentIndex(-1);
    }
  };
  
  // Video event handlers
  const handleVideoPlay = () => {
    setIsVideoPlaying(true);
  };
  
  const handleVideoPause = () => {
    setIsVideoPlaying(false);
    setCurrentSegmentIndex(-1);
  };
  
  const handleVideoEnded = () => {
    setIsVideoPlaying(false);
    setCurrentSegmentIndex(-1);
  };
  
  // Sync audio with video playback
  useEffect(() => {
    if (isVideoPlaying) {
      const interval = setInterval(syncAudioWithVideo, 100); // Check every 100ms
      return () => clearInterval(interval);
    }
  }, [isVideoPlaying, segments]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
      }
    };
  }, []);

  return (
    <Section name="Rendering">
      <p>
        <NumberInput
          value={settings.width}
          onChange={(width) => setSettings({ ...settings, width })}
          min={4}
          step={4}
        />
        <span>&times;</span>
        <NumberInput
          value={settings.height}
          onChange={(height) => setSettings({ ...settings, height })}
          min={4}
          step={4}
        />
        <span>px</span>
        {[
          { name: "480p", width: 640, height: 480 },
          { name: "720p", width: 1280, height: 720 },
          { name: "1080p", width: 1920, height: 1080 },
        ].map(({ name, width, height }) => (
          <button
            key={name}
            onClick={() => setSettings({ width, height })}
            disabled={settings.width === width && settings.height === height}
          >
            {name}
          </button>
        ))}
        <button
          onClick={() =>
            setSettings({ width: settings.height, height: settings.width })
          }
        >
          flip
        </button>
      </p>

      {segments.length === 0 || config === null ? (
        <p>Please add segments in the timeline</p>
      ) : JSON.stringify(preprocessSettings) !== JSON.stringify(settings) ? (
        <p>
          Rendering settings differ from files settings, please reprocess the
          files
        </p>
      ) : (
        <div>
          <div className="render-controls">
            <button
              onClick={async () => {
                setRendering(true);
                setSrc("");
                
                // Clear previous rendered video from real-time mode
                if (onRenderedVideo) {
                  onRenderedVideo("");
                }

                const chunks = segments.flatMap((s) =>
                  Array(s.repeat)
                    .fill(null)
                    .flatMap(() =>
                      vids
                        .find((vid) => vid.name === s.name)!
                        .chunks.slice(s.from, s.to)
                    )
                );
                
                console.log('🎬 Rendering with segments:', segments);
                console.log('🎬 Total chunks to render:', chunks.length);
                console.log('🎬 First few segments:', segments.slice(0, 3));
                
                // Check if any segments have audio
                const hasAudio = segments.some(s => s.audio);
                const shouldIncludeAudio = hasAudio && ffmpeg; // Auto-include audio if segments have it and FFmpeg is available
                
                console.log('🎵 Audio Export Debug:', { 
                  totalSegments: segments.length,
                  segmentsWithAudio: segments.filter(s => s.audio).length,
                  hasAudio, 
                  shouldIncludeAudio, 
                  ffmpegAvailable: !!ffmpeg,
                  ffmpegLoaded: ffmpeg?.loaded,
                  audioSegmentDetails: segments.map(s => ({
                    name: s.name,
                    hasAudio: !!s.audio,
                    audioType: s.audio?.type,
                    audioConfig: s.audio
                  }))
                });
                
                // Detailed segment analysis
                segments.forEach((seg, i) => {
                  const vid = vids.find(v => v.name === seg.name);
                  const segmentChunks = (seg.to - seg.from) * seg.repeat;
                  console.log(`🎬 Segment ${i}:`, {
                    name: seg.name,
                    from: seg.from,
                    to: seg.to,
                    repeat: seg.repeat,
                    length: seg.to - seg.from,
                    totalChunks: segmentChunks,
                    videoTotalChunks: vid?.chunks.length,
                    hasAudio: !!seg.audio,
                    audioType: seg.audio?.type
                  });
                });
                
                const mimeType = MediaRecorder.isTypeSupported("video/mp4")
                  ? "video/mp4"
                  : "video/webm";
                
                let newSrc: string;
                
                if (shouldIncludeAudio) {
                  console.log('🎵 Rendering with audio...');
                  newSrc = await recordWithAudio(
                    chunks,
                    config,
                    mimeType,
                    settings,
                    segments,
                    audioSettings.volume,
                    ffmpeg!,
                    setProgress
                  );
                } else {
                  console.log('🎬 Rendering video only...');
                  newSrc = await record(
                    chunks,
                    config,
                    mimeType,
                    settings,
                    setProgress
                  );
                }
                
                setSrc(newSrc);
                setDownloadName(
                  `Supermosh_${new Date()
                    .toISOString()
                    .substring(0, 19)
                    .replaceAll(":", "-")}.${
                    shouldIncludeAudio ? "mp4" : (mimeType === "video/mp4" ? "mp4" : "webm")
                  }`
                );
                setRendering(false);
                
                // Notify parent component about the new rendered video
                if (onRenderedVideo) {
                  onRenderedVideo(newSrc);
                }
              }}
              disabled={rendering}
            >
              {rendering ? "Rendering..." : "🎬 Render Video"}
            </button>
            
            {segments.some(s => s.audio) && (
              <div className="audio-render-info">
                <span className="audio-indicator">
                  🎵 Audio configured for {segments.filter(s => s.audio).length} segment{segments.filter(s => s.audio).length !== 1 ? 's' : ''}
                </span>
                {ffmpeg ? (
                  <span className="audio-success">
                    ✅ Will be included in export
                  </span>
                ) : (
                  <span className="audio-error">
                    ❌ FFmpeg not available for audio mixing
                  </span>
                )}
              </div>
            )}
          </div>
          
          {rendering && (
            <div className="render-progress">
              <progress value={progress} />
              <span>{Math.round(progress * 100)}%</span>
            </div>
          )}
          
          {/* Audio Engine - always visible for sample management */}
          <div className="integrated-audio-engine">
            <AudioEngine
              segments={segments}
              currentSegmentIndex={currentSegmentIndex}
              isPlaying={isVideoPlaying}
              settings={audioSettings}
              onSettingsChange={setAudioSettings}
              onSamplesChange={onSamplesChange}
            />
          </div>
        </div>
      )}
      {src && (
        <>
          <div className="video-with-audio">
            <video
              ref={videoRef}
              style={{
                width: "100%",
                maxHeight: "50vh",
              }}
              src={src}
              loop
              controls
              playsInline
              onPlay={handleVideoPlay}
              onPause={handleVideoPause}
              onEnded={handleVideoEnded}
            />
            
                        {/* Current playing segment info */}
            {isVideoPlaying && currentSegmentIndex >= 0 && segments[currentSegmentIndex]?.audio && (
              <div className="current-segment-info">
                <strong>🎵 Now Playing:</strong> Segment {currentSegmentIndex + 1} - {segments[currentSegmentIndex].audio?.type}
                {segments[currentSegmentIndex].audio?.type === 'sine' && 
                  ` (${segments[currentSegmentIndex].audio?.frequency}Hz)`}
                {segments[currentSegmentIndex].audio?.type === 'noise' && 
                  ` (${segments[currentSegmentIndex].audio?.noiseType || 'white'})`}
              </div>
            )}
          </div>
          
          <p>
            <a download={downloadName} href={src}>
              Download Video
            </a>
          </p>
        </>
      )}
    </Section>
  );
};
