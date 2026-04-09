const { supabaseAdmin } = require('../config/supabase')
const { AppError } = require('../middleware/errorHandler')

const cleanUndefined = (obj) => {
  if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach((key) => {
      if (obj[key] === undefined) {
        delete obj[key]
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        cleanUndefined(obj[key])
      }
    })
  }
  return obj
}

function examRowToClient(row) {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    paperId: row.paper_id,
    title: row.title,
    institution: row.institution,
    questions: row.questions || [],
    duration: row.duration,
    startTime: row.start_time,
    endTime: row.end_time,
    allowLate: row.allow_late,
    revealResults: row.reveal_results,
    status: row.status,
    createdAt: row.created_at,
  }
}

const examService = {
  async publishExam(userId, paperId, config) {
    const paperService = require('./paperService')
    const paper = await paperService.getById(paperId, userId)
    if (!paper) throw new AppError('Paper not found', 404)

    const insert = {
      teacher_id: userId,
      paper_id: paperId,
      title: paper.exam_title,
      institution: paper.institution_name,
      questions: paper.questions || [],
      duration: config.duration || 60,
      start_time: config.startTime || null,
      end_time: config.endTime || null,
      allow_late: config.allowLate || false,
      reveal_results: config.revealResults !== false,
      status: 'active',
    }

    const { data, error } = await supabaseAdmin.from('exams').insert(insert).select().single()
    if (error) throw error
    return examRowToClient(data)
  },

  async listExams(userId) {
    const { data, error } = await supabaseAdmin
      .from('exams')
      .select('*')
      .eq('teacher_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map(examRowToClient)
  },

  async getExamForStudent(examId) {
    const { data, error } = await supabaseAdmin.from('exams').select('*').eq('id', examId).maybeSingle()
    if (error) throw error
    if (!data) throw new AppError('Exam not found', 404)
    if (data.status === 'closed') {
      throw new AppError('এই পরীক্ষাটি বন্ধ হয়ে গেছে', 403)
    }
    const exam = examRowToClient(data)
    const safeQuestions = (exam.questions || []).map((q) => {
      const { correct_answer, answer, ...safeQ } = q
      return safeQ
    })
    return { ...exam, questions: safeQuestions }
  },

  async submitExam(examId, submissionData) {
    const { studentName, studentRoll, answers } = submissionData

    const { data: row, error } = await supabaseAdmin.from('exams').select('*').eq('id', examId).maybeSingle()
    if (error) throw error
    if (!row) throw new AppError('Exam not found', 404)
    const exam = examRowToClient(row)

    let score = 0
    let totalPossible = 0
    const gradedAnswers = (exam.questions || []).map((q) => {
      const isMcq = q.type === 'MCQ'
      let isCorrect = false
      let studentAns = answers[q.id]

      if (isMcq) {
        isCorrect = studentAns === q.correct_answer
        if (isCorrect) score += Number(q.marks || 1)
        totalPossible += Number(q.marks || 1)
        return {
          questionId: q.id,
          type: 'MCQ',
          answer: studentAns,
          isCorrect,
          correctAnswer: q.correct_answer,
        }
      }
      if (q.sub_questions) {
        const subAnswers = {}
        q.sub_questions.forEach((sq) => {
          subAnswers[sq.label] = answers[`${q.id}_${sq.label}`]
          totalPossible += Number(sq.marks || 1)
        })
        return {
          questionId: q.id,
          type: 'CQ',
          answers: subAnswers,
        }
      }
      totalPossible += Number(q.marks || 1)
      return {
        questionId: q.id,
        type: q.type,
        answer: studentAns,
      }
    })

    const result = {
      examId,
      studentName: studentName || 'অজ্ঞাতনামা',
      studentRoll: studentRoll || 'N/A',
      responses: gradedAnswers,
      score,
      totalPossible,
      submittedAt: new Date().toISOString(),
    }
    cleanUndefined(result)

    const { data: sub, error: subErr } = await supabaseAdmin
      .from('exam_submissions')
      .insert({ exam_id: examId, body: result })
      .select()
      .single()
    if (subErr) throw subErr

    return { id: sub.id, ...result }
  },

  async getExamResults(teacherId, examId) {
    const { data: exam, error } = await supabaseAdmin.from('exams').select('*').eq('id', examId).maybeSingle()
    if (error) throw error
    if (!exam) throw new AppError('Exam not found', 404)
    if (exam.teacher_id !== teacherId) throw new AppError('Access denied', 403)

    const { data: subs, error: sErr } = await supabaseAdmin
      .from('exam_submissions')
      .select('*')
      .eq('exam_id', examId)
      .order('created_at', { ascending: false })
    if (sErr) throw sErr

    return (subs || []).map((r) => ({ id: r.id, ...r.body }))
  },
}

module.exports = examService
