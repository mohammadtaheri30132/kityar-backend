import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { IEduImage } from '../../../core/models/EduContent.js'

export const EDU_MEDIA_DIR = path.join(process.cwd(), 'public', 'uploads', 'edu-media')
export const EDU_RESOURCES_DIR = path.join(process.cwd(), 'public', 'uploads', 'edu-resources')

export function ensureEduMediaDir() {
  if (!fs.existsSync(EDU_MEDIA_DIR)) {
    fs.mkdirSync(EDU_MEDIA_DIR, { recursive: true })
  }
}

export function ensureEduResourcesDir() {
  if (!fs.existsSync(EDU_RESOURCES_DIR)) {
    fs.mkdirSync(EDU_RESOURCES_DIR, { recursive: true })
  }
}

const PALETTES: Record<string, [string, string, string]> = {
  'ابتدایی': ['#FF8A00', '#FFB300', '🎒'],
  'متوسطه اول': ['#2563EB', '#06B6D4', '📘'],
  'متوسطه دوم': ['#7C3AED', '#EC4899', '🎓'],
  'ریاضی': ['#0284C7', '#38BDF8', '📐'],
  'تجربی': ['#059669', '#34D399', '🧬'],
  'انسانی': ['#D97706', '#FBBF24', '📜'],
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Generate an educational SVG graphic on disk for levels, grades, and fields (never used as fake book covers). */
export function ensureGraphicForTaxonomy(
  entityType: 'level' | 'grade' | 'field',
  stableId: string,
  title: string,
  subtitle?: string
): IEduImage {
  ensureEduMediaDir()
  const hash = crypto.createHash('md5').update(stableId).digest('hex').slice(0, 10)
  const fileName = `${entityType}_${hash}.svg`
  const filePath = path.join(EDU_MEDIA_DIR, fileName)

  const palette =
    PALETTES[title] ||
    (subtitle && PALETTES[subtitle]) ||
    (entityType === 'grade'
      ? ['#4F46E5', '#818CF8', '📚']
      : entityType === 'field'
        ? ['#0D9488', '#2DD4BF', '🧭']
        : ['#EA580C', '#FB923C', '🏫'])

  const [c1, c2, emoji] = palette

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="320" viewBox="0 0 512 320">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="320" rx="36" fill="url(#bg)"/>
  <circle cx="430" cy="60" r="88" fill="#ffffff" fill-opacity="0.12"/>
  <circle cx="70" cy="280" r="105" fill="#ffffff" fill-opacity="0.1"/>
  <text x="256" y="135" font-size="68" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
  <text x="256" y="215" font-family="Vazirmatn, Tahoma, sans-serif" font-size="34" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(title)}</text>
  ${
    subtitle
      ? `<text x="256" y="262" font-family="Vazirmatn, Tahoma, sans-serif" font-size="20" fill="#ffffff" fill-opacity="0.9" text-anchor="middle">${escapeXml(subtitle)}</text>`
      : ''
  }
</svg>`

  fs.writeFileSync(filePath, svg, 'utf-8')
  return {
    url: `/uploads/edu-media/${fileName}`,
    imageType: 'graphic',
    source: 'system_svg_graphic',
    status: 'approved',
    updatedAt: new Date(),
  }
}

export function deleteUploadedEduMediaIfLocal(url?: string | null) {
  if (!url || !url.startsWith('/uploads/edu-media/')) return
  const filename = path.basename(url)
  // Don't delete auto-generated taxonomy graphics unless intentionally removed from disk
  const fullPath = path.join(EDU_MEDIA_DIR, filename)
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath)
    } catch {
      // ignore fs cleanup error
    }
  }
}
