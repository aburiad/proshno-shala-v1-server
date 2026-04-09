const express = require('express')
const { authenticate } = require('../middleware/auth')
const { checkLimit } = require('../middleware/subscription')
const { scanImage } = require('../services/geminiService')
const paperService = require('../services/paperService')
const { generatePDF } = require('../services/pdfService')
const { supabaseAdmin } = require('../config/supabase')
const { AppError } = require('../middleware/errorHandler')

const router = express.Router()

router.post('/generate-question', authenticate, checkLimit('ai_scan'), async (req, res, next) => {
  try {
    const { image } = req.body
    if (!image) throw new AppError('Image is required', 400)
    const result = await scanImage(image)
    const nextCount = (req.profile.ai_scan_count || 0) + 1
    await supabaseAdmin
      .from('profiles')
      .update({ ai_scan_count: nextCount, updated_at: new Date().toISOString() })
      .eq('id', req.user.uid)
    res.json({ success: true, questions: result.questions, count: result.count })
  } catch (err) {
    next(err)
  }
})

router.get('/generate-pdf/:paperId', authenticate, async (req, res, next) => {
  try {
    const paper = await paperService.getById(req.params.paperId, req.user.uid)
    if (!paper) throw new AppError('Paper not found', 404)
    const variant = req.query.variant || null
    const pdfBuffer = await generatePDF({ id: paper.id, ...paper }, { variant })
    const filename = `${paper.exam_title || 'paper'}${variant ? `_Set-${variant}` : ''}.pdf`
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': pdfBuffer.length,
    })
    res.send(pdfBuffer)
  } catch (err) {
    next(err)
  }
})

module.exports = router
