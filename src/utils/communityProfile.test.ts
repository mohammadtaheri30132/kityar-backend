import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Classroom } from '../core/models/Classroom.js'
import { CommunityPost } from '../core/models/CommunityPost.js'
import { StudentProfile } from '../core/models/StudentProfile.js'
import { TeacherProfile } from '../core/models/TeacherProfile.js'
import { isVideoUpload, optimizeUploadedVideo } from '../core/utils/videoOptimizer.js'
import { getProfile } from '../modules/teacher/controllers/teacher.profile.controller.js'

// 1. Video detection checks
assert.equal(isVideoUpload('video/mp4', 'clip.mp4'), true)
assert.equal(isVideoUpload('application/octet-stream', 'VID_1234.MOV'), true)
assert.equal(isVideoUpload('image/jpeg', 'photo.jpg'), false)

// 2. Teacher profile postsCount query uses status: 'active' instead of nonexistent isDeleted field
const origTeacherFindOne = TeacherProfile.findOne
const origClassroomFind = Classroom.find
const origPostCount = CommunityPost.countDocuments
const origStudentCount = StudentProfile.countDocuments

let capturedPostFilter: any = null
let capturedStatus = 0
let capturedJson: any = null

try {
  const fakeProfile = {
    _id: 'prof_1',
    experienceYears: 5,
    resume: { experiences: [] },
    toObject: () => ({ _id: 'prof_1', headline: 'دبیر ریاضی' }),
  }

  ;(TeacherProfile as any).findOne = () => ({
    populate: async () => fakeProfile,
  })
  ;(Classroom as any).find = () => ({
    select: async () => [],
  })
  ;(CommunityPost as any).countDocuments = async (filter: any) => {
    capturedPostFilter = filter
    return 4
  }
  ;(StudentProfile as any).countDocuments = async () => 2

  const mockReq: any = { user: { id: 'teacher_user_1' } }
  const mockRes: any = {
    status(code: number) {
      capturedStatus = code
      return this
    },
    json(payload: any) {
      capturedJson = payload
      return this
    },
  }

  await getProfile(mockReq, mockRes)

  assert.equal(capturedStatus, 200)
  assert.deepEqual(capturedPostFilter, { author: 'teacher_user_1', status: 'active' })
  assert.equal('isDeleted' in capturedPostFilter, false, 'Must not query nonexistent isDeleted field')
  assert.equal(capturedJson?.stats?.postsCount, 4, 'postsCount should reflect all 4 active posts')
} finally {
  ;(TeacherProfile as any).findOne = origTeacherFindOne
  ;(Classroom as any).find = origClassroomFind
  ;(CommunityPost as any).countDocuments = origPostCount
  ;(StudentProfile as any).countDocuments = origStudentCount
}

// 3. Server video compression & thumbnail generation checks in temp dir
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitayar-vid-test-'))
try {
  // 3a: .mov smaller compressed output -> converted to .mp4 + _thumb.jpg
  const movPath = path.join(tmpDir, 'sample.mov')
  fs.writeFileSync(movPath, Buffer.alloc(1024, 1))

  const resConverted = await optimizeUploadedVideo(movPath, async (_bin, args) => {
    const out = args[args.length - 1]
    if (out.endsWith('.mp4')) fs.writeFileSync(out, Buffer.alloc(256, 2))
    if (out.endsWith('.jpg')) fs.writeFileSync(out, Buffer.alloc(64, 3))
    return { stdout: '', stderr: '' }
  })

  assert.equal(resConverted.filename, 'sample.mp4')
  assert.equal(resConverted.compressed, true)
  assert.equal(resConverted.size, 256)
  assert.equal(resConverted.thumbnailFilename, 'sample_thumb.jpg')
  assert.equal(fs.existsSync(movPath), false, 'Original .mov should be removed after mp4 conversion')
  assert.equal(fs.existsSync(path.join(tmpDir, 'sample.mp4')), true)
  assert.equal(fs.existsSync(path.join(tmpDir, 'sample_thumb.jpg')), true)

  // 3b: already smaller .mp4 -> keep smaller original .mp4
  const smallMp4Path = path.join(tmpDir, 'tiny.mp4')
  fs.writeFileSync(smallMp4Path, Buffer.alloc(100, 1))
  const resKeepOrig = await optimizeUploadedVideo(smallMp4Path, async (_bin, args) => {
    const out = args[args.length - 1]
    if (out.endsWith('.mp4')) fs.writeFileSync(out, Buffer.alloc(300, 2))
    if (out.endsWith('.jpg')) fs.writeFileSync(out, Buffer.alloc(50, 3))
    return { stdout: '', stderr: '' }
  })
  assert.equal(resKeepOrig.compressed, false)
  assert.equal(resKeepOrig.size, 100)
  assert.equal(resKeepOrig.thumbnailFilename, 'tiny_thumb.jpg')

  // 3c: missing ffmpeg binary -> graceful fallback
  const fallbackMp4 = path.join(tmpDir, 'fallback.mp4')
  fs.writeFileSync(fallbackMp4, Buffer.alloc(200, 1))
  const resFallback = await optimizeUploadedVideo(fallbackMp4, async () => {
    throw new Error('spawn ffmpeg ENOENT')
  })
  assert.equal(resFallback.compressed, false)
  assert.equal(resFallback.size, 200)
  assert.equal(resFallback.thumbnailFilename, null)
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

console.log('✅ communityProfile.test.ts passed all assertions')
