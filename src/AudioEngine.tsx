import { useEffect, useRef, useState } from "react";
import { AudioSettings, AudioSegment, Segment } from "./types";

interface AudioEngineProps {
  segments: Segment[];
  currentSegmentIndex: number;
  isPlaying: boolean;
  settings: AudioSettings;
  onSettingsChange: (settings: AudioSettings) => void;
  onSamplesChange?: (samples: { name: string; url: string; file?: File }[]) => void;
}

export const AudioEngine = ({
  segments,
  currentSegmentIndex,
  isPlaying,
  settings,
  onSettingsChange,
  onSamplesChange,
}: AudioEngineProps) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const noiseBufferRef = useRef<{ [key: string]: AudioBuffer }>({});
  const sampleBuffersRef = useRef<{ [key: string]: AudioBuffer }>({});
  
  const [availableSamples, setAvailableSamples] = useState([
    { name: 'Kick', url: '/samples/kick.wav' },
    { name: 'Snare', url: '/samples/snare.wav' },
    { name: 'Hi-Hat', url: '/samples/hihat.wav' },
    { name: 'Crash', url: '/samples/crash.wav' },
  ]);
  
  // Check if any segments have audio to optimize performance
  const hasAudioSegments = segments.some(segment => segment.audio);

  // Notify parent component of available samples when they change
  useEffect(() => {
    if (onSamplesChange) {
      onSamplesChange(availableSamples);
    }
  }, [availableSamples, onSamplesChange]);

  // Load audio samples from directory
  const loadSamplesFromDirectory = async (files: FileList) => {
    console.log('🎵 Loading samples from directory...');
    console.log('🎵 Total files received:', files.length);
    
    // Log all files for debugging
    Array.from(files).forEach((file, index) => {
      console.log(`🎵 File ${index + 1}:`, {
        name: file.name,
        type: file.type,
        size: file.size,
        path: file.webkitRelativePath || 'no path'
      });
    });
    
    const audioFiles = Array.from(files).filter(file => {
      const isAudio = file.type.startsWith('audio/');
      const hasAudioExtension = /\.(wav|mp3|ogg|m4a|aac|flac|aiff|wma)$/i.test(file.name);
      const isValidAudio = isAudio || hasAudioExtension;
      
      if (!isValidAudio) {
        console.log(`🎵 Skipping non-audio file: ${file.name} (type: ${file.type})`);
      }
      
      return isValidAudio;
    });

    console.log(`🎵 Found ${audioFiles.length} audio files out of ${files.length} total files`);

    if (audioFiles.length === 0) {
      console.log('🎵 No audio files detected. File details:', Array.from(files).map(f => ({ name: f.name, type: f.type })));
      alert(`No audio files found in the selected directory.\n\nFiles found: ${files.length}\nSupported formats: WAV, MP3, OGG, M4A, AAC, FLAC, AIFF, WMA\n\nTry using "Upload Audio Files" instead.`);
      return;
    }

    const newSamples = audioFiles.map(file => ({
      name: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
      url: URL.createObjectURL(file), // Create blob URL
      file: file // Keep reference for cleanup if needed
    }));

    // Add to existing samples (keep defaults and add new ones)
    setAvailableSamples(prev => {
      const updated = [...prev, ...newSamples];
      if (onSamplesChange) {
        onSamplesChange(updated);
      }
      return updated;
    });
    console.log(`🎵 Added ${newSamples.length} samples to library:`, newSamples.map(s => s.name));
  };

  // Load individual audio files
  const loadIndividualSamples = async (files: FileList) => {
    console.log('🎵 Loading individual samples...');
    console.log('🎵 Files selected:', files.length);
    
    const audioFiles = Array.from(files).filter(file => {
      const isAudio = file.type.startsWith('audio/');
      const hasAudioExtension = /\.(wav|mp3|ogg|m4a|aac|flac|aiff|wma)$/i.test(file.name);
      return isAudio || hasAudioExtension;
    });

    if (audioFiles.length === 0) {
      alert(`No audio files selected.\nSupported formats: WAV, MP3, OGG, M4A, AAC, FLAC, AIFF, WMA`);
      return;
    }

    const newSamples = audioFiles.map(file => ({
      name: file.name.replace(/\.[^/.]+$/, ''),
      url: URL.createObjectURL(file),
      file: file
    }));

    setAvailableSamples(prev => {
      const updated = [...prev, ...newSamples];
      if (onSamplesChange) {
        onSamplesChange(updated);
      }
      return updated;
    });
    console.log(`🎵 Added ${newSamples.length} individual samples:`, newSamples.map(s => s.name));
  };

  // Initialize audio context
  useEffect(() => {
    if (settings.enabled && hasAudioSegments && !audioContextRef.current) {
      console.log('🎵 Initializing AudioContext for preview...');
      audioContextRef.current = new AudioContext();
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.connect(audioContextRef.current.destination);
      gainNodeRef.current.gain.value = settings.volume;
      
      // Generate noise buffers
      generateNoiseBuffers();
    }
    
    return () => {
      if (audioContextRef.current) {
        console.log('🎵 Closing AudioContext...');
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [settings.enabled, hasAudioSegments]);

  // Update volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = settings.volume;
    }
  }, [settings.volume]);

  // Generate different types of noise
  const generateNoiseBuffers = () => {
    if (!audioContextRef.current) return;
    
    const sampleRate = audioContextRef.current.sampleRate;
    const bufferSize = sampleRate * 2; // 2 seconds of noise
    
    // White noise
    const whiteNoiseBuffer = audioContextRef.current.createBuffer(1, bufferSize, sampleRate);
    const whiteNoiseData = whiteNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      whiteNoiseData[i] = Math.random() * 2 - 1;
    }
    noiseBufferRef.current['white'] = whiteNoiseBuffer;
    
    // Pink noise (1/f noise)
    const pinkNoiseBuffer = audioContextRef.current.createBuffer(1, bufferSize, sampleRate);
    const pinkNoiseData = pinkNoiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      pinkNoiseData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    noiseBufferRef.current['pink'] = pinkNoiseBuffer;
    
    // Brown noise (Brownian noise)
    const brownNoiseBuffer = audioContextRef.current.createBuffer(1, bufferSize, sampleRate);
    const brownNoiseData = brownNoiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      brownNoiseData[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = brownNoiseData[i];
      brownNoiseData[i] *= 3.5;
    }
    noiseBufferRef.current['brown'] = brownNoiseBuffer;
  };

  // Load sample
  const loadSample = async (url: string): Promise<AudioBuffer | null> => {
    if (!audioContextRef.current) return null;
    
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      sampleBuffersRef.current[url] = audioBuffer;
      return audioBuffer;
    } catch (error) {
      console.error('Failed to load sample:', url, error);
      return null;
    }
  };

  // Play audio for current segment
  const playSegmentAudio = (audioSegment: AudioSegment) => {
    if (!audioContextRef.current || !gainNodeRef.current) return;
    
    // Stop current audio
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      currentSourceRef.current = null;
    }
    
    const segmentVolume = audioSegment.volume ?? 1.0;
    const segmentGain = audioContextRef.current.createGain();
    segmentGain.gain.value = segmentVolume;
    segmentGain.connect(gainNodeRef.current);
    
    switch (audioSegment.type) {
      case 'noise':
        playNoise(audioSegment.noiseType || 'white', segmentGain);
        break;
      case 'sine':
        playSineWave(audioSegment.frequency || 440, segmentGain);
        break;
      case 'sample':
        if (audioSegment.sampleUrl) {
          playSample(audioSegment.sampleUrl, segmentGain);
        }
        break;
    }
  };

  const playNoise = (noiseType: string, gainNode: GainNode) => {
    if (!audioContextRef.current) return;
    
    const buffer = noiseBufferRef.current[noiseType];
    if (!buffer) return;
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gainNode);
    source.start();
    currentSourceRef.current = source;
  };

  const playSineWave = (frequency: number, gainNode: GainNode) => {
    if (!audioContextRef.current) return;
    
    const oscillator = audioContextRef.current.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioContextRef.current.currentTime);
    oscillator.connect(gainNode);
    oscillator.start();
    currentSourceRef.current = oscillator;
  };

  const playSample = async (sampleUrl: string, gainNode: GainNode) => {
    if (!audioContextRef.current) return;
    
    let buffer = sampleBuffersRef.current[sampleUrl];
    if (!buffer) {
      const loadedBuffer = await loadSample(sampleUrl);
      if (!loadedBuffer) return;
      buffer = loadedBuffer;
    }
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gainNode);
    source.start();
    currentSourceRef.current = source;
  };

  // Handle segment changes
  useEffect(() => {
    if (!settings.enabled || !isPlaying) {
      // Stop current audio
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch (e) {
          // Ignore if already stopped
        }
        currentSourceRef.current = null;
      }
      return;
    }
    
    const currentSegment = segments[currentSegmentIndex];
    if (currentSegment?.audio) {
      playSegmentAudio(currentSegment.audio);
    }
  }, [currentSegmentIndex, isPlaying, settings.enabled]);

  // Always show sample management, but conditionally show other controls
  const showFullControls = hasAudioSegments;

  return (
    <div className="audio-engine">
      <h4>🔊 Audio Engine</h4>
      
      {!showFullControls && (
        <div className="audio-info">
          <span className="audio-disabled">🔇 No audio segments configured</span>
          <p><em>Configure audio per segment in the Timeline section to enable preview controls</em></p>
        </div>
      )}
      
      {showFullControls && (
        <>
          <div className="audio-controls">
            <label>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => onSettingsChange({ ...settings, enabled: e.target.checked })}
              />
              Enable Preview Audio
            </label>
            
            <div className="volume-control">
              <label>Volume:</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.volume}
                onChange={(e) => onSettingsChange({ ...settings, volume: parseFloat(e.target.value) })}
                disabled={!settings.enabled}
              />
              <span>{Math.round(settings.volume * 100)}%</span>
            </div>
          </div>
          
          <div className="audio-status">
            {settings.enabled ? (
              <div className="info">
                Preview audio active - sounds will play during video playback
              </div>
            ) : (
              <div className="warning">
                Preview audio disabled (export audio is independent)
              </div>
            )}
            
            {isPlaying && currentSegmentIndex >= 0 && segments[currentSegmentIndex]?.audio && (
              <div className="current-audio">
                <strong>Current:</strong> {segments[currentSegmentIndex].audio?.type}
                {segments[currentSegmentIndex].audio?.type === 'sine' && 
                  ` (${segments[currentSegmentIndex].audio?.frequency}Hz)`}
                {segments[currentSegmentIndex].audio?.type === 'noise' && 
                  ` (${segments[currentSegmentIndex].audio?.noiseType || 'white'})`}
              </div>
            )}
          </div>
        </>
      )}
      
      <div className="sample-management">
        <h5>Sample Library:</h5>
        <div className="sample-controls">
          <input
            type="file"
            id="sample-directory-input"
            style={{ display: 'none' }}
            // @ts-ignore - webkitdirectory is not in the types but is supported
            webkitdirectory=""
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                loadSamplesFromDirectory(e.target.files);
                e.target.value = ''; // Reset input
              }
            }}
          />
          <input
            type="file"
            id="sample-files-input"
            style={{ display: 'none' }}
            multiple
            accept="audio/*,.wav,.mp3,.ogg,.m4a,.aac,.flac,.aiff,.wma"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                loadIndividualSamples(e.target.files);
                e.target.value = ''; // Reset input
              }
            }}
          />
          <button
            onClick={() => document.getElementById('sample-directory-input')?.click()}
            className="load-samples-btn"
          >
            📁 Load from Directory
          </button>
          <button
            onClick={() => document.getElementById('sample-files-input')?.click()}
            className="load-samples-btn"
          >
            🎵 Upload Audio Files
          </button>
          
          {availableSamples.length > 4 && (
            <button
                             onClick={() => {
                 // Keep only the first 4 default samples
                 const defaultSamples = availableSamples.slice(0, 4);
                 setAvailableSamples(defaultSamples);
                 if (onSamplesChange) {
                   onSamplesChange(defaultSamples);
                 }
                 console.log('🎵 Cleared custom samples, kept defaults');
               }}
              className="clear-samples-btn"
            >
              🗑️ Clear Custom Samples
            </button>
          )}
        </div>
        
        <div className="sample-list">
          <strong>Available samples ({availableSamples.length}):</strong>
          <div className="sample-grid">
            {availableSamples.map((sample, index) => (
              <span key={sample.url} className={`sample-item ${index < 4 ? 'default' : 'custom'}`}>
                {sample.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="audio-help">
        <h5>Audio Configuration:</h5>
        <ul>
          <li><strong>Noise:</strong> White, pink, or brown noise bursts</li>
          <li><strong>Sine:</strong> Pure tone at specified frequency</li>
          <li><strong>Sample:</strong> Audio file playback (when available)</li>
        </ul>
        <p><em>Configure audio per segment in the Timeline section</em></p>
        <p><strong>Note:</strong> Audio configured in segments will automatically be included in video exports. This toggle only controls preview playback.</p>
      </div>
    </div>
  );
}; 