const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { supabaseAdmin } = require('../config/supabase')

const SUBJECTS_MAP = {
  bangla: 'বাংলা',
  english: 'English',
  math: 'গণিত',
  science: 'বিজ্ঞান',
  accounting: 'হিসাববিজ্ঞান',
}

let curriculumLoadPromise

async function loadCurriculum() {
  if (!curriculumLoadPromise) {
    const clientCurriculumPath = path.resolve(__dirname, '../../../client/src/data/curriculumData.js')
    curriculumLoadPromise = (async () => {
      try {
        if (fs.existsSync(clientCurriculumPath)) {
          const mod = await import(pathToFileURL(clientCurriculumPath).href)
          if (mod.curriculum) return mod.curriculum
        }
      } catch (err) {
        console.warn('bookService: client curriculum import failed:', err.message)
      }
      try {
        return require('../data/bookCurriculumFallback.json')
      } catch (err) {
        console.warn('bookService: bundled curriculum missing:', err.message)
        return null
      }
    })()
  }
  return curriculumLoadPromise
}

function fallbackSubjectEntries(curriculum, classNum) {
  if (!curriculum) return []
  const subjects = curriculum[String(classNum)]?.subjects
  if (!subjects) return []
  return Object.keys(subjects).map((key) => ({
    id: key,
    label: SUBJECTS_MAP[key] || subjects[key]?.label || key,
  }))
}

function fallbackChaptersFlat(curriculum, classNum, subject) {
  if (!curriculum) return []
  const subj = curriculum[String(classNum)]?.subjects?.[subject]
  if (!subj?.chapters) return []
  const out = []
  for (const ch of subj.chapters) {
    for (const sub of ch.subchapters || []) {
      out.push({
        id: sub.id,
        title: `${ch.title} — ${sub.title}`,
        type: 'উপঅধ্যায়',
        chapterNumber: null,
      })
    }
  }
  return out
}

function curriculumSyntheticPoints(curriculum, classNum, subject, chapterId) {
  if (!curriculum) return null
  const subj = curriculum[String(classNum)]?.subjects?.[subject]
  if (!subj?.chapters) return null
  for (const ch of subj.chapters) {
    if (ch.id === chapterId) {
      const points = (ch.subchapters || []).map((s) =>
        `${s.id} ${s.title}${s.titleEn ? ` (${s.titleEn})` : ''}`.trim(),
      )
      if (points.length === 0) points.push(ch.title)
      return { title: ch.title, points, summary: '' }
    }
    const sub = ch.subchapters?.find((s) => s.id === chapterId)
    if (sub) {
      return {
        title: `${ch.title} › ${sub.title}`,
        points: [
          `${sub.title}${sub.titleEn ? ` (${sub.titleEn})` : ''}`,
          `অধ্যায়: ${ch.title}`,
        ],
        summary: '',
      }
    }
  }
  return null
}

const bookService = {
  async getSubjects(classNum) {
    const { data, error } = await supabaseAdmin
      .from('book_chapters')
      .select('subject')
      .eq('class_num', classNum)
    if (error) throw error
    const fromDb = [...new Set((data || []).map((r) => r.subject))].map((key) => ({
      id: key,
      label: SUBJECTS_MAP[key] || key,
    }))

    const curriculum = await loadCurriculum()
    const fromFallback = fallbackSubjectEntries(curriculum, classNum)

    const map = new Map()
    for (const s of [...fromDb, ...fromFallback]) {
      map.set(s.id, s)
    }
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id))
  },

  async getChapters(classNum, subject) {
    const { data, error } = await supabaseAdmin
      .from('book_chapters')
      .select('chapter_id, title, payload')
      .eq('class_num', classNum)
      .eq('subject', subject)
    if (error) throw error
    const fromDb = (data || []).map((row) => {
      const p = row.payload || {}
      return {
        id: row.chapter_id,
        title: row.title || row.chapter_id,
        type: p.type || '',
        chapterNumber: p.metadata?.chapterNumber ?? null,
      }
    })
    if (fromDb.length > 0) return fromDb

    const curriculum = await loadCurriculum()
    return fallbackChaptersFlat(curriculum, classNum, subject)
  },

  async getChapterPoints(classNum, subject, chapterIds) {
    const results = []
    const curriculum = await loadCurriculum()
    for (const chapterId of chapterIds) {
      const { data, error } = await supabaseAdmin
        .from('book_chapters')
        .select('chapter_id, title, payload')
        .eq('class_num', classNum)
        .eq('subject', subject)
        .eq('chapter_id', chapterId)
        .maybeSingle()
      if (error) throw error
      if (data) {
        const p = data.payload || {}
        results.push({
          chapterId,
          title: data.title || chapterId,
          points: p.question_points || [],
          summary: p.ai_summary || '',
        })
        continue
      }
      const syn = curriculumSyntheticPoints(curriculum, classNum, subject, chapterId)
      if (syn) {
        results.push({
          chapterId,
          title: syn.title,
          points: syn.points,
          summary: syn.summary,
        })
      }
    }
    return results
  },

  async saveChapter(classNum, subject, chapterId, chapterData) {
    const payload = {
      type: chapterData.type,
      full_text: chapterData.full_text,
      metadata: chapterData.metadata,
      question_points: chapterData.question_points,
      ai_summary: chapterData.ai_summary,
    }
    const { error } = await supabaseAdmin.from('book_chapters').upsert(
      {
        class_num: classNum,
        subject,
        chapter_id: chapterId,
        title: chapterData.title || chapterId,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'class_num,subject,chapter_id' },
    )
    if (error) throw error
    return { success: true, path: `book_chapters/${classNum}/${subject}/${chapterId}` }
  },
}

module.exports = bookService
