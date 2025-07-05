import React, { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import { Section } from "./components/Section";
import { NumberInput } from "./NumberInput";
import { RangePreview } from "./RangePreview";
import { SelectInput } from "./SelectInput";
import { Segment, Vid, SegmentPreset, AudioSegment } from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// Fisher-Yates shuffle algorithm for array randomization
const shuffleVideos = (array: Vid[]): Vid[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Fisher-Yates shuffle algorithm for segments
const shuffleSegments = (array: Segment[]): Segment[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Weighted repeat count generator - heavily favors 1, with larger numbers becoming increasingly rare
const generateWeightedRepeat = (baseRepeat: number = 1): number => {
  // Special handling for micro-stutter style which should have higher base repeats
  const isMicroStutter = baseRepeat > 10;
  
  if (isMicroStutter) {
    // For micro-stutter, still weight toward lower end but within 20-50 range
    const random = Math.random();
    if (random < 0.6) return Math.floor(20 + Math.random() * 11); // 20-30 (60% chance)
    if (random < 0.85) return Math.floor(31 + Math.random() * 10); // 31-40 (25% chance)
    return Math.floor(41 + Math.random() * 10); // 41-50 (15% chance)
  }
  
  // For normal segments, EXTREMELY heavily weight toward 1
  const random = Math.random();
  
  // 80% chance for repeat = 1 (massively increased)
  if (random < 0.8) return 1;
  
  // 12% chance for repeat = 2
  if (random < 0.92) return 2;
  
  // 5% chance for repeat = 3-4
  if (random < 0.97) return Math.floor(3 + Math.random() * 2); // 3-4
  
  // 2% chance for repeat = 5-7
  if (random < 0.99) return Math.floor(5 + Math.random() * 3); // 5-7
  
  // 1% chance for higher repeats (8-12, capped low)
  return Math.floor(8 + Math.random() * 5); // 8-12
};

// Probabilistic preset application across all videos
const applyPresetWithProbabilities = (preset: SegmentPreset, vids: Vid[]): Segment[] => {
  const segments: Segment[] = [];
  
  // Shuffle video order for unpredictable application patterns
  const shuffledVids = shuffleVideos(vids);
  
  // Style-based probability weights for different preset characteristics
  const styleWeights = {
    quick: { shortSegments: 0.7, longSegments: 0.3, highRepeat: 0.2, lowRepeat: 0.8 },
    echo: { shortSegments: 0.4, longSegments: 0.6, highRepeat: 0.8, lowRepeat: 0.2 },
    stutter: { shortSegments: 0.9, longSegments: 0.1, highRepeat: 0.9, lowRepeat: 0.1 },
    superchop: { shortSegments: 0.6, longSegments: 0.4, highRepeat: 0.95, lowRepeat: 0.05 },
    microstutter: { shortSegments: 0.95, longSegments: 0.05, highRepeat: 0.98, lowRepeat: 0.02 }
  };
  
  // Determine style based on preset name
  let style = 'quick';
  if (preset.name.toLowerCase().includes('echo') || preset.name.toLowerCase().includes('loop')) {
    style = 'echo';
  } else if (preset.name.toLowerCase().includes('micro') && preset.name.toLowerCase().includes('stutter')) {
    style = 'microstutter';
  } else if (preset.name.toLowerCase().includes('stutter') || preset.name.toLowerCase().includes('glitch')) {
    style = 'stutter';
  } else if (preset.name.toLowerCase().includes('superchop') || preset.name.toLowerCase().includes('chop')) {
    style = 'superchop';
  }
  
  const weights = styleWeights[style as keyof typeof styleWeights];
  
  // Distribute preset segments across all shuffled videos
  shuffledVids.forEach((vid, vidIndex) => {
    const maxFrames = vid.chunks.length;
    
    // Calculate video-specific adaptations
    const videoDuration = maxFrames / 30; // Assuming 30 FPS
    const isShortVideo = videoDuration < 3;
    const isLongVideo = videoDuration > 10;
    
    preset.segments.forEach((presetSegment) => {
      // Probabilistic decisions based on style and video characteristics
      const shouldInclude = Math.random() < (0.6 + vidIndex * 0.15); // Higher probability for later videos
      
      if (shouldInclude) {
        // Adaptive scaling based on video length
        let scaleFactor = maxFrames / 100; // Base scale
        if (isShortVideo) scaleFactor *= 0.7;
        if (isLongVideo) scaleFactor *= 1.2;
        
        // Style-influenced segment sizing
        const isShortSegmentStyle = Math.random() < weights.shortSegments;
        const segmentSizeFactor = isShortSegmentStyle ? 0.5 : 1.5;
        
        // Calculate adapted segment bounds
        const adaptedFrom = Math.floor(clamp(
          presetSegment.from * scaleFactor * segmentSizeFactor,
          0,
          maxFrames - 5
        ));
        
        const adaptedTo = Math.floor(clamp(
          presetSegment.to * scaleFactor * segmentSizeFactor,
          adaptedFrom + 3,
          maxFrames
        ));
        
        // Weighted repeat calculation - heavily favors 1 with sliding scale
        let adaptedRepeat = generateWeightedRepeat(presetSegment.repeat);
        
        // Add stylistic variation based on video position
        if (vidIndex > 0) {
          // Later videos get slight variation but still respect weighted distribution
          if (Math.random() < 0.3) { // Only 30% chance to modify
            adaptedRepeat = generateWeightedRepeat(adaptedRepeat); // Slightly higher cap for later videos
          }
          
          // Chance for frame offset shifts
          if (Math.random() < 0.4) {
            const offset = Math.floor(Math.random() * 10 - 5);
            const shiftedFrom = clamp(adaptedFrom + offset, 0, maxFrames - 5);
            const shiftedTo = clamp(adaptedTo + offset, shiftedFrom + 3, maxFrames);
            
            segments.push({
              name: vid.name,
              from: shiftedFrom,
              to: shiftedTo,
              repeat: adaptedRepeat
            });
          } else {
            segments.push({
              name: vid.name,
              from: adaptedFrom,
              to: adaptedTo,
              repeat: adaptedRepeat
            });
          }
        } else {
          // First video gets cleaner, more predictable treatment
          segments.push({
            name: vid.name,
            from: adaptedFrom,
            to: adaptedTo,
            repeat: adaptedRepeat // Use weighted repeat as-is for first video
          });
        }
        
        // Probabilistic additional segments for complex styles
        if (style === 'echo' && Math.random() < 0.3) {
          // Add echo segments with offset timing
          const echoOffset = Math.floor(5 + Math.random() * 10);
          const echoFrom = clamp(adaptedFrom + echoOffset, 0, maxFrames - 5);
          const echoTo = clamp(adaptedTo + echoOffset, echoFrom + 3, maxFrames);
          
          segments.push({
            name: vid.name,
            from: echoFrom,
            to: echoTo,
            repeat: generateWeightedRepeat(1) // Use weighted repeat for echo segments
          });
        }
        
        if (style === 'stutter' && Math.random() < 0.6) {
          // Add stutter segments with high repeat counts
          const stutterCount = Math.floor(2 + Math.random() * 3); // 2-4 stutter segments
          
          for (let s = 0; s < stutterCount; s++) {
            const stutterLength = Math.floor(2 + Math.random() * 4); // 2-5 frame stutters
            const stutterStart = Math.floor(Math.random() * (maxFrames - stutterLength - 10));
            const stutterEnd = stutterStart + stutterLength;
            
            segments.push({
              name: vid.name,
              from: stutterStart,
              to: stutterEnd,
              repeat: generateWeightedRepeat(5) // Weighted repeat for stutter, slightly higher range
            });
          }
        }
        
        if (style === 'superchop' && Math.random() < 0.7) {
          // Add superchop micro segments
          const chopCount = Math.floor(3 + Math.random() * 4); // 3-6 chop segments
          
          for (let c = 0; c < chopCount; c++) {
            const chopLength = Math.floor(1 + Math.random() * 3); // 1-3 frame chops
            const chopStart = Math.floor(Math.random() * (maxFrames - chopLength - 10));
            const chopEnd = chopStart + chopLength;
            
            segments.push({
              name: vid.name,
              from: chopStart,
              to: chopEnd,
              repeat: generateWeightedRepeat(2) // Weighted repeat for superchop micro segments
            });
          }
        }
        
        if (style === 'microstutter' && Math.random() < 0.8) {
          // Add mix of micro segments and longer expressive sections
          const numSegments = Math.floor(2 + Math.random() * 4); // 2-5 additional segments
          
          for (let m = 0; m < numSegments; m++) {
            const shouldBeLongSegment = Math.random() < 0.3; // 30% chance for longer segment
            
            if (shouldBeLongSegment) {
              // Create longer expressive segment (15-40 frames, single play)
              const longLength = Math.floor(15 + Math.random() * 26); // 15-40 frames
              const randomPosition = Math.floor(Math.random() * (maxFrames - longLength - 10));
              const longStart = Math.max(0, randomPosition);
              const longEnd = Math.min(longStart + longLength, maxFrames);
              
              segments.push({
                name: vid.name,
                from: longStart,
                to: longEnd,
                repeat: 1 // Always single play for longer segments
              });
            } else {
              // Create micro-stutter segment (2-3 frames, high repeats)
              const microLength = Math.floor(2 + Math.random() * 2); // 2-3 frames only
              const randomPosition = Math.floor(Math.random() * (maxFrames - microLength - 10));
              const microStart = Math.max(0, randomPosition);
              const microEnd = microStart + microLength;
              
              // Use weighted repeat for micro-stutter (will handle 20-50 range internally)
              const microRepeat = generateWeightedRepeat(25); // Base of 25 triggers micro-stutter logic
              
              segments.push({
                name: vid.name,
                from: microStart,
                to: microEnd,
                repeat: microRepeat
              });
            }
          }
        }
      }
    });
  });
  
  // Shuffle the final segments to interleave videos randomly
  const shuffledSegments = shuffleSegments(segments);
  
  // Limit total duration to under 60 seconds (1800 frames at 30 FPS)
  const maxTotalFrames = 1800;
  let currentFrameCount = 0;
  const limitedSegments: Segment[] = [];
  
  for (const segment of shuffledSegments) {
    const segmentFrames = (segment.to - segment.from) * segment.repeat;
    
    if (currentFrameCount + segmentFrames <= maxTotalFrames) {
      limitedSegments.push(segment);
      currentFrameCount += segmentFrames;
    } else {
      // If adding this segment would exceed the limit, reduce its repeat count
      const remainingFrames = maxTotalFrames - currentFrameCount;
      const segmentLength = segment.to - segment.from;
      const maxRepeats = Math.floor(remainingFrames / segmentLength);
      
      if (maxRepeats > 0) {
        limitedSegments.push({
          ...segment,
          repeat: maxRepeats
        });
      }
      break; // Stop adding more segments
    }
  }
  
  // Ensure first segment starts from 0 if any segments exist
  if (limitedSegments.length > 0) {
    limitedSegments[0].from = 0;
  }
  
  return limitedSegments;
};

// Function to save preset to code (generates code that can be copied into the presets array)
const savePresetToCode = (preset: SegmentPreset) => {
  const presetCode = `    {
      name: "${preset.name}",
      segments: [
${preset.segments.map(s => `        { from: ${s.from}, to: ${s.to}, repeat: ${s.repeat} }`).join(',\n')}
      ]
    }`;
  
  const fullCode = `// Add this preset to the presets array in Timeline.tsx:
${presetCode}`;
  
  // Copy to clipboard if available
  if (navigator.clipboard) {
    navigator.clipboard.writeText(presetCode).then(() => {
      console.log('✅ Preset code copied to clipboard!');
      console.log('📋 Full preset object:');
      console.log(presetCode);
      
      // Also log the complete preset for easy copying
      console.log('📋 Copy this entire object and add it to the presets array:');
      console.log(`{
  name: "${preset.name}",
  segments: [
${preset.segments.map(s => `    { from: ${s.from}, to: ${s.to}, repeat: ${s.repeat} }`).join(',\n')}
  ]
}`);
      
      console.log('🎯 Instructions:');
      console.log('1. Open src/Timeline.tsx in your code editor');
      console.log('2. Find the line that says "// 💾 ADD NEW SAVED PRESETS HERE" (around line 316)');
      console.log('3. Add a comma after the last preset');
      console.log('4. Paste the preset object above');
      console.log('5. Save the file - your preset will be permanent!');
      
      alert(`✅ Preset "${preset.name}" saved!\n\n1. Code copied to clipboard\n2. Check browser console for detailed instructions\n3. Add it to src/Timeline.tsx after the comment "💾 ADD NEW SAVED PRESETS HERE"\n\nThe preset will be available permanently after adding it to the code.`);
    }).catch(() => {
      showPresetCode(fullCode);
    });
  } else {
    showPresetCode(fullCode);
  }
};

// Fallback to show code in console and alert
const showPresetCode = (code: string) => {
  console.log('📋 Preset code (copy this):');
  console.log(code);
  alert(`📋 Preset code generated! Check the browser console to copy it.\n\nThen paste it into the presets array in src/Timeline.tsx`);
};

export const Timeline = ({
  segments,
  setSegments,
  vids,
  availableSamples = [],
}: {
  segments: Segment[];
  setSegments: Dispatch<SetStateAction<Segment[]>>;
  vids: Vid[];
  availableSamples?: { name: string; url: string; file?: File }[];
}) => {
  const [preview, setPreview] = useState<null | { vid: Vid; i: number }>(null);
  const [presets, setPresets] = useState<SegmentPreset[]>([
    // 💾 ADD NEW SAVED PRESETS HERE (generated by "Save Preset to Code" button)
    {
      name: "longbasic",
      segments: [
        { from: 0, to: 33, repeat: 1 },
        { from: 30, to: 36, repeat: 12 },
        { from: 35, to: 70, repeat: 1 },
        { from: 65, to: 74, repeat: 30 },
        { from: 72, to: 90, repeat: 1 },
        { from: 89, to: 100, repeat: 1 },
        { from: 98, to: 104, repeat: 23 },
        { from: 103, to: 120, repeat: 1 },
        { from: 120, to: 126, repeat: 7 }
      ]
    }, 
    {
      name: "7segmentOddTimings",
      segments: [
        { from: 0, to: 30, repeat: 1 },
        { from: 29, to: 35, repeat: 30 },
        { from: 34, to: 39, repeat: 1 },
        { from: 37, to: 44, repeat: 15 },
        { from: 40, to: 47, repeat: 1 },
        { from: 46, to: 60, repeat: 5 },
        { from: 58, to: 63, repeat: 30 }
      ]
    },
    {
      name: "basic",
      segments: [
        { from: 0, to: 72, repeat: 1 },
        { from: 70, to: 77, repeat: 27 },
        { from: 75, to: 85, repeat: 1 },
        { from: 85, to: 89, repeat: 20 }
      ]
    },
    {
      name: "Quick Glitch",
      segments: [
        { from: 0, to: 30, repeat: 1 },
        { from: 10, to: 25, repeat: 3 },
        { from: 30, to: 60, repeat: 1 }
      ]
    },
    {
      name: "Echo Loop",
      segments: [
        { from: 0, to: 20, repeat: 1 },
        { from: 15, to: 35, repeat: 5 },
        { from: 20, to: 40, repeat: 2 }
      ]
    },
    {
      name: "Stutter Effect",
      segments: [
        { from: 0, to: 10, repeat: 1 },
        { from: 5, to: 15, repeat: 8 },
        { from: 10, to: 30, repeat: 1 }
      ]
    },
    {
      name: "Superchop",
      segments: [
        { from: 0, to: 3, repeat: 4 },     // Micro-cut intro
        { from: 8, to: 25, repeat: 1 },    // Elaborate section
        { from: 2, to: 5, repeat: 6 },     // Rapid fire micro
        { from: 15, to: 35, repeat: 1 },   // Extended elaborate
        { from: 10, to: 12, repeat: 8 },   // Ultra-micro chop
        { from: 30, to: 50, repeat: 2 }    // Final expressive
      ]
    },
    {
      name: "Micro Stutter",
      segments: [
        { from: 0, to: 2, repeat: 35 },    // 2-frame micro at start
        { from: 10, to: 13, repeat: 25 },  // 3-frame micro in middle
        { from: 20, to: 22, repeat: 40 },  // 2-frame intense stutter
        { from: 25, to: 45, repeat: 1 },   // Longer expressive section (single play)
        { from: 50, to: 53, repeat: 45 },  // 3-frame heavy repeat
        { from: 60, to: 85, repeat: 1 },   // Another longer section (single play)
        { from: 90, to: 92, repeat: 30 },  // 2-frame stutter
        { from: 100, to: 120, repeat: 1 }, // Final longer section (single play)
        { from: 125, to: 127, repeat: 25 } // Final micro stutter
      ]
    },
    {
      name: "Blends",
      segments: [
        { from: 0, to: 39, repeat: 1 },
        { from: 38, to: 44, repeat: 39 },
        { from: 4, to: 50, repeat: 1 },
        { from: 48, to: 55, repeat: 40 },
        { from: 53, to: 57, repeat: 25 },
        { from: 90, to: 120, repeat: 1 },
        { from: 118, to: 122, repeat: 54 }
      ]
    }
  ]);
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [customPresetName, setCustomPresetName] = useState<string>("");
  const [showPresetInput, setShowPresetInput] = useState<boolean>(false);
  return (
    <Section name="Timeline">
      {vids.length === 0 ? (
        <p>Please upload a video</p>
      ) : (
        <>
          {/* Presets Section */}
          <div className="presets-section">
            <h3>Segment Presets</h3>
            <div className="preset-controls">
              <select 
                value={selectedPreset} 
                onChange={(e) => setSelectedPreset(e.target.value)}
              >
                <option value="">Select a preset...</option>
                {presets.map((preset, i) => (
                  <option key={i} value={preset.name}>{preset.name}</option>
                ))}
              </select>
              <button 
                onClick={() => {
                  const preset = presets.find(p => p.name === selectedPreset);
                  if (preset && vids.length > 0) {
                    const newSegments = applyPresetWithProbabilities(preset, vids);
                    setSegments(newSegments);
                  }
                }}
                disabled={!selectedPreset}
              >
                Apply Preset
              </button>
              <button onClick={() => setShowPresetInput(!showPresetInput)}>
                {showPresetInput ? "Cancel" : "💾 Save Current as Preset"}
              </button>
              
              {segments.length > 0 && (
                <div className="preset-info">
                  <span className="preset-count">
                    📊 Current: {segments.length} segment{segments.length !== 1 ? 's' : ''}
                  </span>
                  <button 
                    onClick={() => {
                      console.log('📍 Current preset location in code:');
                      console.log('File: src/Timeline.tsx');
                      console.log('Line: ~316 (look for "// 💾 ADD NEW SAVED PRESETS HERE")');
                      console.log('Add new presets after this comment in the presets array');
                      alert('📍 Location info logged to console!\n\nLook for the comment "💾 ADD NEW SAVED PRESETS HERE" in src/Timeline.tsx around line 316');
                    }}
                    className="preset-location-btn"
                    title="Show where to add presets in code"
                  >
                    📍 Show Code Location
                  </button>
                </div>
              )}
            </div>
            
            {showPresetInput && (
              <div className="preset-input">
                <input
                  type="text"
                  placeholder="Preset name..."
                  value={customPresetName}
                  onChange={(e) => setCustomPresetName(e.target.value)}
                />
                <button 
                  onClick={() => {
                    if (customPresetName.trim() && segments.length > 0) {
                      const newPreset: SegmentPreset = {
                        name: customPresetName.trim(),
                        segments: segments.map(s => ({
                          from: s.from,
                          to: s.to,
                          repeat: s.repeat
                        }))
                      };
                      
                      // Add to current session
                      setPresets([...presets, newPreset]);
                      setCustomPresetName("");
                      setShowPresetInput(false);
                      
                      // Generate code for permanent saving
                      savePresetToCode(newPreset);
                    }
                  }}
                  disabled={!customPresetName.trim() || segments.length === 0}
                >
                  💾 Save Preset to Code
                </button>
                
                <div className="preset-save-help">
                  <small>
                    💡 This will copy preset code to your clipboard and console. 
                    Add it to the presets array in <code>src/Timeline.tsx</code> to make it permanent!
                  </small>
                </div>
              </div>
            )}
            
            {/* Preset Preview Table */}
            {selectedPreset && (
              <div className="preset-preview">
                <h4>Preview: {selectedPreset}</h4>
                <p className="preset-description">
                  This preset will be applied probabilistically across <strong>{vids.length} video{vids.length !== 1 ? 's' : ''}</strong> with stylistic variations based on:
                </p>
                <ul className="preset-features">
                  <li>📊 <strong>Video-specific scaling</strong> - Segments adapt to each video's length</li>
                  <li>🎲 <strong>Probabilistic distribution</strong> - Later videos get more experimental effects</li>
                  <li>🔀 <strong>Video order shuffling</strong> - Video processing order randomized each time</li>
                  <li>🌀 <strong>Segment interleaving</strong> - Final segments shuffled to mix videos randomly</li>
                  <li>🎨 <strong>Style-based weighting</strong> - Segment characteristics match preset style</li>
                  <li>⚡ <strong>Dynamic variations</strong> - Each application creates unique combinations</li>
                </ul>
                
                <table className="preset-table">
                  <thead>
                    <tr>
                      <th>Base Start</th>
                      <th>Base End</th>
                      <th>Base Loops</th>
                      <th>Style Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {presets.find(p => p.name === selectedPreset)?.segments.map((segment, i) => {
                      let styleNote = "Standard timing";
                      const presetName = selectedPreset.toLowerCase();
                      if (presetName.includes('echo') || presetName.includes('loop')) {
                        styleNote = "Long segments, high repeats, echo effects";
                      } else if (presetName.includes('micro') && presetName.includes('stutter')) {
                        styleNote = "Mix of 2-3 frame micro-stutters (20-50 repeats) + longer expressive sections (single play)";
                      } else if (presetName.includes('stutter') || presetName.includes('glitch')) {
                        styleNote = "Short segments, micro-stutters, high repeats";
                      } else if (presetName.includes('superchop') || presetName.includes('chop')) {
                        styleNote = "Rapid micro-cuts + elaborate expressive sections";
                      } else {
                        styleNote = "Balanced segments, moderate repeats";
                      }
                      
                      return (
                        <tr key={i}>
                          <td>{segment.from}</td>
                          <td>{segment.to}</td>
                          <td>{segment.repeat}</td>
                          <td className="style-note">{styleNote}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                
                <p className="preset-note">
                  <em>Note: Each "Apply Preset" will create different results due to probabilistic generation!</em>
                </p>
              </div>
            )}
          </div>
          {segments.length === 0 ? (
            <p>No segments defined</p>
          ) : (
            <div className="segments">
              <div className="segment-header">
                <span>Video</span>
                <span>From</span>
                <span>To</span>
                <span>Repeat</span>
                <span>Audio</span>
                <span>Actions</span>
              </div>
              {segments.map((s, i) => {
                const getVid = () => vids.find((vid) => vid.name === s.name)!;
                const swap = (j: number, k: number) => {
                  [segments[j], segments[k]] = [segments[k], segments[j]];
                  segments[0].from = 0;
                  setSegments([...segments]);
                };

                const updateAudio = (audio: AudioSegment | undefined) => {
                  s.audio = audio;
                  setSegments([...segments]);
                };

                return (
                  <React.Fragment key={i}>
                    <SelectInput
                      value={s.name}
                      onChange={(name) => {
                        s.name = name;
                        s.to = clamp(s.to, -Infinity, getVid().chunks.length);
                        s.from = clamp(s.from, 0, s.to - 1);
                        setSegments([...segments]);
                      }}
                      options={vids.map((vid) => vid.name)}
                    />
                    <NumberInput
                      value={s.from}
                      onChange={(from) => {
                        s.from = from;
                        setSegments([...segments]);
                        setPreview({ vid: getVid(), i: from });
                      }}
                      min={0}
                      max={s.to - 1}
                      disabled={i === 0}
                      onFocus={() => setPreview({ vid: getVid(), i: s.from })}
                      onBlur={() => setPreview(null)}
                    />
                    <NumberInput
                      value={s.to}
                      onChange={(to) => {
                        s.to = to;
                        setSegments([...segments]);
                        setPreview({ vid: getVid(), i: to });
                      }}
                      min={s.from + 1}
                      max={getVid().chunks.length}
                      onFocus={() => setPreview({ vid: getVid(), i: s.to })}
                      onBlur={() => setPreview(null)}
                    />
                    <NumberInput
                      value={s.repeat}
                      onChange={(repeat) => {
                        s.repeat = repeat;
                        setSegments([...segments]);
                      }}
                      min={1}
                    />
                    <div className="audio-controls">
                      <select
                        value={s.audio?.type || 'none'}
                        onChange={(e) => {
                          const type = e.target.value;
                          if (type === 'none') {
                            updateAudio(undefined);
                          } else {
                            updateAudio({
                              type: type as 'noise' | 'sine' | 'sample',
                              frequency: type === 'sine' ? 440 : undefined,
                              noiseType: type === 'noise' ? 'white' : undefined,
                              volume: 0.5,
                            });
                          }
                        }}
                      >
                        <option value="none">No Audio</option>
                        <option value="noise">Noise</option>
                        <option value="sine">Sine Wave</option>
                        <option value="sample">Sample</option>
                      </select>
                      
                      {s.audio?.type === 'sine' && (
                        <input
                          type="number"
                          placeholder="Hz"
                          value={s.audio.frequency || 440}
                          onChange={(e) => {
                            updateAudio({
                              ...s.audio,
                              type: 'sine',
                              frequency: parseInt(e.target.value) || 440,
                            });
                          }}
                          min="20"
                          max="20000"
                          style={{ width: '60px', marginLeft: '4px' }}
                        />
                      )}
                      
                      {s.audio?.type === 'noise' && (
                        <select
                          value={s.audio.noiseType || 'white'}
                          onChange={(e) => {
                            updateAudio({
                              ...s.audio,
                              type: 'noise',
                              noiseType: e.target.value as 'white' | 'pink' | 'brown',
                            });
                          }}
                          style={{ marginLeft: '4px' }}
                        >
                          <option value="white">White</option>
                          <option value="pink">Pink</option>
                          <option value="brown">Brown</option>
                        </select>
                      )}
                      
                      {s.audio?.type === 'sample' && (
                        <select
                          value={s.audio.sampleUrl || ''}
                          onChange={(e) => {
                            updateAudio({
                              ...s.audio,
                              type: 'sample',
                              sampleUrl: e.target.value,
                            });
                          }}
                          style={{ marginLeft: '4px' }}
                        >
                          <option value="">Select Sample</option>
                          {availableSamples.map((sample) => (
                            <option key={sample.url} value={sample.url}>
                              {sample.name}
                            </option>
                          ))}
                        </select>
                      )}
                      
                      {s.audio && (
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={s.audio.volume || 0.5}
                          onChange={(e) => {
                            if (s.audio) {
                              updateAudio({
                                ...s.audio,
                                type: s.audio.type,
                                volume: parseFloat(e.target.value),
                              });
                            }
                          }}
                          style={{ width: '50px', marginLeft: '4px' }}
                          title={`Volume: ${Math.round((s.audio.volume || 0.5) * 100)}%`}
                        />
                      )}
                    </div>
                    <div className="segment-actions">
                      <button disabled={i === 0} onClick={() => swap(i, i - 1)}>
                        ↑
                      </button>
                      <button
                        disabled={i === segments.length - 1}
                        onClick={() => swap(i, i + 1)}
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => {
                          setSegments(segments.filter((_, j) => i !== j));
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
          <button
            onClick={() => {
              setSegments([
                ...segments,
                {
                  name: vids[0]!.name,
                  from: 0,
                  to: vids[0].chunks.length,
                  repeat: 1,
                },
              ]);
            }}
          >
            Add segment
          </button>
        </>
      )}
      {preview && <RangePreview vid={preview.vid} i={preview.i} />}
    </Section>
  );
};
