const express = require('express')
const { AppError } = require('../middleware/errorHandler')
const bookService = require('../services/bookService')
const { generateFromBook } = require('../services/geminiService')

const router = express.Router()

/**
 * GET /api/book/subjects/:classNum
 * List available subjects for a class.
 */
router.get('/subjects/:classNum', async (req, res, next) => {
  try {
    const classNum = parseInt(req.params.classNum)
    if (classNum < 6 || classNum > 10) {
      throw new AppError('Class must be between 6 and 10', 400)
    }

    const subjects = await bookService.getSubjects(classNum)
    res.json({ success: true, subjects })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/book/chapters/:classNum/:subject
 * List chapters for a class + subject.
 */
router.get('/chapters/:classNum/:subject', async (req, res, next) => {
  try {
    const classNum = parseInt(req.params.classNum)
    const { subject } = req.params

    if (classNum < 6 || classNum > 10) {
      throw new AppError('Class must be between 6 and 10', 400)
    }

    const chapters = await bookService.getChapters(classNum, subject)
    res.json({ success: true, chapters })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/book/generate
 * Generate questions from selected chapters using Gemini.
 *
 * Body: {
 *   classNum: 9,
 *   subject: 'bangla',
 *   chapters: ['chapter_1', 'chapter_2'],
 *   questionTypes: ['MCQ', 'CQ'],
 *   count: 5
 * }
 */
router.post('/generate', async (req, res, next) => {
  try {
    const { classNum, subject, chapters, questionTypes, count } = req.body

    if (!classNum || !subject || !chapters || !Array.isArray(chapters) || chapters.length === 0) {
      throw new AppError('ক্লাস, বিষয় এবং চ্যাপ্টার সিলেক্ট করুন', 400)
    }

    if (!questionTypes || !Array.isArray(questionTypes) || questionTypes.length === 0) {
      throw new AppError('কমপক্ষে ১টি প্রশ্নের ধরন সিলেক্ট করুন', 400)
    }

    const requestedCount = Math.min(count || 5, 15)

    // Fetch question_points for selected chapters
    let chapterData = await bookService.getChapterPoints(classNum, subject, chapters)

    if (chapterData.length === 0) {
      throw new AppError('সিলেক্ট করা চ্যাপ্টারে কোন ডাটা পাওয়া যায়নি', 404)
    }

    chapterData = chapterData.filter((ch) => Array.isArray(ch.points) && ch.points.length > 0)
    if (chapterData.length === 0) {
      throw new AppError(
        'সিলেক্ট করা চ্যাপ্টারে question_points খালি। বই/পিডিএফ কনটেন্ট সীড চেক করুন।',
        404,
      )
    }

    // Combine all points into a single context
    const combinedContext = chapterData
      .map((ch) => {
        const pointsText = ch.points.map((p, i) => `  ${i + 1}. ${p}`).join('\n')
        return `## ${ch.title}\n${ch.summary ? ch.summary + '\n' : ''}Key Points:\n${pointsText}`
      })
      .join('\n\n---\n\n')

    // Generate questions via Gemini
    const result = await generateFromBook(combinedContext, {
      subject,
      classNum,
      questionTypes,
      count: requestedCount,
    })

    res.json({
      success: true,
      questions: result.questions,
      count: result.questions.length,
      source: chapterData.map((ch) => ch.title),
    })
  } catch (err) {
    console.error('Book Generate Error:', err)
    next(err)
  }
})

module.exports = router
