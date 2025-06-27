import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { Vid, Segment, AudioAnalysis, ThreeJSSettings, ThreeJSShape } from './types';
import { Section } from './components/Section';
import './components/ThreeJS.css';

interface ThreeJSVideoTextureProps {
  vids: Vid[];
  currentVideoElement?: HTMLVideoElement;
  segments: Segment[];
  audioAnalysis?: AudioAnalysis;
  enabled: boolean;
  settings: ThreeJSSettings;
  onSettingsChange: (settings: ThreeJSSettings) => void;
}

export const ThreeJSVideoTexture: React.FC<ThreeJSVideoTextureProps> = ({
  vids,
  currentVideoElement,
  segments,
  audioAnalysis,
  enabled,
  settings,
  onSettingsChange
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const videoTextureRef = useRef<THREE.VideoTexture | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Collapsible section state
  const [collapsedSections, setCollapsedSections] = useState({
    basic: false,
    displacement: false, // Show displacement controls by default
    camera: false,
    transform: true, // Start collapsed since it's less commonly used
  });

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Collapsible section component
  const CollapsibleSection: React.FC<{
    title: string;
    sectionKey: keyof typeof collapsedSections;
    children: React.ReactNode;
  }> = ({ title, sectionKey, children }) => {
    const isCollapsed = collapsedSections[sectionKey];
    
    return (
      <div className="control-group">
        <div 
          className="control-group-header"
          onClick={() => toggleSection(sectionKey)}
        >
          <h4>{title}</h4>
          <span className={`control-group-toggle ${!isCollapsed ? 'expanded' : ''}`}>
            ▶
          </span>
        </div>
        <div className={`control-group-content ${isCollapsed ? 'collapsed' : ''}`}>
          {children}
        </div>
      </div>
    );
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current || !enabled) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Setup orbit controls for mouse interaction
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = settings.cameraControls.enableDamping;
    controls.dampingFactor = settings.cameraControls.dampingFactor;
    controls.enableZoom = settings.cameraControls.enableZoom;
    controls.enablePan = settings.cameraControls.enablePan;
    controls.enableRotate = settings.cameraControls.enableRotate;
    controls.screenSpacePanning = false;
    controls.minDistance = settings.cameraControls.minDistance;
    controls.maxDistance = settings.cameraControls.maxDistance;
    controls.maxPolarAngle = Math.PI / 2; // Prevent going below ground
    controlsRef.current = controls;

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [enabled]);

  // Create geometry based on settings with higher subdivision for displacement
  const createGeometry = (shape: ThreeJSShape): THREE.BufferGeometry => {
    switch (shape) {
      case 'cube':
        return new THREE.BoxGeometry(2, 2, 2, 64, 64, 64); // Higher subdivision for displacement
      case 'sphere':
        return new THREE.SphereGeometry(1.5, 64, 64); // Higher subdivision
      case 'plane':
        return new THREE.PlaneGeometry(3, 2, 128, 128); // Higher subdivision
      case 'cylinder':
        return new THREE.CylinderGeometry(1, 1, 2, 64, 32); // Higher subdivision
      case 'torus':
        return new THREE.TorusGeometry(1, 0.4, 32, 128); // Higher subdivision
      case 'cone':
        return new THREE.ConeGeometry(1, 2, 64); // Higher subdivision
      default:
        return new THREE.BoxGeometry(2, 2, 2, 64, 64, 64);
    }
  };

  // Custom displacement shader
  const createDisplacementMaterial = (videoTexture: THREE.VideoTexture | null): THREE.ShaderMaterial => {
    const vertexShader = `
      uniform float uTime;
      uniform float uDisplacementIntensity;
      uniform float uAudioReactivity;
      uniform sampler2D uTexture;
      
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        
        // Sample texture for displacement (convert to grayscale)
        vec4 texColor = texture2D(uTexture, uv);
        float displacement = dot(texColor.rgb, vec3(0.299, 0.587, 0.114)); // RGB to grayscale
        
        // Apply audio reactivity
        displacement *= uDisplacementIntensity * (1.0 + uAudioReactivity);
        
        // Displace vertex along normal
        vec3 displacedPosition = position + normal * displacement;
        vPosition = displacedPosition;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
      }
    `;

    const fragmentShader = `
      uniform sampler2D uTexture;
      uniform float uTime;
      uniform bool uWireframe;
      
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        if (uWireframe) {
          gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
        } else {
          vec4 texColor = texture2D(uTexture, vUv);
          
          // Add some lighting based on normals
          vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
          float lightIntensity = max(dot(vNormal, lightDir), 0.3);
          
          gl_FragColor = vec4(texColor.rgb * lightIntensity, texColor.a);
        }
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture: { value: videoTexture || new THREE.Texture() },
        uTime: { value: 0 },
        uDisplacementIntensity: { value: settings.displacement.intensity },
        uAudioReactivity: { value: 0 },
        uWireframe: { value: settings.wireframe },
      },
      wireframe: settings.wireframe,
    });
  };

  // Update mesh when settings change
  useEffect(() => {
    if (!sceneRef.current || !enabled) return;

    // Remove existing mesh
    if (meshRef.current) {
      sceneRef.current.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      if (meshRef.current.material instanceof THREE.Material) {
        meshRef.current.material.dispose();
      }
    }

    // Create new geometry
    const geometry = createGeometry(settings.shape);

    // Create material
    let material: THREE.Material;
    
    if (settings.displacement.enabled && currentVideoElement && videoTextureRef.current) {
      // Use displacement shader material
      material = createDisplacementMaterial(videoTextureRef.current);
    } else if (currentVideoElement && videoTextureRef.current) {
      // Use standard video texture
      material = new THREE.MeshLambertMaterial({
        map: videoTextureRef.current,
        wireframe: settings.wireframe
      });
    } else {
      // Fallback material
      material = new THREE.MeshLambertMaterial({
        color: 0x00ff00,
        wireframe: settings.wireframe
      });
    }

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    
    // Apply transformations
    mesh.scale.set(settings.scale.x, settings.scale.y, settings.scale.z);
    mesh.position.set(settings.position.x, settings.position.y, settings.position.z);
    mesh.rotation.set(settings.rotation.x, settings.rotation.y, settings.rotation.z);

    sceneRef.current.add(mesh);
    meshRef.current = mesh;
  }, [settings, currentVideoElement, enabled]);

  // Update camera controls when settings change
  useEffect(() => {
    if (!controlsRef.current || !enabled) return;
    
    const controls = controlsRef.current;
    controls.enableDamping = settings.cameraControls.enableDamping;
    controls.dampingFactor = settings.cameraControls.dampingFactor;
    controls.enableZoom = settings.cameraControls.enableZoom;
    controls.enablePan = settings.cameraControls.enablePan;
    controls.enableRotate = settings.cameraControls.enableRotate;
    controls.minDistance = settings.cameraControls.minDistance;
    controls.maxDistance = settings.cameraControls.maxDistance;
  }, [settings.cameraControls, enabled]);

  // Setup video texture
  useEffect(() => {
    if (!currentVideoElement || !enabled) return;

    const videoTexture = new THREE.VideoTexture(currentVideoElement);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.format = THREE.RGBAFormat;
    videoTextureRef.current = videoTexture;

    // Update material if mesh exists
    if (meshRef.current && meshRef.current.material instanceof THREE.MeshLambertMaterial) {
      meshRef.current.material.map = videoTexture;
      meshRef.current.material.needsUpdate = true;
    }

    return () => {
      videoTexture.dispose();
    };
  }, [currentVideoElement, enabled]);

  // Animation loop
  useEffect(() => {
    if (!enabled || !sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    const animate = () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

      // Update orbit controls
      if (controlsRef.current) {
        controlsRef.current.update();
      }

      // Auto rotation
      if (settings.autoRotate && meshRef.current) {
        meshRef.current.rotation.x += settings.autoRotateSpeed * 0.01;
        meshRef.current.rotation.y += settings.autoRotateSpeed * 0.01;
      }

      // Update shader uniforms
      if (meshRef.current && meshRef.current.material instanceof THREE.ShaderMaterial) {
        const material = meshRef.current.material;
        material.uniforms.uTime.value = Date.now() * 0.001;
        material.uniforms.uDisplacementIntensity.value = settings.displacement.intensity;
        material.uniforms.uWireframe.value = settings.wireframe;
        
        // Audio reactive displacement
        if (settings.audioReactive && audioAnalysis) {
          let audioValue = 0;
          switch (settings.displacement.frequencyResponse) {
            case 'amplitude':
              audioValue = audioAnalysis.amplitude;
              break;
            case 'lowFreq':
              audioValue = audioAnalysis.lowFreq;
              break;
            case 'midFreq':
              audioValue = audioAnalysis.midFreq;
              break;
            case 'highFreq':
              audioValue = audioAnalysis.highFreq;
              break;
            case 'beat':
              audioValue = audioAnalysis.beat ? 1.0 : 0.0;
              break;
          }
          
          // Apply beat boost
          if (audioAnalysis.beat) {
            audioValue *= settings.displacement.beatBoost;
          }
          
          material.uniforms.uAudioReactivity.value = audioValue * settings.displacement.audioMultiplier;
        } else {
          material.uniforms.uAudioReactivity.value = 0;
        }
      }

      // Traditional audio reactive features for non-shader materials
      if (settings.audioReactive && audioAnalysis && meshRef.current && !(meshRef.current.material instanceof THREE.ShaderMaterial)) {
        // Scale based on amplitude
        const scaleMultiplier = 1 + (audioAnalysis.amplitude * 0.5);
        meshRef.current.scale.set(
          settings.scale.x * scaleMultiplier,
          settings.scale.y * scaleMultiplier,
          settings.scale.z * scaleMultiplier
        );

        // Rotation based on frequency
        meshRef.current.rotation.z += audioAnalysis.frequency * 0.001;

        // Color shift based on beat detection
        if (audioAnalysis.beat && meshRef.current.material instanceof THREE.MeshLambertMaterial) {
          const hue = (Date.now() * 0.001) % 1;
          const color = new THREE.Color().setHSL(hue, 0.5, 0.5);
          meshRef.current.material.color = color;
        }
      }

      rendererRef.current.render(sceneRef.current, cameraRef.current);
      animationIdRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [enabled, settings, audioAnalysis]);

  if (!enabled) {
    return (
      <Section name="3D Video Texture">
        <div className="threejs-info">
          <p>🎮 Enable 3D mode to see your rendered videos as textures on 3D objects!</p>
          <p>💡 Workflow: Upload videos → Create segments → Render video → Enable 3D mode → See magic!</p>
        </div>
        <button 
          onClick={() => onSettingsChange({ ...settings, enabled: true })}
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: '#007acc', 
            color: 'white', 
            border: 'none', 
            borderRadius: '0.5rem',
            fontSize: '1rem',
            cursor: 'pointer'
          }}
        >
          🚀 Enable 3D Mode
        </button>
      </Section>
    );
  }

  return (
    <Section name="3D Video Texture">
      <div className="threejs-controls">
        <div className="control-group static">
          <button 
            onClick={() => onSettingsChange({ ...settings, enabled: false })}
            style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '0.25rem' }}
          >
            Disable 3D Mode
          </button>
        </div>
        
        <CollapsibleSection title="🎮 Basic Controls" sectionKey="basic">
          <label>
            Shape:
            <select
              value={settings.shape}
              onChange={(e) => onSettingsChange({
                ...settings,
                shape: e.target.value as ThreeJSShape
              })}
            >
              <option value="cube">Cube</option>
              <option value="sphere">Sphere</option>
              <option value="plane">Plane</option>
              <option value="cylinder">Cylinder</option>
              <option value="torus">Torus</option>
              <option value="cone">Cone</option>
            </select>
          </label>

          <label>
            <input
              type="checkbox"
              checked={settings.wireframe}
              onChange={(e) => onSettingsChange({
                ...settings,
                wireframe: e.target.checked
              })}
            />
            Wireframe
          </label>

          <label>
            <input
              type="checkbox"
              checked={settings.autoRotate}
              onChange={(e) => onSettingsChange({
                ...settings,
                autoRotate: e.target.checked
              })}
            />
            Auto Rotate
          </label>

          {settings.autoRotate && (
            <label>
              Rotation Speed:
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={settings.autoRotateSpeed}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  autoRotateSpeed: parseFloat(e.target.value)
                })}
              />
              <span>{settings.autoRotateSpeed.toFixed(1)}</span>
            </label>
          )}

          <label>
            <input
              type="checkbox"
              checked={settings.audioReactive}
              onChange={(e) => onSettingsChange({
                ...settings,
                audioReactive: e.target.checked
              })}
            />
            Audio Reactive
          </label>
        </CollapsibleSection>

        <CollapsibleSection title="🌊 3D Displacement" sectionKey="displacement">
          <label>
            <input
              type="checkbox"
              checked={settings.displacement.enabled}
              onChange={(e) => onSettingsChange({
                ...settings,
                displacement: { ...settings.displacement, enabled: e.target.checked }
              })}
            />
            Enable 3D Displacement
          </label>

          {settings.displacement.enabled && (
            <>
              <label>
                Base Intensity:
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settings.displacement.intensity}
                  onChange={(e) => onSettingsChange({
                    ...settings,
                    displacement: { ...settings.displacement, intensity: parseFloat(e.target.value) }
                  })}
                />
                <span>{settings.displacement.intensity.toFixed(1)}</span>
              </label>

              <label>
                Audio Multiplier:
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={settings.displacement.audioMultiplier}
                  onChange={(e) => onSettingsChange({
                    ...settings,
                    displacement: { ...settings.displacement, audioMultiplier: parseFloat(e.target.value) }
                  })}
                />
                <span>{settings.displacement.audioMultiplier.toFixed(1)}</span>
              </label>

              <label>
                Frequency Response:
                <select
                  value={settings.displacement.frequencyResponse}
                  onChange={(e) => onSettingsChange({
                    ...settings,
                    displacement: { ...settings.displacement, frequencyResponse: e.target.value as any }
                  })}
                >
                  <option value="amplitude">Overall Amplitude</option>
                  <option value="lowFreq">Low Frequencies (Bass)</option>
                  <option value="midFreq">Mid Frequencies</option>
                  <option value="highFreq">High Frequencies (Treble)</option>
                  <option value="beat">Beat Detection</option>
                </select>
              </label>

              <label>
                Beat Boost:
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.1"
                  value={settings.displacement.beatBoost}
                  onChange={(e) => onSettingsChange({
                    ...settings,
                    displacement: { ...settings.displacement, beatBoost: parseFloat(e.target.value) }
                  })}
                />
                <span>{settings.displacement.beatBoost.toFixed(1)}x</span>
              </label>

              <div className="displacement-info">
                <p>🎨 <strong>How it works:</strong></p>
                <ul>
                  <li>Bright pixels in video = outward displacement</li>
                  <li>Dark pixels = inward displacement</li>
                  <li>Audio analysis modulates displacement intensity in real-time</li>
                  <li>Beat detection creates dramatic displacement spikes</li>
                </ul>
              </div>
            </>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="🖱️ Mouse Camera Controls" sectionKey="camera">
          
          <label>
            <input
              type="checkbox"
              checked={settings.cameraControls.enableRotate}
              onChange={(e) => onSettingsChange({
                ...settings,
                cameraControls: { ...settings.cameraControls, enableRotate: e.target.checked }
              })}
            />
            Enable Rotation (Left Click + Drag)
          </label>

          <label>
            <input
              type="checkbox"
              checked={settings.cameraControls.enableZoom}
              onChange={(e) => onSettingsChange({
                ...settings,
                cameraControls: { ...settings.cameraControls, enableZoom: e.target.checked }
              })}
            />
            Enable Zoom (Mouse Wheel)
          </label>

          <label>
            <input
              type="checkbox"
              checked={settings.cameraControls.enablePan}
              onChange={(e) => onSettingsChange({
                ...settings,
                cameraControls: { ...settings.cameraControls, enablePan: e.target.checked }
              })}
            />
            Enable Pan (Right Click + Drag)
          </label>

          <label>
            <input
              type="checkbox"
              checked={settings.cameraControls.enableDamping}
              onChange={(e) => onSettingsChange({
                ...settings,
                cameraControls: { ...settings.cameraControls, enableDamping: e.target.checked }
              })}
            />
            Smooth Camera Movement
          </label>

          {settings.cameraControls.enableDamping && (
            <label>
              Smoothness:
              <input
                type="range"
                min="0.01"
                max="0.2"
                step="0.01"
                value={settings.cameraControls.dampingFactor}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  cameraControls: { ...settings.cameraControls, dampingFactor: parseFloat(e.target.value) }
                })}
              />
              <span>{settings.cameraControls.dampingFactor.toFixed(2)}</span>
            </label>
          )}

          <div className="transform-controls">
            <div>
              <label>Min Zoom:</label>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={settings.cameraControls.minDistance}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  cameraControls: { ...settings.cameraControls, minDistance: parseFloat(e.target.value) }
                })}
              />
              <span>{settings.cameraControls.minDistance.toFixed(1)}</span>
            </div>

            <div>
              <label>Max Zoom:</label>
              <input
                type="range"
                min="5"
                max="50"
                step="1"
                value={settings.cameraControls.maxDistance}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  cameraControls: { ...settings.cameraControls, maxDistance: parseFloat(e.target.value) }
                })}
              />
              <span>{settings.cameraControls.maxDistance.toFixed(1)}</span>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="🔧 Transform Controls" sectionKey="transform">
          
          <div className="transform-controls">
            <div>
              <label>Scale X:</label>
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={settings.scale.x}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  scale: { ...settings.scale, x: parseFloat(e.target.value) }
                })}
              />
              <span>{settings.scale.x.toFixed(1)}</span>
            </div>

            <div>
              <label>Scale Y:</label>
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={settings.scale.y}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  scale: { ...settings.scale, y: parseFloat(e.target.value) }
                })}
              />
              <span>{settings.scale.y.toFixed(1)}</span>
            </div>

            <div>
              <label>Scale Z:</label>
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={settings.scale.z}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  scale: { ...settings.scale, z: parseFloat(e.target.value) }
                })}
              />
              <span>{settings.scale.z.toFixed(1)}</span>
            </div>

            <div>
              <label>Rotation X:</label>
              <input
                type="range"
                min="-3.14"
                max="3.14"
                step="0.1"
                value={settings.rotation.x}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  rotation: { ...settings.rotation, x: parseFloat(e.target.value) }
                })}
              />
              <span>{settings.rotation.x.toFixed(1)}</span>
            </div>

            <div>
              <label>Rotation Y:</label>
              <input
                type="range"
                min="-3.14"
                max="3.14"
                step="0.1"
                value={settings.rotation.y}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  rotation: { ...settings.rotation, y: parseFloat(e.target.value) }
                })}
              />
              <span>{settings.rotation.y.toFixed(1)}</span>
            </div>

            <div>
              <label>Rotation Z:</label>
              <input
                type="range"
                min="-3.14"
                max="3.14"
                step="0.1"
                value={settings.rotation.z}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  rotation: { ...settings.rotation, z: parseFloat(e.target.value) }
                })}
              />
              <span>{settings.rotation.z.toFixed(1)}</span>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      <div 
        ref={mountRef} 
        className="threejs-viewport"
        style={{
          width: '100%',
          height: '400px',
          border: '1px solid #333',
          marginTop: '1rem'
        }}
      />

      <div className="threejs-info">
        {currentVideoElement ? (
          <p>
            ✅ Video texture active on 3D {settings.shape}
            {settings.displacement.enabled && " with 3D displacement"}
          </p>
        ) : (
          <p>
            ⏳ Waiting for rendered video - render a video to see it as a 3D texture
          </p>
        )}
        
        <p>
          🖱️ <strong>Mouse Controls:</strong> 
          {settings.cameraControls.enableRotate && " Left-click+drag to orbit"} 
          {settings.cameraControls.enableZoom && " | Mouse wheel to zoom"}
          {settings.cameraControls.enablePan && " | Right-click+drag to pan"}
        </p>
        
        {settings.displacement.enabled && (
          <p>
            🌊 3D Displacement: {settings.displacement.frequencyResponse} response 
            {settings.audioReactive && " (audio reactive)"}
          </p>
        )}
        
        {settings.audioReactive && !settings.displacement.enabled && (
          <p>
            🎵 Audio reactive mode enabled - shape responds to audio analysis
          </p>
        )}
        
        {currentVideoElement && !currentVideoElement.paused && (
          <p>
            ▶️ Video is playing - texture updating in real-time
          </p>
        )}
      </div>
    </Section>
  );
}; 