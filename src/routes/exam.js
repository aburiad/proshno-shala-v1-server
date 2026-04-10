const express = require('express')
const examService = require('../services/examService')
const router = express.Router()

const MOCK_USER_ID = 'anonymous-user'

/**
 * POST /api/exam — create online exam
 */
router.post('/', async (req, res, next) => {
  try {
    const { paperId, config } = req.body
    const exam = await examService.publishExam(MOCK_USER_ID, paperId, config || {})
    res.status(201).json({ success: true, exam })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/exam — list exams
 */
router.get('/', async (req, res, next) => {
  try {
    const exams = await examService.listExams(MOCK_USER_ID)
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
 * GET /api/exam/:examId/results — teacher results
 */
router.get('/:examId/results', async (req, res, next) => {
  try {
    const results = await examService.getExamResults(MOCK_USER_ID, req.params.examId)
    res.json({ success: true, results })
  } catch (err) {
    next(err)
  }
})

module.exports = router
