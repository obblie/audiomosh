import { FFmpeg } from "@ffmpeg/ffmpeg";
import { Dispatch, SetStateAction, useState } from "react";

import { Section } from "./components/Section";
import { computeChunks, FPS } from "./lib";
import { Settings, Vid } from "./types";

export const FilesEditor = ({
  vids,
  setVids,
  ffmpeg,
  progress,
  onConfig,
  settings,
  preprocessSettings,
  setPreprocessSettings,
}: {
  vids: Vid[];
  setVids: React.Dispatch<React.SetStateAction<Vid[]>>;
  ffmpeg: FFmpeg;
  progress: number;
  onConfig: Dispatch<SetStateAction<VideoDecoderConfig | null>>;
  settings: Settings;
  preprocessSettings: Settings;
  setPreprocessSettings: Dispatch<SetStateAction<Settings>>;
}) => {
  const [loading, setLoading] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [currentFileName, setCurrentFileName] = useState("");

  return (
    <Section name="Files">
      {vids.length === 0 ? (
        <p>No videos uploaded yet</p>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4>{vids.length} video{vids.length !== 1 ? 's' : ''} loaded</h4>
            <button 
              onClick={() => setVids([])}
              style={{ padding: '4px 8px', fontSize: '12px' }}
            >
              Clear All
            </button>
          </div>
          <ul style={{ maxHeight: '200px', overflowY: 'auto', margin: '0', padding: '0' }}>
            {vids.map((vid, index) => (
              <li key={vid.name} style={{ listStyle: 'none', padding: '4px 0', borderBottom: '1px solid #333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    <strong>{index + 1}.</strong> {vid.name} 
                    <span style={{ color: '#888', fontSize: '0.9em' }}>
                      {" "}({(vid.chunks.length / FPS).toFixed(2)}s, {vid.chunks.length} frames)
                    </span>
                  </span>
                  <button 
                    onClick={() => setVids(vids.filter(v => v.name !== vid.name))}
                    style={{ padding: '2px 6px', fontSize: '11px', marginLeft: '8px' }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p>
          <span>Upload single video:</span>
          <input
            type="file"
            accept="video/*,image/*"
            onChange={async (evt) => {
              setLoading(true);
              const file = evt.target.files![0];
              const src = URL.createObjectURL(file);
              const withoutSpaces = file.name.replace(/\s/g, "_");
              let name = withoutSpaces;
              let i = 0;
              while (vids.map((vid) => vid.name).includes(name)) {
                name = `${withoutSpaces}_${i}`;
                i++;
              }
              const chunks = await computeChunks(
                ffmpeg,
                file,
                name,
                settings.width,
                settings.height,
                onConfig
              );
              setVids([...vids, { file, name, chunks, src }]);
              evt.target.value = "";
              setLoading(false);
              setPreprocessSettings(settings);
            }}
            disabled={loading}
          />
        </p>
        
        <p>
          <span>Upload multiple videos:</span>
          <input
            type="file"
            accept="video/*,image/*"
            multiple
            onChange={async (evt) => {
              if (!evt.target.files || evt.target.files.length === 0) return;
              
              setLoading(true);
              const files = Array.from(evt.target.files);
              setTotalFiles(files.length);
              setCurrentFileIndex(0);
              const newVids: Vid[] = [];
              
              console.log(`🎬 Processing ${files.length} files...`);
              
              for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
                const file = files[fileIndex];
                setCurrentFileIndex(fileIndex + 1);
                setCurrentFileName(file.name);
                console.log(`🎬 Processing file ${fileIndex + 1}/${files.length}: ${file.name}`);
                
                const src = URL.createObjectURL(file);
                const withoutSpaces = file.name.replace(/\s/g, "_");
                let name = withoutSpaces;
                let i = 0;
                const existingNames = [...vids, ...newVids].map((vid) => vid.name);
                while (existingNames.includes(name)) {
                  name = `${withoutSpaces}_${i}`;
                  i++;
                }
                
                try {
                  const chunks = await computeChunks(
                    ffmpeg,
                    file,
                    name,
                    settings.width,
                    settings.height,
                    onConfig
                  );
                  newVids.push({ file, name, chunks, src });
                  console.log(`✅ Processed ${name}: ${chunks.length} frames`);
                } catch (error) {
                  console.error(`❌ Failed to process ${file.name}:`, error);
                }
              }
              
              setVids([...vids, ...newVids]);
              evt.target.value = "";
              setLoading(false);
              setCurrentFileIndex(0);
              setTotalFiles(0);
              setCurrentFileName("");
              setPreprocessSettings(settings);
              
              console.log(`🎬 Finished processing ${newVids.length}/${files.length} files successfully`);
            }}
            disabled={loading}
          />
        </p>
        
        <p>
          <span>Upload directory:</span>
          <input
            type="file"
            // @ts-ignore - webkitdirectory is not in the types but is supported
            webkitdirectory=""
            onChange={async (evt) => {
              if (!evt.target.files || evt.target.files.length === 0) return;
              
              setLoading(true);
              const files = Array.from(evt.target.files);
              
              // Filter for video files only
              const videoFiles = files.filter(file => {
                const isVideo = file.type.startsWith('video/') || file.type.startsWith('image/');
                const hasVideoExtension = /\.(mp4|webm|ogg|avi|mov|mkv|flv|wmv|m4v|3gp|gif|jpg|jpeg|png)$/i.test(file.name);
                return isVideo || hasVideoExtension;
              });
              
              console.log(`🎬 Found ${videoFiles.length} video files in directory (${files.length} total files)`);
              
              if (videoFiles.length === 0) {
                alert('No video files found in the selected directory');
                setLoading(false);
                return;
              }
              
              setTotalFiles(videoFiles.length);
              setCurrentFileIndex(0);
              const newVids: Vid[] = [];
              
              for (let fileIndex = 0; fileIndex < videoFiles.length; fileIndex++) {
                const file = videoFiles[fileIndex];
                setCurrentFileIndex(fileIndex + 1);
                setCurrentFileName(file.webkitRelativePath || file.name);
                console.log(`🎬 Processing file ${fileIndex + 1}/${videoFiles.length}: ${file.webkitRelativePath || file.name}`);
                
                const src = URL.createObjectURL(file);
                const relativePath = file.webkitRelativePath || file.name;
                const withoutSpaces = relativePath.replace(/\s/g, "_").replace(/\//g, "_");
                let name = withoutSpaces;
                let i = 0;
                const existingNames = [...vids, ...newVids].map((vid) => vid.name);
                while (existingNames.includes(name)) {
                  name = `${withoutSpaces}_${i}`;
                  i++;
                }
                
                try {
                  const chunks = await computeChunks(
                    ffmpeg,
                    file,
                    name,
                    settings.width,
                    settings.height,
                    onConfig
                  );
                  newVids.push({ file, name, chunks, src });
                  console.log(`✅ Processed ${name}: ${chunks.length} frames`);
                } catch (error) {
                  console.error(`❌ Failed to process ${relativePath}:`, error);
                }
              }
              
              setVids([...vids, ...newVids]);
              evt.target.value = "";
              setLoading(false);
              setCurrentFileIndex(0);
              setTotalFiles(0);
              setCurrentFileName("");
              setPreprocessSettings(settings);
              
              console.log(`🎬 Finished processing ${newVids.length}/${videoFiles.length} video files successfully`);
            }}
            disabled={loading}
          />
        </p>
      </div>
      {JSON.stringify(preprocessSettings) !== JSON.stringify(settings) &&
        !!vids.length && (
          <p>
            <button
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setTotalFiles(vids.length);
                setCurrentFileIndex(0);
                
                for (let i = 0; i < vids.length; i++) {
                  const vid = vids[i];
                  setCurrentFileIndex(i + 1);
                  setCurrentFileName(vid.name);
                  
                  vid.chunks = await computeChunks(
                    ffmpeg,
                    vid.file,
                    vid.name,
                    settings.width,
                    settings.height,
                    onConfig
                  );
                }
                
                setVids([...vids]);
                setPreprocessSettings(settings);
                setLoading(false);
                setCurrentFileIndex(0);
                setTotalFiles(0);
                setCurrentFileName("");
              }}
            >
              Reprocess files
            </button>
          </p>
        )}
      {loading && (
        <div className="upload-progress">
          {totalFiles > 1 && (
            <div className="file-progress">
              <strong>Processing file {currentFileIndex}/{totalFiles}</strong>
              {currentFileName && (
                <div className="current-file-name">
                  📁 {currentFileName}
                </div>
              )}
            </div>
          )}
          <progress value={progress} />
          {totalFiles > 1 && (
            <div className="overall-progress">
              Overall: {currentFileIndex}/{totalFiles} files ({Math.round((currentFileIndex / totalFiles) * 100)}%)
            </div>
          )}
        </div>
      )}
    </Section>
  );
};
