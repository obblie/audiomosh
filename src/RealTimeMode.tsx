import { useEffect, useRef, useState } from "react";
import { Section } from "./components/Section";
import { NumberInput } from "./NumberInput";
import { AudioAnalysis, RealTimeSettings, Vid, Segment } from "./types";

export const RealTimeMode = ({
  vids,
  segments,
  settings,
  renderedVideoSrc,
}: {
  vids: Vid[];
  segments: Segment[];
  settings: { width: number; height: number };
  renderedVideoSrc?: string;
}) => {
  // Debug: Log when rendered video source changes and ensure video plays
  useEffect(() => {
    console.log('🎬 RealTimeMode renderedVideoSrc updated:', {
      hasRenderedVideo: !!renderedVideoSrc,
      src: renderedVideoSrc ? renderedVideoSrc.substring(0, 50) + '...' : 'none',
      segmentsCount: segments.length,
      vidsCount: vids.length
    });
    
    // When rendered video source changes, ensure it starts playing
    if (renderedVideoSrc && renderedVideoRef.current) {
      console.log('🎬 Starting rendered video playback...');
      renderedVideoRef.current.load(); // Reload the video element
      renderedVideoRef.current.play().catch(e => console.warn('Video play failed:', e));
    }
  }, [renderedVideoSrc, segments.length, vids.length]);

  const [isActive, setIsActive] = useState(false);
  const [audioPermission, setAudioPermission] = useState<boolean | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default');
  const [realTimeSettings, setRealTimeSettings] = useState<RealTimeSettings>({
    enabled: false,
    sensitivity: 20, // Lowered from 50 to make effects more responsive
    frameLossIntensity: 50, // Increased from 30
    moshingIntensity: 40, // Increased from 20
    beatThreshold: 0.3, // Lowered from 0.8 to detect beats more easily
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRefs = useRef<HTMLVideoElement[]>([]);
  const renderedVideoRef = useRef<HTMLVideoElement | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const isActiveRef = useRef<boolean>(false); // Add ref for immediate access

  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysis>({
    amplitude: 0,
    frequency: 0,
    lowFreq: 0,
    midFreq: 0,
    highFreq: 0,
    beat: false,
  });

  // Raw audio level for debugging (always running when mic is active)
  const [rawAudioLevel, setRawAudioLevel] = useState<number>(0);
  const debugAnimationRef = useRef<number | null>(null);
  
  // Timeline playback state
  const [timelinePosition, setTimelinePosition] = useState<number>(0);
  const timelineStartTime = useRef<number>(0);
  const currentSegmentIndex = useRef<number>(0);
  const segmentFrameIndex = useRef<number>(0);
  const segmentRepeatCount = useRef<number>(0);

  // Enumerate available audio devices
  const loadAudioDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputs);
      console.log('Available audio devices:', audioInputs);
    } catch (error) {
      console.error('Failed to enumerate audio devices:', error);
    }
  };

  // Initialize audio context and microphone
  const initializeAudio = async (deviceId?: string) => {
    try {
      // First load available devices
      await loadAudioDevices();

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      };

      // Use specific device if provided
      if (deviceId && deviceId !== 'default') {
        audioConstraints.deviceId = { exact: deviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints
      });
      
      audioContextRef.current = new AudioContext();
      
      // Resume audio context if suspended (required for user interaction)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      analyserRef.current.fftSize = 1024; // Reduced for better performance
      analyserRef.current.smoothingTimeConstant = 0.3; // Less smoothing for more responsiveness
      
      source.connect(analyserRef.current);
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      setAudioPermission(true);
      console.log("Audio initialized successfully", {
        sampleRate: audioContextRef.current.sampleRate,
        fftSize: analyserRef.current.fftSize,
        frequencyBinCount: analyserRef.current.frequencyBinCount
      });

      // Start debug level monitoring immediately after audio init
      startDebugLevelMonitoring();
    } catch (error) {
      console.error("Audio initialization failed:", error);
      setAudioPermission(false);
    }
  };

  // Simple debug level monitoring (always running when mic is active)
  const startDebugLevelMonitoring = () => {
    if (!analyserRef.current || !dataArrayRef.current) return;

    const updateLevel = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      const dataArray = dataArrayRef.current;
      
      // Simple average level calculation
      const sum = dataArray.reduce((total, value) => total + value, 0);
      const average = sum / dataArray.length;
      const level = average / 255; // Normalize to 0-1
      
      setRawAudioLevel(level);
      
      // Continue monitoring
      debugAnimationRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  };

  const stopDebugLevelMonitoring = () => {
    if (debugAnimationRef.current) {
      cancelAnimationFrame(debugAnimationRef.current);
      debugAnimationRef.current = null;
    }
    setRawAudioLevel(0);
  };

  // Switch to a different audio device
  const switchAudioDevice = async (deviceId: string) => {
    console.log('Switching to audio device:', deviceId);
    setSelectedDeviceId(deviceId);
    
    if (audioPermission === true) {
      // Stop current monitoring
      stopDebugLevelMonitoring();
      
      // Close current audio context
      if (audioContextRef.current) {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }
      
      // Reinitialize with new device
      await initializeAudio(deviceId);
    }
  };

  // Audio analysis function
  const analyzeAudio = (): AudioAnalysis => {
    if (!analyserRef.current || !dataArrayRef.current || !audioContextRef.current) {
      return { amplitude: 0, frequency: 0, lowFreq: 0, midFreq: 0, highFreq: 0, beat: false };
    }

    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    const dataArray = dataArrayRef.current;
    
    // Calculate amplitude (overall volume)
    const amplitude = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length / 255;
    
    // Frequency band analysis
    const binCount = dataArray.length;
    const lowEnd = Math.floor(binCount * 0.15);   // 0-15% (bass)
    const midEnd = Math.floor(binCount * 0.5);    // 15-50% (mids)
    const highEnd = Math.floor(binCount * 0.85);  // 50-85% (highs)
    
    const lowFreq = dataArray.slice(0, lowEnd).reduce((sum, value) => sum + value, 0) / lowEnd / 255;
    const midFreq = dataArray.slice(lowEnd, midEnd).reduce((sum, value) => sum + value, 0) / (midEnd - lowEnd) / 255;
    const highFreq = dataArray.slice(midEnd, highEnd).reduce((sum, value) => sum + value, 0) / (highEnd - midEnd) / 255;
    
    // Beat detection (simple threshold-based)
    const beat = amplitude > (realTimeSettings.beatThreshold / 100);
    
    // Dominant frequency detection
    let maxIndex = 0;
    let maxValue = 0;
    for (let i = 0; i < dataArray.length; i++) {
      if (dataArray[i] > maxValue) {
        maxValue = dataArray[i];
        maxIndex = i;
      }
    }
    const frequency = (maxIndex * audioContextRef.current.sampleRate) / (analyserRef.current.fftSize * 2);
    
    // Debug output occasionally
    if (Math.random() < 0.01) { // 1% of the time
      console.log('Audio analysis:', { 
        amplitude: amplitude.toFixed(3), 
        lowFreq: lowFreq.toFixed(3), 
        midFreq: midFreq.toFixed(3), 
        highFreq: highFreq.toFixed(3),
        beat,
        frequency: frequency.toFixed(0)
      });
    }
    
    return { amplitude, frequency, lowFreq, midFreq, highFreq, beat };
  };

  // Apply datamoshing effects to canvas based on audio
  const applyAudioEffects = (ctx: CanvasRenderingContext2D, analysis: AudioAnalysis) => {
    const { amplitude, lowFreq, midFreq, highFreq, beat } = analysis;
    const { sensitivity, frameLossIntensity, moshingIntensity } = realTimeSettings;
    
    const imageData = ctx.getImageData(0, 0, settings.width, settings.height);
    const data = imageData.data;
    const corruptionLevel = amplitude * sensitivity / 100;
    
    // 1. MACROBLOCK CORRUPTION (simulates codec block errors)
    if (amplitude > 0.1) {
      const blockSize = 16; // Typical macroblock size
      const blocksToCorrupt = Math.floor(corruptionLevel * frameLossIntensity);
      
      for (let i = 0; i < blocksToCorrupt; i++) {
        const blockX = Math.floor(Math.random() * (settings.width / blockSize)) * blockSize;
        const blockY = Math.floor(Math.random() * (settings.height / blockSize)) * blockSize;
        
        // Corrupt the entire block
        for (let y = 0; y < blockSize; y++) {
          for (let x = 0; x < blockSize; x++) {
            const pixelX = blockX + x;
            const pixelY = blockY + y;
            if (pixelX < settings.width && pixelY < settings.height) {
              const index = (pixelY * settings.width + pixelX) * 4;
              
              // Different corruption types based on frequency
              if (lowFreq > 0.3) {
                // Low freq: repeat previous block data (motion vector error)
                const sourceX = Math.max(0, pixelX - blockSize);
                const sourceIndex = (pixelY * settings.width + sourceX) * 4;
                data[index] = data[sourceIndex];
                data[index + 1] = data[sourceIndex + 1];
                data[index + 2] = data[sourceIndex + 2];
              } else if (midFreq > 0.3) {
                // Mid freq: zero out block (I-frame loss)
                data[index] = 0;
                data[index + 1] = 0;
                data[index + 2] = 0;
              } else {
                // High freq: random corruption
                data[index] = Math.random() * 255;
                data[index + 1] = Math.random() * 255;
                data[index + 2] = Math.random() * 255;
              }
            }
          }
        }
      }
    }
    
    // 2. MOTION VECTOR CORRUPTION (horizontal displacement based on bass)
    if (lowFreq > 0.2) {
      const moshIntensity = lowFreq * moshingIntensity / 50;
      
      for (let y = 0; y < settings.height; y += 2) { // Skip lines for performance
        const displacement = Math.floor(Math.sin(y * 0.02 + amplitude * 10) * moshIntensity * 30);
        
        for (let x = 0; x < settings.width; x++) {
          const sourceX = (x + displacement + settings.width) % settings.width;
          const sourceIndex = (y * settings.width + sourceX) * 4;
          const targetIndex = (y * settings.width + x) * 4;
          
          if (sourceIndex < data.length && targetIndex < data.length) {
            data[targetIndex] = data[sourceIndex];
            data[targetIndex + 1] = data[sourceIndex + 1];
            data[targetIndex + 2] = data[sourceIndex + 2];
          }
        }
      }
    }
    
    // 3. CHROMA CORRUPTION (color channel separation)
    if (midFreq > 0.25 || highFreq > 0.25) {
      const chromaShift = Math.floor((midFreq + highFreq) * 20);
      
      // Separate and shift color channels
      const tempData = new Uint8ClampedArray(data.length);
      tempData.set(data);
      
      for (let i = 0; i < data.length; i += 4) {
        const pixelIndex = i / 4;
        const x = pixelIndex % settings.width;
        const y = Math.floor(pixelIndex / settings.width);
        
        // Shift red channel
        const redX = (x + chromaShift) % settings.width;
        const redIndex = (y * settings.width + redX) * 4;
        if (redIndex < tempData.length) data[i] = tempData[redIndex];
        
        // Shift blue channel opposite direction
        const blueX = (x - chromaShift + settings.width) % settings.width;
        const blueIndex = (y * settings.width + blueX) * 4 + 2;
        if (blueIndex < tempData.length) data[i + 2] = tempData[blueIndex];
      }
    }
    
    // 4. P-FRAME GHOSTING (blend with previous frame data)
    if (beat && amplitude > 0.3) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.7 + (amplitude * 0.3);
      ctx.putImageData(imageData, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      console.log('👻 P-frame ghosting triggered!');
    } else {
      ctx.putImageData(imageData, 0, 0);
    }
    
    // 5. BEAT-TRIGGERED FRAME CORRUPTION (simulate GOP errors)
    if (beat && Math.random() < 0.3) {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.3)`;
      ctx.fillRect(0, 0, settings.width, settings.height);
      ctx.globalCompositeOperation = 'source-over';
      console.log('💥 GOP corruption triggered!');
    }
  };

  // Render the video input (either rendered video or fallback)
  const renderVideoFrame = (ctx: CanvasRenderingContext2D) => {
    // Priority 1: Use rendered video if available
    if (renderedVideoSrc && renderedVideoRef.current) {
      const video = renderedVideoRef.current;
      
      // Check if video is ready and has valid dimensions
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        // Ensure video is playing
        if (video.paused) {
          console.log('🎬 Rendered video was paused, resuming...');
          video.play().catch(e => console.warn('Video play failed:', e));
        }
        
        console.log('🎬 Using rendered video as input:', renderedVideoSrc.substring(0, 50) + '...');
        ctx.drawImage(video, 0, 0, settings.width, settings.height);
        return { success: true, source: 'rendered' };
      } else {
        // Video not ready yet, try to load/play it
        if (video.readyState === 0) {
          console.log('🎬 Rendered video not loaded, attempting to load...');
          video.load();
        }
        if (video.paused) {
          video.play().catch(e => console.warn('Video play failed:', e));
        }
      }
    }
    
    // Debug logging
    if (renderedVideoSrc) {
      console.log('⚠️ Rendered video available but not ready:', {
        hasSrc: !!renderedVideoSrc,
        hasRef: !!renderedVideoRef.current,
        readyState: renderedVideoRef.current?.readyState,
        src: renderedVideoSrc.substring(0, 50) + '...'
      });
    }
    
    // Priority 2: Fallback to timeline segments
    if (segments.length > 0) {
      // Get current segment
      const currentSegment = segments[currentSegmentIndex.current];
      if (!currentSegment) {
        // End of timeline - restart
        currentSegmentIndex.current = 0;
        segmentFrameIndex.current = 0;
        segmentRepeatCount.current = 0;
        return { success: false, source: 'timeline-ended' };
      }

      // Find the video for this segment
      const vid = vids.find(v => v.name === currentSegment.name);
      if (!vid) return { success: false, source: 'no-vid' };

      // Get the video element
      const video = videoRefs.current.find((_, i) => vids[i]?.name === currentSegment.name);
      if (!video || video.readyState < 2) return { success: false, source: 'video-not-ready' };

      // Calculate frame position within the segment
      const segmentLength = currentSegment.to - currentSegment.from;
      const frameInSegment = segmentFrameIndex.current % segmentLength;
      const absoluteFrame = currentSegment.from + frameInSegment;
      
      // Set video time to the correct frame (assuming 30 FPS)
      const timePerFrame = video.duration / vid.chunks.length;
      video.currentTime = absoluteFrame * timePerFrame;
      
      // Draw the video frame
      ctx.drawImage(video, 0, 0, settings.width, settings.height);
      
      // Advance timeline position
      segmentFrameIndex.current++;
      
      // Check if we need to repeat the segment or move to next
      if (frameInSegment >= segmentLength - 1) {
        segmentRepeatCount.current++;
        
        if (segmentRepeatCount.current >= currentSegment.repeat) {
          // Move to next segment
          currentSegmentIndex.current++;
          segmentFrameIndex.current = 0;
          segmentRepeatCount.current = 0;
        } else {
          // Repeat current segment
          segmentFrameIndex.current = 0;
        }
      }
      
      return { success: true, source: 'timeline' };
    }
    
    // Priority 3: Show message if no input available
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, settings.width, settings.height);
    ctx.fillStyle = 'white';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No video input available', settings.width / 2, settings.height / 2 - 10);
    ctx.fillText('Render a video or configure timeline segments', settings.width / 2, settings.height / 2 + 10);
    ctx.textAlign = 'left';
    
    return { success: false, source: 'no-input' };
  };

  // Main animation loop
  const animate = () => {
    if (!isActiveRef.current || !analyserRef.current || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const analysis = analyzeAudio();
    
    setAudioAnalysis(analysis);
    
    // Clear canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, settings.width, settings.height);
    
    // Render video frame (rendered video, timeline, or fallback)
    const renderResult = renderVideoFrame(ctx);
    
    if (renderResult.success) {
      // Apply real-time audio effects to the video output
      applyAudioEffects(ctx, analysis);
      
      // Status overlay based on source
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(5, 5, 400, 25);
      ctx.fillStyle = '#00ff00';
      ctx.font = '14px monospace';
      
      let displayText = '';
      if (renderResult.source === 'rendered') {
        displayText = `🎵 LIVE | RENDERED VIDEO INPUT | ${(analysis.amplitude * 100).toFixed(0)}%`;
        // Extra visual indicator for rendered video
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.fillRect(0, 0, settings.width, 30);
        ctx.fillStyle = '#00ff00';
      } else if (renderResult.source === 'timeline') {
        const segmentInfo = segments[currentSegmentIndex.current];
        displayText = segmentInfo 
          ? `🎵 LIVE | Seg ${currentSegmentIndex.current + 1}/${segments.length} | ${segmentInfo.name} | ${(analysis.amplitude * 100).toFixed(0)}%`
          : `🎵 LIVE | Timeline | ${(analysis.amplitude * 100).toFixed(0)}%`;
      }
      
      ctx.fillText(displayText, 10, 22);
    } else {
      // Fallback to audio visualization if no timeline
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, settings.width, settings.height);
      
      // Audio bars
      const barWidth = 40;
      const spacing = 50;
      
      const ampHeight = analysis.amplitude * (settings.height - 100);
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(20, settings.height - ampHeight - 20, barWidth, ampHeight);
      
      const bassHeight = analysis.lowFreq * (settings.height - 100);
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(20 + spacing, settings.height - bassHeight - 20, barWidth, bassHeight);
      
      const midsHeight = analysis.midFreq * (settings.height - 100);
      ctx.fillStyle = '#44ff44';
      ctx.fillRect(20 + spacing * 2, settings.height - midsHeight - 20, barWidth, midsHeight);
      
      const highsHeight = analysis.highFreq * (settings.height - 100);
      ctx.fillStyle = '#4444ff';
      ctx.fillRect(20 + spacing * 3, settings.height - highsHeight - 20, barWidth, highsHeight);
      
      // Status text
      ctx.fillStyle = 'white';
      ctx.font = '16px monospace';
      ctx.fillText('Configure timeline segments to start live datamoshing', 20, 30);
    }
    
    animationIdRef.current = requestAnimationFrame(animate);
  };

  // Start/stop real-time mode
  const toggleRealTimeMode = async () => {
    console.log('🔄 toggleRealTimeMode called', { 
      isActive, 
      audioPermission, 
      hasAnalyser: !!analyserRef.current,
      hasCanvas: !!canvasRef.current,
      videosCount: vids.length 
    });
    
    if (!isActive) {
      console.log('🚀 Starting real-time mode...');
      
      if (audioPermission === null) {
        console.log('🎤 Initializing audio...');
        await initializeAudio(selectedDeviceId);
      }
      
      // Resume audio context if needed
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        console.log('▶️ Resuming audio context...');
        await audioContextRef.current.resume();
      }
      
      if (audioPermission !== false) {
        console.log('✅ Activating real-time mode');
        setIsActive(true);
        isActiveRef.current = true; // Set ref immediately for animate() function
        setRealTimeSettings({ ...realTimeSettings, enabled: true });
        
        // Reset timeline playback to start
        currentSegmentIndex.current = 0;
        segmentFrameIndex.current = 0;
        segmentRepeatCount.current = 0;
        timelineStartTime.current = Date.now();
        
        // Start animation immediately, no timeout
        console.log('🎬 Starting timeline rendering with', segments.length, 'segments');
        console.log('🎬 Segments configuration:', segments);
        console.log('🎬 Rendered video source:', renderedVideoSrc ? renderedVideoSrc.substring(0, 50) + '...' : 'none');
        console.log('Canvas ref:', canvasRef.current);
        console.log('Analyser ref:', analyserRef.current);
        
        if (canvasRef.current && analyserRef.current) {
          console.log('✅ Canvas and analyser ready - starting animation');
          animate();
        } else {
          console.error('❌ Missing canvas or analyser', {
            canvas: !!canvasRef.current,
            analyser: !!analyserRef.current
          });
          
          // Try again after a short delay
          setTimeout(() => {
            console.log('🔄 Retrying animation start...');
            if (canvasRef.current && analyserRef.current) {
              console.log('✅ Retry successful - starting animation');
              animate();
            } else {
              console.error('❌ Retry failed - still missing requirements');
            }
          }, 500);
        }
        
        // Start video playback if available
        if (vids.length > 0) {
          videoRefs.current.forEach((video, index) => {
            if (video) {
              video.currentTime = 0;
              video.play().then(() => {
                console.log(`📹 Video ${index} started playing`);
              }).catch(error => {
                console.log(`❌ Video ${index} play failed:`, error);
              });
            }
          });
        } else {
          console.log('⚠️ No videos available, running audio-only mode');
        }
      } else {
        console.error('❌ Audio permission denied, cannot start real-time mode');
      }
    } else {
      console.log('🛑 Stopping real-time mode...');
      setIsActive(false);
      isActiveRef.current = false; // Set ref immediately to stop animation
      setRealTimeSettings({ ...realTimeSettings, enabled: false });
      
      if (animationIdRef.current) {
        console.log('🗑️ Canceling animation frame');
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
      
      // Pause videos
      videoRefs.current.forEach((video, index) => {
        if (video) {
          video.pause();
          console.log(`⏸️ Video ${index} paused`);
        }
      });
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (debugAnimationRef.current) {
        cancelAnimationFrame(debugAnimationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <Section name="🎵 Real-Time Audio Mode">
      <div className="realtime-controls">
        <p className="realtime-description">
          <strong>Experimental:</strong> Use your microphone to drive datamosh effects in real-time!
        </p>
        
        {audioPermission === false && (
          <p className="error">❌ Microphone access denied. Please enable microphone permissions.</p>
        )}
        
        {!renderedVideoSrc && segments.length === 0 && (
          <p className="warning">⚠️ No video input - render a video or configure timeline segments.</p>
        )}
        
        {renderedVideoSrc && (
          <p className="info">✅ Using rendered video as input - real-time effects will be applied to rendered output.</p>
        )}
        
        {!renderedVideoSrc && segments.length > 0 && (
          <p className="info">✅ Timeline configured with {segments.length} segments - real-time effects will be applied to timeline output.</p>
        )}
        
        <div className="realtime-toggle">
          <button 
            onClick={toggleRealTimeMode}
            disabled={false}
            className={isActive ? "active" : ""}
          >
            {isActive ? "🔴 Stop Real-Time Mode" : "🎵 Start Real-Time Mode"}
          </button>
        </div>
        
        {audioPermission === null && (
          <button onClick={() => initializeAudio(selectedDeviceId)}>
            🎤 Request Microphone Access
          </button>
        )}

        {/* Audio device selection */}
        {audioDevices.length > 0 && (
          <div className="audio-device-selection">
            <h4>🎧 Audio Input Device</h4>
            <div className="device-selector">
              <label>Select Audio Input:</label>
              <select 
                value={selectedDeviceId} 
                onChange={(e) => switchAudioDevice(e.target.value)}
              >
                <option value="default">Default Device</option>
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 8)}...`}
                  </option>
                ))}
              </select>
              {audioPermission === true && (
                <button 
                  onClick={() => switchAudioDevice(selectedDeviceId)}
                  className="refresh-audio"
                >
                  🔄 Refresh
                </button>
              )}
            </div>
            <p className="device-info">
              Current: {audioDevices.find(d => d.deviceId === selectedDeviceId)?.label || 'Default Device'}
            </p>
          </div>
        )}

        {/* Always visible debug level meter when mic is active */}
        {audioPermission === true && (
          <div className="debug-level-meter">
            <h4>🎤 Microphone Level Debug</h4>
            <div className="debug-meter">
              <label>Raw Audio Level:</label>
              <div className="debug-meter-bar">
                <div 
                  className="debug-meter-fill" 
                  style={{ width: `${rawAudioLevel * 100}%` }}
                />
              </div>
              <span>{Math.round(rawAudioLevel * 100)}%</span>
            </div>
            <p className="debug-instructions">
              <strong>Speak or make noise</strong> - the bar should move if your microphone is working.
            </p>
            {rawAudioLevel < 0.01 && (
              <p className="debug-warning">
                ⚠️ No audio detected. Check your microphone permissions and volume.
              </p>
            )}
            {rawAudioLevel > 0.1 && (
              <p className="debug-success">
                ✅ Audio is being detected! Level: {(rawAudioLevel * 100).toFixed(1)}%
              </p>
            )}
          </div>
        )}
        
        <div className="realtime-settings">
          <h4>Audio Sensitivity</h4>
          <div className="setting-row">
            <label>Overall Sensitivity:</label>
            <NumberInput
              value={realTimeSettings.sensitivity}
              onChange={(sensitivity) => setRealTimeSettings({ ...realTimeSettings, sensitivity })}
              min={1}
              max={100}
            />
            <span>%</span>
          </div>
          
          <div className="setting-row">
            <label>Frame Loss Intensity:</label>
            <NumberInput
              value={realTimeSettings.frameLossIntensity}
              onChange={(frameLossIntensity) => setRealTimeSettings({ ...realTimeSettings, frameLossIntensity })}
              min={0}
              max={100}
            />
            <span>%</span>
          </div>
          
          <div className="setting-row">
            <label>Moshing Intensity:</label>
            <NumberInput
              value={realTimeSettings.moshingIntensity}
              onChange={(moshingIntensity) => setRealTimeSettings({ ...realTimeSettings, moshingIntensity })}
              min={0}
              max={100}
            />
            <span>%</span>
          </div>
          
          <div className="setting-row">
            <label>Beat Threshold:</label>
            <NumberInput
              value={realTimeSettings.beatThreshold}
              onChange={(beatThreshold) => setRealTimeSettings({ ...realTimeSettings, beatThreshold })}
              min={0}
              max={100}
            />
            <span>%</span>
          </div>
        </div>
        
        {isActive && (
          <div className="audio-visualization">
            <h4>🎵 Live Audio Analysis</h4>
            <div className="audio-meters">
              <div className="meter">
                <label>Amplitude:</label>
                <div className="meter-bar">
                  <div 
                    className="meter-fill" 
                    style={{ width: `${audioAnalysis.amplitude * 100}%` }}
                  />
                </div>
                <span>{Math.round(audioAnalysis.amplitude * 100)}%</span>
              </div>
              
              <div className="meter">
                <label>Bass:</label>
                <div className="meter-bar">
                  <div 
                    className="meter-fill bass" 
                    style={{ width: `${audioAnalysis.lowFreq * 100}%` }}
                  />
                </div>
                <span>{Math.round(audioAnalysis.lowFreq * 100)}%</span>
              </div>
              
              <div className="meter">
                <label>Mids:</label>
                <div className="meter-bar">
                  <div 
                    className="meter-fill mids" 
                    style={{ width: `${audioAnalysis.midFreq * 100}%` }}
                  />
                </div>
                <span>{Math.round(audioAnalysis.midFreq * 100)}%</span>
              </div>
              
              <div className="meter">
                <label>Highs:</label>
                <div className="meter-bar">
                  <div 
                    className="meter-fill highs" 
                    style={{ width: `${audioAnalysis.highFreq * 100}%` }}
                  />
                </div>
                <span>{Math.round(audioAnalysis.highFreq * 100)}%</span>
              </div>
              
              <div className="beat-indicator">
                <span className={audioAnalysis.beat ? "beat active" : "beat"}>
                  {audioAnalysis.beat ? "🥁 BEAT!" : "🎵 listening..."}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Hidden video elements for processing */}
      <div style={{ display: 'none' }}>
        {/* Rendered video input (priority 1) */}
        {renderedVideoSrc && (
          <video
            ref={renderedVideoRef}
            src={renderedVideoSrc}
            muted
            loop
            playsInline
            autoPlay
            onLoadedData={() => {
              console.log('🎬 Rendered video loaded and ready');
              // Ensure video starts playing
              if (renderedVideoRef.current) {
                renderedVideoRef.current.play().catch(e => console.warn('Video play failed:', e));
              }
            }}
            onCanPlay={() => {
              console.log('🎬 Rendered video can play');
              // Start playing when ready
              if (renderedVideoRef.current) {
                renderedVideoRef.current.play().catch(e => console.warn('Video play failed:', e));
              }
            }}
            onError={(e) => console.error('❌ Rendered video error:', e)}
          />
        )}
        
        {/* Timeline segment videos (fallback) */}
        {vids.map((vid, index) => (
          <video
            key={vid.name}
            ref={(el) => {
              if (el) videoRefs.current[index] = el;
            }}
            src={vid.src}
            muted
            loop
            playsInline
          />
        ))}
      </div>
      
      {/* Real-time output canvas */}
      <div className="realtime-output">
        <h4>🎬 Live Timeline + Audio Effects {isActive ? "(ACTIVE)" : "(INACTIVE)"}</h4>
        <canvas
          ref={canvasRef}
          width={settings.width}
          height={settings.height}
          style={{
            width: '100%',
            maxHeight: '50vh',
            border: isActive ? '2px solid #ff4444' : '1px solid white',
            imageRendering: 'pixelated',
            background: isActive ? 'black' : '#333'
          }}
        />
        {!isActive && (
          <p style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.9em', color: '#aaa' }}>
            {renderedVideoSrc 
              ? "Click \"Start Real-Time Mode\" to apply live audio effects to rendered video"
              : segments.length > 0 
                ? "Click \"Start Real-Time Mode\" to play timeline with live audio effects"
                : "Render a video or configure timeline segments first, then start real-time mode"
            }
          </p>
        )}
      </div>
    </Section>
  );
}; 