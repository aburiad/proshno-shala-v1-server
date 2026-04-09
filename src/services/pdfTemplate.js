/**
 * PDF HTML Template Generator
 * Generates A4 Bengali exam paper HTML for Puppeteer PDF rendering.
 */

// ── Chemistry auto-subscript ────────────────────────────────────────
function chemSubscript(text) {
  if (!text) return ''
  return text.replace(/([A-Z][a-z]?)(\d+)/g, '$1<sub>$2</sub>')
}

// ── Escape HTML ─────────────────────────────────────────────────────
function esc(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Question renderers ─────────────────────────────────────────────

function renderMCQ(q, num) {
  const opts = ['a', 'b', 'c', 'd']
    .map((k) => {
      const text = chemSubscript(esc(q[`option_${k}`] || ''))
      return `<span class="mcq-opt">${k}) ${text}</span>`
    })
    .join('')

  return `
    <div class="question">
      <div class="q-head">
        <span class="q-num">${num}.</span>
        <span class="q-text">${chemSubscript(esc(q.question))}</span>
        <span class="q-marks">${q.marks || ''}</span>
      </div>
      <div class="mcq-options">${opts}</div>
    </div>`
}

function renderCQ(q, num) {
  const subs = (q.sub_questions || [])
    .map(
      (s) => `
      <div class="cq-sub">
        <span class="cq-label">${esc(s.label)})</span>
        <span>${chemSubscript(esc(s.text))}</span>
        <span class="q-marks">${s.marks || ''}</span>
      </div>`
    )
    .join('')

  const totalMarks = (q.sub_questions || []).reduce(
    (s, sq) => s + (Number(sq.marks) || 0),
    0
  )

  return `
    <div class="question">
      <div class="q-head">
        <span class="q-num">${num}.</span>
        <span class="q-marks">${totalMarks || ''}</span>
      </div>
      ${q.stimulus ? `<div class="cq-stimulus">${chemSubscript(esc(q.stimulus))}</div>` : ''}
      <div class="cq-subs">${subs}</div>
    </div>`
}

function renderShort(q, num) {
  return `
    <div class="question">
      <div class="q-head">
        <span class="q-num">${num}.</span>
        <span class="q-text">${chemSubscript(esc(q.question))}</span>
        <span class="q-marks">${q.marks || ''}</span>
      </div>
    </div>`
}

function renderBroad(q, num) {
  return renderShort(q, num)
}

function renderFillBlank(q, num) {
  const sentence = esc(q.sentence || '').replace(/___/g, '<span class="blank">______</span>')
  let html = `
    <div class="question">
      <div class="q-head">
        <span class="q-num">${num}.</span>
        <span class="q-text">${chemSubscript(sentence)}</span>
        <span class="q-marks">${q.marks || ''}</span>
      </div>`
  if (q.clues) {
    html += `<div class="q-clues">[সূত্র: ${esc(q.clues)}]</div>`
  }
  html += '</div>'
  return html
}

function renderMatching(q, num) {
  const colA = q.column_a || []
  const colB = q.column_b || []
  const maxLen = Math.max(colA.length, colB.length)

  let rows = ''
  for (let i = 0; i < maxLen; i++) {
    rows += `<tr>
      <td>${esc(colA[i] || '')}</td>
      <td>${esc(colB[i] || '')}</td>
    </tr>`
  }

  return `
    <div class="question">
      <div class="q-head">
        <span class="q-num">${num}.</span>
        ${q.question ? `<span class="q-text">${esc(q.question)}</span>` : ''}
        <span class="q-marks">${q.marks || ''}</span>
      </div>
      <table class="match-table">
        <thead><tr><th>বাম পাশ</th><th>ডান পাশ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

function renderRearranging(q, num) {
  const items = (q.sentences || [])
    .map((s, i) => `<li>${esc(s)}</li>`)
    .join('')

  return `
    <div class="question">
      <div class="q-head">
        <span class="q-num">${num}.</span>
        ${q.question ? `<span class="q-text">${esc(q.question)}</span>` : ''}
        <span class="q-marks">${q.marks || ''}</span>
      </div>
      <ol class="rearrange-list">${items}</ol>
    </div>`
}

function renderTranslation(q, num) {
  const dirLabel =
    q.direction === 'en-bn' ? 'English → বাংলা' : 'বাংলা → English'

  return `
    <div class="question">
      <div class="q-head">
        <span class="q-num">${num}.</span>
        <span class="q-text">${dirLabel} অনুবাদ করো:</span>
        <span class="q-marks">${q.marks || ''}</span>
      </div>
      <div class="translation-box">${esc(q.source_text)}</div>
    </div>`
}

function renderTable(q, num) {
  const headers = (q.headers || [])
    .map((h) => `<th>${esc(h)}</th>`)
    .join('')
  const rows = (q.rows || [])
    .map(
      (row) =>
        '<tr>' + row.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>'
    )
    .join('')

  return `
    <div class="question">
      <div class="q-head">
        <span class="q-num">${num}.</span>
        ${q.question ? `<span class="q-text">${chemSubscript(esc(q.question))}</span>` : ''}
        <span class="q-marks">${q.marks || ''}</span>
      </div>
      <table class="data-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

const RENDERERS = {
  MCQ: renderMCQ,
  CQ: renderCQ,
  short: renderShort,
  broad: renderBroad,
  fill_blank: renderFillBlank,
  matching: renderMatching,
  rearranging: renderRearranging,
  translation: renderTranslation,
  table: renderTable,
}

// ── Build full HTML ─────────────────────────────────────────────────

function buildPaperHTML(paper, options = {}) {
  const {
    institution_name = '',
    exam_title = '',
    session_year = '',
    subject = '',
    time_minutes = 0,
    total_marks = 0,
    header_alignment = 'center',
    layout = '1-column',
    watermark = null,
    set_variant = null,
    logo_url = null,
  } = paper

  const {
    font = 'Hind Siliguri',
    size = '12pt',
    spacing = '1.6',
    questions = paper.questions || []
  } = options

  // Render all questions
  let questionsHTML = ''
  questions.forEach((q, i) => {
    const renderer = RENDERERS[q.type]
    if (renderer) {
      questionsHTML += renderer(q, i + 1)
    }
  })

  // Info parts
  const infoParts = []
  if (subject) infoParts.push(`<span>বিষয়: ${esc(subject)}</span>`)
  if (time_minutes) infoParts.push(`<span>সময়: ${time_minutes} মিনিট</span>`)
  if (total_marks) infoParts.push(`<span>পূর্ণমান: ${total_marks}</span>`)
  if (set_variant) infoParts.push(`<span>সেট: ${set_variant}</span>`)
  const infoHTML = infoParts.join('')

  // Watermark
  const watermarkHTML = watermark
    ? `<div class="watermark">${esc(watermark)}</div>`
    : ''

  // Logo
  const logoHTML = logo_url
    ? `<img class="header-logo" src="${logo_url}" alt="Logo" />`
    : ''

  // Format font-family string safely based on user choice
  let fontFamilyString = "'Hind Siliguri', 'Noto Sans Bengali', sans-serif"
  if (font === 'Noto Sans Bengali') {
    fontFamilyString = "'Noto Sans Bengali', sans-serif"
  } else if (font === 'Noto Serif Bengali') {
    fontFamilyString = "'Noto Serif Bengali', serif"
  }

  return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="UTF-8" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@400;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  @page {
    size: A4;
    margin: 15mm 12mm 15mm 12mm;
  }

  body {
    font-family: ${fontFamilyString};
    font-size: ${size};
    line-height: ${spacing};
    color: #1a1a1a;
    position: relative;
  }

  /* ── Header ── */
  .paper-header {
    text-align: ${header_alignment};
    border-bottom: 2px solid #333;
    padding-bottom: 8px;
    margin-bottom: 14px;
    position: relative;
  }
  .header-logo {
    position: absolute;
    top: 0;
    right: 0;
    max-width: 80px;
    max-height: 80px;
    object-fit: contain;
  }
  .institution-name {
    font-size: 16pt;
    font-weight: 700;
  }
  .exam-title {
    font-size: 13pt;
    font-weight: 600;
    margin-top: 2px;
  }
  .session {
    font-size: 10pt;
    color: #555;
    margin-top: 2px;
  }
  .info-line {
    font-size: 10pt;
    color: #333;
    margin-top: 6px;
    display: flex;
    justify-content: space-between;
  }

  /* ── Questions ── */
  .questions-body {
    ${layout === '2-column' ? 'columns: 2; column-gap: 20px;' : ''}
  }
  .question {
    break-inside: avoid;
    margin-bottom: 14px;
    ${layout === '2-column' ? 'break-inside: avoid-column;' : ''}
  }
  .q-head {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 4px;
  }
  .q-num {
    font-weight: 700;
    min-width: 22px;
  }
  .q-text {
    flex: 1;
  }
  .q-marks {
    font-size: 10pt;
    color: #555;
    white-space: nowrap;
    margin-left: auto;
  }
  .q-marks::before { content: '['; }
  .q-marks::after { content: ']'; }
  .q-clues {
    font-size: 10pt;
    color: #666;
    margin-top: 2px;
    padding-left: 28px;
  }

  /* ── MCQ ── */
  .mcq-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 16px;
    padding-left: 28px;
    font-size: 11pt;
  }
  .mcq-opt { padding: 1px 0; }

  /* ── CQ ── */
  .cq-stimulus {
    padding: 6px 10px;
    margin: 4px 0 8px 28px;
    border-left: 3px solid #888;
    font-size: 11pt;
    color: #333;
    background: #fafafa;
  }
  .cq-subs { padding-left: 28px; }
  .cq-sub {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 3px;
  }
  .cq-label {
    font-weight: 600;
    min-width: 18px;
  }

  /* ── Fill blank ── */
  .blank {
    display: inline-block;
    min-width: 60px;
    border-bottom: 1px solid #333;
  }

  /* ── Matching + data table ── */
  .match-table, .data-table {
    width: 90%;
    margin: 6px 0 0 28px;
    border-collapse: collapse;
    font-size: 11pt;
  }
  .match-table th, .match-table td,
  .data-table th, .data-table td {
    border: 1px solid #888;
    padding: 4px 8px;
    text-align: left;
  }
  .match-table th, .data-table th {
    background: #f0f0f0;
    font-weight: 600;
  }

  /* ── Rearrange ── */
  .rearrange-list {
    padding-left: 48px;
    margin-top: 4px;
    font-size: 11pt;
  }
  .rearrange-list li { margin-bottom: 2px; }

  /* ── Translation ── */
  .translation-box {
    margin: 6px 0 0 28px;
    padding: 6px 10px;
    border: 1px solid #ccc;
    font-size: 11pt;
  }

  /* ── Watermark ── */
  .watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 60pt;
    color: rgba(0, 0, 0, 0.06);
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
    z-index: 0;
  }
</style>
</head>
<body>
  ${watermarkHTML}

  <div class="paper-header">
    ${logoHTML}
    ${institution_name ? `<div class="institution-name">${esc(institution_name)}</div>` : ''}
    ${exam_title ? `<div class="exam-title">${esc(exam_title)}</div>` : ''}
    ${session_year ? `<div class="session">${esc(session_year)}</div>` : ''}
    ${infoHTML ? `<div class="info-line">${infoHTML}</div>` : ''}
  </div>

  <div class="questions-body">
    ${questionsHTML}
  </div>
</body>
</html>`
}

module.exports = { buildPaperHTML, chemSubscript }
