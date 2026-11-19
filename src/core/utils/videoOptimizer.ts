import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

const VIDEO_EXT_REGEX = /\.(mp4|mov|m4v|3gp|mkv|webm|avi)$/i;

export type ExecFileLike = (
  file: string,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number }
) => Promise<{ stdout: string; stderr: string }>;

export interface VideoOptimizationResult {
  filePath: string;
  filename: string;
  size: number;
  compressed: boolean;
  thumbnailFilename: string | null;
}

export function isVideoUpload(mimetype?: string, filename?: string): boolean {
  if (mimetype && mimetype.startsWith('video/')) return true;
  if (filename && VIDEO_EXT_REGEX.test(filename)) return true;
  return false;
}

/**
 * Compresses an uploaded video with H.264 CRF 22 (visually high quality) and
 * extracts a JPEG cover frame, falling back to the original file if ffmpeg is missing/fails.
 */
export async function optimizeUploadedVideo(
  inputPath: string,
  execFn: ExecFileLike = execFileAsync as unknown as ExecFileLike
): Promise<VideoOptimizationResult> {
  const parsed = path.parse(inputPath);
  const targetMp4Path = path.join(parsed.dir, `${parsed.name}.mp4`);
  const tempMp4Path = path.join(parsed.dir, `opt_${parsed.name}.mp4`);
  const thumbFilename = `${parsed.name}_thumb.jpg`;
  const thumbPath = path.join(parsed.dir, thumbFilename);

  const origSize = fs.existsSync(inputPath) ? fs.statSync(inputPath).size : 0;
  let finalPath = inputPath;
  let compressed = false;

  try {
    // Cap long edge at 1280px (without upscaling smaller videos) and ensure even dimensions for yuv420p
    const scaleFilter =
      "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',pad=ceil(iw/2)*2:ceil(ih/2)*2";

    await execFn(
      'ffmpeg',
      [
        '-y',
        '-i',
        inputPath,
        '-vf',
        scaleFilter,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '22',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        tempMp4Path,
      ],
      { timeout: 240_000, maxBuffer: 10 * 1024 * 1024 }
    );

    const optSize = fs.existsSync(tempMp4Path) ? fs.statSync(tempMp4Path).size : 0;
    const mustConvertExt = parsed.ext.toLowerCase() !== '.mp4';

    if (optSize > 0 && (optSize < origSize || mustConvertExt)) {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      fs.renameSync(tempMp4Path, targetMp4Path);
      finalPath = targetMp4Path;
      compressed = true;
    } else if (fs.existsSync(tempMp4Path)) {
      fs.unlinkSync(tempMp4Path);
    }
  } catch (err: any) {
    // shortcut: skips server video transcoding when ffmpeg binary is unavailable or fails
    if (fs.existsSync(tempMp4Path)) {
      try {
        fs.unlinkSync(tempMp4Path);
      } catch {
        // ignore cleanup error
      }
    }
    logger.warn('⚠️ FFmpeg video optimization skipped/failed, keeping original upload:', err?.message || err);
  }

  // Generate thumbnail frame best-effort
  let generatedThumb: string | null = null;
  try {
    await execFn(
      'ffmpeg',
      ['-y', '-ss', '00:00:00.5', '-i', finalPath, '-frames:v', '1', '-vf', "scale='min(720,iw)':-2", '-q:v', '4', thumbPath],
      { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
    );
    if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) {
      generatedThumb = thumbFilename;
    }
  } catch {
    try {
      await execFn(
        'ffmpeg',
        ['-y', '-ss', '0', '-i', finalPath, '-frames:v', '1', '-vf', "scale='min(720,iw)':-2", '-q:v', '4', thumbPath],
        { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
      );
      if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) {
        generatedThumb = thumbFilename;
      }
    } catch {
      generatedThumb = null;
    }
  }

  const finalSize = fs.existsSync(finalPath) ? fs.statSync(finalPath).size : origSize;
  return {
    filePath: finalPath,
    filename: path.basename(finalPath),
    size: finalSize,
    compressed,
    thumbnailFilename: generatedThumb,
  };
}
