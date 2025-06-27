import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
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
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [enabled]);

  // Create geometry based on settings
  const createGeometry = (shape: ThreeJSShape): THREE.BufferGeometry => {
    switch (shape) {
      case 'cube':
        return new THREE.BoxGeometry(2, 2, 2);
      case 'sphere':
        return new THREE.SphereGeometry(1.5, 32, 32);
      case 'plane':
        return new THREE.PlaneGeometry(3, 2);
      case 'cylinder':
        return new THREE.CylinderGeometry(1, 1, 2, 32);
      case 'torus':
        return new THREE.TorusGeometry(1, 0.4, 16, 100);
      case 'cone':
        return new THREE.ConeGeometry(1, 2, 32);
      default:
        return new THREE.BoxGeometry(2, 2, 2);
    }
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
    
    if (currentVideoElement && videoTextureRef.current) {
      // Use video texture
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

      // Auto rotation
      if (settings.autoRotate && meshRef.current) {
        meshRef.current.rotation.x += settings.autoRotateSpeed * 0.01;
        meshRef.current.rotation.y += settings.autoRotateSpeed * 0.01;
      }

      // Audio reactive features
      if (settings.audioReactive && audioAnalysis && meshRef.current) {
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
        <p>Enable 3D mode to see video textures applied to 3D objects</p>
        <button onClick={() => onSettingsChange({ ...settings, enabled: true })}>
          Enable 3D Mode
        </button>
      </Section>
    );
  }

  return (
    <Section name="3D Video Texture">
      <div className="threejs-controls">
        <div className="control-group">
          <button 
            onClick={() => onSettingsChange({ ...settings, enabled: false })}
            style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '0.25rem' }}
          >
            Disable 3D Mode
          </button>
        </div>
        
        <div className="control-group">
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
        </div>

        <div className="control-group">
          <h4>Transform</h4>
          
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
        </div>
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
        <p>
          🎥 Video texture will be applied to the 3D {settings.shape}
        </p>
        {settings.audioReactive && (
          <p>
            🎵 Audio reactive mode enabled - shape responds to audio analysis
          </p>
        )}
      </div>
    </Section>
  );
}; 