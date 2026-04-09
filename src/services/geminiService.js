const { GoogleGenerativeAI } = require('@google/generative-ai')
const { AppError } = require('../middleware/errorHandler')

// Use same model as before for vision; override via GEMINI_MODEL if needed (e.g. gemini-2.0-flash).
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'

let cachedGenAI = null

function getGenAI() {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    throw new AppError('Gemini API কী সেট করা নেই।', 503)
  }
  if (!cachedGenAI) {
    cachedGenAI = new GoogleGenerativeAI(key)
  }
  return cachedGenAI
}

function getResponseText(response) {
  if (typeof response.text === 'function') {
    try {
      const t = response.text()
      if (t) return t
    } catch (e) {
      // blocked/empty — try parts
    }
  }
  const parts = response.candidates?.[0]?.content?.parts
  if (parts?.length) {
    return parts.map((p) => p.text).filter(Boolean).join('')
  }
  return ''
}

/**
 * Gemini often wraps JSON in markdown or adds prose; normalize to a question array.
 */
function parseQuestionsJson(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Empty model response')
  }
  let cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch (_) {
    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start !== -1 && end > start) {
      const slice = cleaned.slice(start, end + 1)
      const parsed = JSON.parse(slice)
      return Array.isArray(parsed) ? parsed : [parsed]
    }
  }
  throw new Error('Could not parse JSON array from model output')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableGeminiScanError(err) {
  const msg = err ? String(err.message || err) : ''
  if (msg.includes('Could not parse') || msg.includes('Empty model response')) return true
  if (msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED')) return true
  if (msg.includes('UNAVAILABLE') || msg.includes('DEADLINE') || msg.includes('ETIMEDOUT')) return true
  if (msg.includes('ECONNRESET') || msg.includes('fetch failed') || msg.includes('socket hang up')) return true
  return false
}

/**
 * Extract questions directly from an image using Gemini (Vision + Structuring).
 */
async function scanImage(base64Image, mimeType = 'image/jpeg') {
  if (!base64Image) {
    throw new Error('Image data is missing')
  }

  const genAI = getGenAI()
  const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL })

  const prompt = `
You are an expert exam paper digitizer. Extract all questions from the provided image of a Bengali question paper and convert them into a structured JSON array.

### SCHEMA PER QUESTION TYPE:
1. MCQ: { type: 'MCQ', question, option_a, option_b, option_c, option_d, correct_answer, marks, confidence: 0.0-1.0 }
2. CQ (Creative): { type: 'CQ', stimulus, sub_questions: [{ label: 'ক', text, marks }], confidence: 0.0-1.0 }
3. Short Answer: { type: 'short', question, marks, confidence: 0.0-1.0 }
4. Broad/Essay: { type: 'broad', question, marks, confidence: 0.0-1.0 }
5. Fill in Blank: { type: 'fill_blank', sentence (use ___ for blanks), clues (optional), marks, confidence: 0.0-1.0 }
6. Matching: { type: 'matching', column_a: [], column_b: [], marks, confidence: 0.0-1.0 }
7. Rearranging: { type: 'rearranging', sentences: [], marks, confidence: 0.0-1.0 }
8. Translation: { type: 'translation', source_text, direction: 'en-bn'|'bn-en', marks, confidence: 0.0-1.0 }

### INSTRUCTIONS:
- Language: Bengali (Unicode)
- Output: ONLY a valid JSON array. No markdown, no prose.
- Confidence: Assign a confidence score (0.0 to 1.0) based on how clear the text was in the image.
- Logic: If a question spans multiple lines, join them. If multiple sub-questions belong to one stimulus, group them into a single 'CQ' object.
- Default marks: If not found, use logical defaults (MCQ=1, CQ=10, others=Vary).
- Precision: Ensure all text is extracted exactly as written.
`

  const parts = [
    prompt,
    {
      inlineData: {
        data: base64Image.replace(/^data:image\/\w+;base64,/, ''),
        mimeType,
      },
    },
  ]

  let lastErr
  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await model.generateContent(parts)
      const response = await result.response
      const text = getResponseText(response)
      const questions = parseQuestionsJson(text)
      return {
        questions,
        count: questions.length,
      }
    } catch (err) {
      lastErr = err
      console.error(`Gemini Vision Scan Error (attempt ${attempt + 1}/${maxAttempts}):`, err)
      const retry = attempt < maxAttempts - 1 && isRetryableGeminiScanError(err)
      if (!retry) break
      await sleep(800 * (attempt + 1))
    }
  }

  console.error('Gemini Vision Scan failed after retries:', lastErr)
  throw new Error('ব্যর্থ হয়েছে (Gemini vision scan failed)')
}

/**
 * Generate questions from book chapter question_points using Gemini.
 */
async function generateFromBook(chapterContext, config = {}) {
  const { subject = '', classNum = 0, questionTypes = ['MCQ'], count = 5 } = config

  const SUBJECTS_BN = {
    bangla: 'বাংলা',
    english: 'English',
    math: 'গণিত',
    science: 'বিজ্ঞান',
    accounting: 'হিসাববিজ্ঞান',
  }
  const subjectBn = SUBJECTS_BN[subject] || subject

  const typeInstructions = questionTypes
    .map((t) => {
      switch (t) {
        case 'MCQ':
          return 'MCQ: { type: "MCQ", question, option_a, option_b, option_c, option_d, correct_answer, marks: 1 }'
        case 'CQ':
          return 'CQ (Creative): { type: "CQ", stimulus, sub_questions: [{ label: "ক", text, marks }] }'
        case 'short':
          return 'Short Answer: { type: "short", question, marks: 2 }'
        case 'broad':
          return 'Broad/Essay: { type: "broad", question, marks: 5 }'
        case 'fill_blank':
          return 'Fill in Blank: { type: "fill_blank", sentence (use ___ for blanks), clues, marks: 1 }'
        case 'matching':
          return 'Matching: { type: "matching", question, column_a: [], column_b: [], marks: 5 }'
        default:
          return ''
      }
    })
    .filter(Boolean)
    .join('\n')

  const prompt = `
তুমি একজন বাংলাদেশের অভিজ্ঞ শিক্ষক। নিচে ক্লাস ${classNum} এর ${subjectBn} বিষয়ের পাঠ্যবই থেকে নেওয়া গুরুত্বপূর্ণ তথ্য দেওয়া হলো।

এই তথ্যগুলো ব্যবহার করে ঠিক ${count} টি প্রশ্ন তৈরি করো।

### চ্যাপ্টার তথ্য:
${chapterContext}

### প্রশ্নের ধরন ও JSON ফরম্যাট:
${typeInstructions}

### নিয়ম:
- ভাষা: বাংলা (Unicode)
- Output: শুধুমাত্র একটি valid JSON array দাও। কোনো markdown, কোনো ব্যাখ্যা দেওয়া যাবে না।
- প্রশ্নগুলো যেন পাঠ্যবইয়ের তথ্যের বাইরে না যায়।
- MCQ-তে সঠিক উত্তর correct_answer ফিল্ডে দাও।
- CQ-তে stimulus দাও এবং ক, খ, গ, ঘ সাব-প্রশ্ন দাও।
- প্রশ্নগুলো Bloom's Taxonomy (জ্ঞানমূলক, অনুধাবনমূলক, প্রয়োগমূলক) মিশ্রণে হওয়া উচিত।
- প্রতিটি প্রশ্ন ইউনিক এবং বোর্ড পরীক্ষার মানসম্পন্ন হতে হবে।
`

  const genAI = getGenAI()
  const bookModel = genAI.getGenerativeModel({
    model: DEFAULT_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.6,
    },
  })

  async function run(model) {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = getResponseText(response)
    if (!text) {
      throw new Error('Empty Gemini response')
    }
    return parseQuestionsJson(text)
  }

  try {
    const questions = await run(bookModel)
    return { questions }
  } catch (err) {
    console.error('Gemini Book Generation Error:', err)
    // Fallback: same model without JSON mode (older APIs / strict prompts sometimes fail)
    try {
      const plainModel = genAI.getGenerativeModel({
        model: DEFAULT_MODEL,
        generationConfig: { temperature: 0.6 },
      })
      const questions = await run(plainModel)
      return { questions }
    } catch (err2) {
      console.error('Gemini Book Generation fallback failed:', err2)
      throw new AppError('বই থেকে প্রশ্ন তৈরি করতে ব্যর্থ হয়েছে। Gemini আউটপুট পার্স করতে পারিনি বা API ত্রুটি।', 502)
    }
  }
}

module.exports = { scanImage, generateFromBook }
