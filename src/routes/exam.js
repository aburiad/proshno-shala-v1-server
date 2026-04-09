const express = require('express')
const { authenticate } = require('../middleware/auth')
const examService = require('../services/examService')
const router = express.Router()

/**
 * POST /api/exam — create online exam (auth required)
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { paperId, config } = req.body
    const exam = await examService.publishExam(req.user.uid, paperId, config || {})
    res.status(201).json({ success: true, exam })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/exam — list exams (auth required)
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const exams = await examService.listExams(req.user.uid)
    res.json({ success: true, exams })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/exam/:examId — student-facing exam fetch (public)
 */
router.get('/:examId', async (req, res, next) => {
  try {
    const exam = await examService.getExamForStudent(req.params.examId)
    res.json({ success: true, exam })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/exam/:examId/submit — submit answers (public)
 */
router.post('/:examId/submit', async (req, res, next) => {
  try {
    const result = await examService.submitExam(req.params.examId, req.body)
    res.status(201).json({ success: true, result })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/exam/:examId/results — teacher results (auth required)
 */
router.get('/:examId/results', authenticate, async (req, res, next) => {
  try {
    const results = await examService.getExamResults(req.user.uid, req.params.examId)
    res.json({ success: true, results })
  } catch (err) {
    next(err)
  }
})

module.exports = router
