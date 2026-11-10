import { resolve, analyzeRequest } from './advisor.js'

export function splitText(text, maxSlides) {
  const blocks = []
  let current = null
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      if (current) { blocks.push(current); current = null }
      continue
    }
    if (line.startsWith('#')) {
      if (current) blocks.push(current)
      current = { title: line.replace(/^#+\s*/, ''), bullets: [] }
    } else if (!current) {
      current = { title: line.slice(0, 200), bullets: [] }
    } else {
      current.bullets.push(line.replace(/^[-*•]\s*/, '').slice(0, 500))
    }
  }
  if (current) blocks.push(current)

  while (blocks.length > Math.max(maxSlides, 1)) {
    let idx = 0
    let best = Infinity
    for (let i = 0; i < blocks.length - 1; i++) {
      const score = blocks[i].bullets.length + blocks[i + 1].bullets.length
      if (score < best) { best = score; idx = i }
    }
    blocks[idx].bullets.push(blocks[idx + 1].title, ...blocks[idx + 1].bullets)
    blocks.splice(idx + 1, 1)
  }

  return blocks.map((b) => ({ title: b.title, bullets: b.bullets.slice(0, 30) }))
}

export function buildOutline(data) {
  const ctx = analyzeRequest(data)
  const structured = [...(data.slides || [])]
  let generated = []
  if (data.text) {
    const remaining = Math.max(data.slides_count - structured.length, 1)
    generated = splitText(data.text, remaining)
  }
  const outline = [...structured, ...generated].map((slide, index) => resolve(slide, ctx, index))
  return applySlideOrder(outline, data.slide_order)
}

function applySlideOrder(outline, slideOrder) {
  if (!Array.isArray(slideOrder) || slideOrder.length === 0) return outline
  const remaining = [...outline]
  const ordered = []
  for (const title of slideOrder) {
    const index = remaining.findIndex((slide) => slide.title === title)
    if (index >= 0) ordered.push(remaining.splice(index, 1)[0])
  }
  return [...ordered, ...remaining]
}
