export type InputProps<T> = {
  value: T;
  onChange: (newValue: T) => unknown;
};

export type Vid = {
  src: string;
  file: File;
  name: string;
  chunks: EncodedVideoChunk[];
};

export type Segment = {
  name: string;
  from: number;
  to: number;
  repeat: number;
  audio?: AudioSegment;
};

export type Settings = {
  width: number;
  height: number;
};

export type SegmentPreset = {
  name: string;
  segments: Array<{
    from: number;
    to: number;
    repeat: number;
  }>;
};

export type AudioAnalysis = {
  amplitude: number;
  frequency: number;
  lowFreq: number;
  midFreq: number;
  highFreq: number;
  beat: boolean;
};

export type RealTimeSettings = {
  enabled: boolean;
  sensitivity: number;
  frameLossIntensity: number;
  moshingIntensity: number;
  beatThreshold: number;
};

export interface AudioSettings {
  volume: number;
  enabled: boolean;
}

export interface AudioSegment {
  type: 'noise' | 'sine' | 'sample';
  frequency?: number;
  duration?: number;
  volume?: number;
  sampleUrl?: string;
  noiseType?: 'white' | 'pink' | 'brown';
}

export type ThreeJSShape = 'cube' | 'sphere' | 'plane' | 'cylinder' | 'torus' | 'cone';

export interface ThreeJSSettings {
  enabled: boolean;
  shape: ThreeJSShape;
  wireframe: boolean;
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  scale: {
    x: number;
    y: number;
    z: number;
  };
  position: {
    x: number;
    y: number;
    z: number;
  };
  autoRotate: boolean;
  autoRotateSpeed: number;
  audioReactive: boolean;
  displacement: {
    enabled: boolean;
    intensity: number;
    audioMultiplier: number;
    frequencyResponse: 'amplitude' | 'lowFreq' | 'midFreq' | 'highFreq' | 'beat';
    beatBoost: number;
  };
  cameraControls: {
    enableDamping: boolean;
    dampingFactor: number;
    enableZoom: boolean;
    enablePan: boolean;
    enableRotate: boolean;
    minDistance: number;
    maxDistance: number;
  };
}
