const express = require('express')
const paperService = require('../services/paperService')
const { AppError } = require('../middleware/errorHandler')
const { checkLimit } = require('../middleware/subscription')
const { mockAuth } = require('../middleware/auth')

const router = express.Router()
router.use(mockAuth)

router.post('/', checkLimit('paper_count'), async (req, res, next) => {
  try {
    const {
      institution_name,
      exam_title,
      session_year,
      time_minutes,
      total_marks,
      header_alignment,
      layout,
      watermark,
      set_variant,
      logo_url,
      questions,
    } = req.body

    if (!exam_title || !String(exam_title).trim()) {
      throw new AppError('পরীক্ষার নাম (Exam Title) প্রয়োজন', 400)
    }

    const paper = await paperService.create(req.user.uid, {
      institution_name,
      exam_title,
      session_year,
      time_minutes,
      total_marks,
      header_alignment,
      layout,
      watermark: req.user.subscription === 'pro' ? watermark ?? null : 'AI Question Hub',
      set_variant,
      logo_url: req.user.subscription === 'pro' ? logo_url || null : null,
      questions: questions || [],
    })

    res.status(201).json({ success: true, paper })
  } catch (err) {
    next(err)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const papers = await paperService.listByUser(req.user.uid)
    res.json({ success: true, papers })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const paper = await paperService.getById(req.params.id, req.user.uid)
    if (!paper) throw new AppError('Paper not found', 404)
    res.json({ success: true, paper })
  } catch (err) {
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const allowedFields = [
      'institution_name',
      'exam_title',
      'session_year',
      'time_minutes',
      'total_marks',
      'header_alignment',
      'layout',
      'watermark',
      'set_variant',
      'logo_url',
      'questions',
    ]
    const updates = {}
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field]
    }
    if (req.user.subscription !== 'pro') {
      updates.watermark = 'AI Question Hub'
      delete updates.logo_url
    }

    const paper = await paperService.update(req.params.id, req.user.uid, updates)
    if (!paper) throw new AppError('Paper not found', 404)
    res.json({ success: true, paper })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await paperService.softDelete(req.params.id, req.user.uid)
    res.json({ success: true, message: 'Paper deleted' })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const { generatePDF } = require('../services/pdfService')
    const paper = await paperService.getById(req.params.id, req.user.uid)
    if (!paper) throw new AppError('Paper not found', 404)

    const variant = req.query.variant || null
    const font = req.query.font || null
    const size = req.query.size || null
    const spacing = req.query.spacing || null

    const pdfBuffer = await generatePDF(
      { id: paper.id, ...paper },
      { variant, font, size, spacing }
    )

    const filename = `${paper.exam_title || 'paper'}${variant ? `_Set-${variant}` : ''}.pdf`
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': pdfBuffer.length,
    })
    res.send(pdfBuffer)
  } catch (err) {
    console.error('PDF Route Error:', err.message)
    next(err)
  }
})

router.get('/:id/omr', checkLimit('omr'), async (req, res, next) => {
  try {
    const paper = await paperService.getById(req.params.id, req.user.uid)
    if (!paper) throw new AppError('Paper not found', 404)
    res.json({ success: true, paper })
  } catch (err) {
    next(err)
  }
})

module.exports = router
