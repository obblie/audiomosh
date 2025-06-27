import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { useEffect, useRef, useState } from "react";

import { FilesEditor } from "./FilesEditor";
import { RealTimeMode } from "./RealTimeMode";
import { Rendering } from "./Rendering";
import { Timeline } from "./Timeline";
import { ThreeJSVideoTexture } from "./ThreeJSVideoTexture";
import { Segment, Vid, ThreeJSSettings } from "./types";

export const Studio = () => {
  const [loadingFfmpeg, setLoadingFfmpeg] = useState(true);
  const ffmpegRef = useRef(new FFmpeg());
  const [vids, setVids] = useState<Vid[]>([]);
  const [progress, setProgress] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [config, setConfig] = useState<VideoDecoderConfig | null>(null);
  const [settings, setSettings] = useState({
    width: 640,
    height: 480,
  });
  const [preprocessSettings, setPreprocessSettings] = useState(settings);
  const [renderedVideoSrc, setRenderedVideoSrc] = useState<string>("");
  const [availableSamples, setAvailableSamples] = useState<{ name: string; url: string; file?: File }[]>([]);
  const [currentVideoElement, setCurrentVideoElement] = useState<HTMLVideoElement | null>(null);
  const [threeJSSettings, setThreeJSSettings] = useState<ThreeJSSettings>({
    enabled: false,
    shape: 'cube',
    wireframe: false,
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    position: { x: 0, y: 0, z: 0 },
    autoRotate: true,
    autoRotateSpeed: 1,
    audioReactive: false,
    displacement: {
      enabled: true,
      intensity: 0.3,
      audioMultiplier: 2.0,
      frequencyResponse: 'amplitude',
      beatBoost: 1.5,
    },
    cameraControls: {
      enableDamping: true,
      dampingFactor: 0.05,
      enableZoom: true,
      enablePan: true,
      enableRotate: true,
      minDistance: 2,
      maxDistance: 20,
    },
  });

  // Handler to capture the rendered video element and pass it to Three.js
  const handleRenderedVideoReady = (videoElement: HTMLVideoElement | null) => {
    setCurrentVideoElement(videoElement);
  };

  useEffect(() => {
    (async () => {
      ffmpegRef.current.on("progress", (evt) => setProgress(evt.progress));

      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      console.log("loading ffmpeg...");
      await ffmpegRef.current.load({
        coreURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          "text/javascript"
        ),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          "application/wasm"
        ),
      });
      setLoadingFfmpeg(false);
      console.log("ffmpeg loaded");
    })();
  }, []);

  return loadingFfmpeg ? (
    <>Loading...</>
  ) : (
    <main className="Studio">
      <FilesEditor
        vids={vids}
        setVids={setVids}
        progress={progress}
        ffmpeg={ffmpegRef.current}
        onConfig={setConfig}
        settings={settings}
        preprocessSettings={preprocessSettings}
        setPreprocessSettings={setPreprocessSettings}
      />
      <Timeline vids={vids} segments={segments} setSegments={setSegments} availableSamples={availableSamples} />
      <ThreeJSVideoTexture
        vids={vids}
        currentVideoElement={currentVideoElement || undefined}
        segments={segments}
        enabled={threeJSSettings.enabled}
        settings={threeJSSettings}
        onSettingsChange={setThreeJSSettings}
      />
      <RealTimeMode 
        vids={vids} 
        segments={segments} 
        settings={settings} 
        renderedVideoSrc={renderedVideoSrc}
      />
      <Rendering
        vids={vids}
        segments={segments}
        config={config}
        settings={settings}
        setSettings={setSettings}
        preprocessSettings={preprocessSettings}
        onRenderedVideo={setRenderedVideoSrc}
        ffmpeg={ffmpegRef.current}
        onSamplesChange={setAvailableSamples}
        onVideoElementReady={handleRenderedVideoReady}
      />
    </main>
  );
};
