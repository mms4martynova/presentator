import { jsPDF } from 'jspdf'

const THEMES = {
  default: {
    colors: { primary: [37, 99, 235], dark: [15, 23, 42], light: [248, 250, 252], accent: [59, 130, 246], text: [51, 65, 85], muted: [100, 116, 139] },
    font: 'DejaVuSans',
  },
  corporate: {
    colors: { primary: [30, 58, 95], dark: [15, 23, 42], light: [241, 245, 249], accent: [43, 108, 176], text: [51, 65, 85], muted: [100, 116, 139] },
    font: 'DejaVuSans',
  },
  dark: {
    colors: { primary: [59, 130, 246], dark: [15, 23, 42], light: [30, 41, 59], accent: [96, 165, 250], text: [226, 232, 240], muted: [148, 163, 184] },
    font: 'DejaVuSans',
  },
  warm: {
    colors: { primary: [180, 83, 9], dark: [28, 25, 23], light: [254, 243, 199], accent: [217, 119, 6], text: [68, 64, 60], muted: [120, 113, 108] },
    font: 'DejaVuSans',
  },
  forest: {
    colors: { primary: [21, 128, 61], dark: [5, 46, 22], light: [236, 253, 245], accent: [34, 197, 94], text: [31, 41, 55], muted: [107, 114, 128] },
    font: 'DejaVuSans',
  },
}

const SLIDE_W = 297
const SLIDE_H = 190
const MARGIN = 18

function rgb(arr) {
  return { r: arr[0], g: arr[1], b: arr[2] }
}

function setFill(doc, color) {
  const c = rgb(color)
  doc.setFillColor(c.r, c.g, c.b)
}

function setText(doc, color) {
  const c = rgb(color)
  doc.setTextColor(c.r, c.g, c.b)
}

function setDraw(doc, color) {
  const c = rgb(color)
  doc.setDrawColor(c.r, c.g, c.b)
}

function addBackground(doc, theme) {
  setFill(doc, theme.colors.light)
  doc.rect(0, 0, SLIDE_W, SLIDE_H, 'F')
}

function addTitleSlide(doc, title, theme, visualAdvisor) {
  const c = theme.colors
  setFill(doc, visualAdvisor ? [226, 232, 240] : c.dark)
  doc.rect(0, 0, SLIDE_W, SLIDE_H, 'F')
  if (visualAdvisor) {
    setFill(doc, [203, 213, 225])
    doc.rect(0, 0, SLIDE_W, SLIDE_H, 'F')
    setFill(doc, c.primary)
    doc.setGState(new doc.GState({ opacity: 0.08 }))
    doc.rect(0, 0, SLIDE_W, SLIDE_H, 'F')
    doc.setGState(new doc.GState({ opacity: 1 }))
    setFill(doc, c.primary)
    doc.roundedRect(SLIDE_W - 42, 10, 24, 9, 2, 2, 'F')
    setText(doc, [255, 255, 255])
    doc.setFont(theme.font, 'bold')
    doc.setFontSize(11)
    doc.text('AI', SLIDE_W - 30, 16, { align: 'center' })
  }

  setText(doc, visualAdvisor ? c.dark : [255, 255, 255])
  doc.setFont(theme.font, 'bold')
  doc.setFontSize(32)
  const lines = doc.splitTextToSize(title, SLIDE_W - 2 * MARGIN)
  doc.text(lines, visualAdvisor ? SLIDE_W / 2 : MARGIN, 70, visualAdvisor ? { align: 'center' } : undefined)

  setFill(doc, c.primary)
  doc.rect(visualAdvisor ? (SLIDE_W - 60) / 2 : MARGIN, 70 + lines.length * 12 + 6, 60, 1.5, 'F')
}

function addSlideHeader(doc, spec, theme) {
  const c = theme.colors
  if (spec.visualAdvisor) {
    setFill(doc, c.primary)
    doc.roundedRect(SLIDE_W - 42, 10, 24, 9, 2, 2, 'F')
    setText(doc, [255, 255, 255])
    doc.setFont(theme.font, 'bold')
    doc.setFontSize(11)
    doc.text('AI', SLIDE_W - 30, 16, { align: 'center' })
  }
  setText(doc, c.dark)
  doc.setFont(theme.font, 'bold')
  doc.setFontSize(22)
  const lines = doc.splitTextToSize(spec.title, SLIDE_W - 2 * MARGIN)
  doc.text(lines, MARGIN, 18)

  setFill(doc, c.primary)
  doc.rect(MARGIN, 18 + lines.length * 9 + 2, 40, 1, 'F')
}

function addPageNumber(doc, number, theme) {
  setText(doc, theme.colors.muted)
  doc.setFont(theme.font, 'normal')
  doc.setFontSize(9)
  doc.text(String(number), SLIDE_W - MARGIN, SLIDE_H - 8, { align: 'right' })
}

function drawTextSlide(doc, spec, theme, yStart) {
  const c = theme.colors
  const items = spec.bullets || []
  if (items.length === 0) return

  const totalLen = items.reduce((sum, item) => sum + item.length, 0)
  let fontSize = 20
  if (totalLen > 900) fontSize = 12
  else if (totalLen > 600) fontSize = 14
  else if (totalLen > 400) fontSize = 16
  else if (totalLen > 250) fontSize = 18

  doc.setFont(theme.font, 'normal')
  doc.setFontSize(fontSize)
  setText(doc, c.text)

  const maxW = SLIDE_W - 2 * MARGIN - 8
  let y = yStart
  for (const item of items) {
    doc.text(spec.iconBullets?.[items.indexOf(item)] || '\u2022', MARGIN, y)
    const wrapped = doc.splitTextToSize(item, maxW)
    doc.text(wrapped, MARGIN + 8, y)
    y += wrapped.length * (fontSize * 0.5 + 4) + 4
    if (y > SLIDE_H - MARGIN) break
  }
}

function drawTableSlide(doc, spec, theme, yStart) {
  const c = theme.colors
  const data = spec.table
  const cols = data.headers.length
  const colW = (SLIDE_W - 2 * MARGIN) / cols
  const rowH = 10
  const rows = data.rows.length + 1
  let fontSize = 12
  if (rows > 12) fontSize = 9
  else if (rows > 8) fontSize = 10

  let y = yStart
  doc.setFont(theme.font, 'bold')
  doc.setFontSize(fontSize)

  setFill(doc, c.primary)
  doc.rect(MARGIN, y - 6, SLIDE_W - 2 * MARGIN, rowH, 'F')
  setText(doc, [255, 255, 255])
  data.headers.forEach((h, i) => {
    doc.text(doc.splitTextToSize(String(h), colW - 4), MARGIN + i * colW + 2, y)
  })
  y += rowH

  doc.setFont(theme.font, 'normal')
  setText(doc, c.text)
  for (const row of data.rows) {
    setFill(doc, [255, 255, 255])
    doc.rect(MARGIN, y - 6, SLIDE_W - 2 * MARGIN, rowH, 'F')
    setDraw(doc, [203, 213, 225])
    doc.setLineWidth(0.3)
    doc.rect(MARGIN, y - 6, SLIDE_W - 2 * MARGIN, rowH)
    row.forEach((cell, i) => {
      doc.text(doc.splitTextToSize(String(cell), colW - 4), MARGIN + i * colW + 2, y)
    })
    y += rowH
    if (y > SLIDE_H - MARGIN) break
  }
}

function drawChartSlide(doc, spec, theme, yStart) {
  const c = theme.colors
  const data = spec.chart
  const chartX = MARGIN
  const chartY = yStart
  const chartW = SLIDE_W - 2 * MARGIN
  const chartH = SLIDE_H - yStart - MARGIN

  const values = data.series.flatMap((s) => s.values)
  const maxVal = Math.max(...values, 0)
  const minVal = Math.min(...values, 0)
  const range = maxVal - minVal || 1

  if (data.kind === 'pie') {
    const total = data.series[0].values.reduce((a, b) => a + b, 0) || 1
    const cx = chartX + chartW / 2
    const cy = chartY + chartH / 2
    const radius = Math.min(chartW, chartH) / 2 - 10
    const palette = [c.primary, c.accent, c.muted, [148, 163, 184], [167, 139, 250], [251, 146, 60]]
    let startAngle = 0
    data.categories.forEach((cat, i) => {
      const val = data.series[0].values[i] || 0
      const angle = (val / total) * 2 * Math.PI
      setFill(doc, palette[i % palette.length])
      doc.ellipse(cx, cy, radius, radius, startAngle, startAngle + angle, 'F')
      startAngle += angle
    })
    setText(doc, c.text)
    doc.setFontSize(10)
    data.categories.forEach((cat, i) => {
      doc.text(`${cat}: ${data.series[0].values[i] || 0}`, chartX, chartY + chartH - 4 + i * 0)
    })
  } else {
    const plotH = chartH - 20
    const plotY = chartY
    const zeroY = plotY + plotH * (maxVal / range)
    const cats = data.categories
    const stepX = chartW / cats.length

    setDraw(doc, c.muted)
    doc.setLineWidth(0.3)
    doc.line(chartX, zeroY, chartX + chartW, zeroY)

    setText(doc, c.muted)
    doc.setFontSize(9)
    doc.setFont(theme.font, 'normal')
    cats.forEach((cat, i) => {
      doc.text(String(cat), chartX + i * stepX + stepX / 2, chartY + chartH + 2, { align: 'center' })
    })

    const palette = [c.primary, c.accent, c.muted, [148, 163, 184]]
    if (data.kind === 'line') {
      data.series.forEach((s, si) => {
        setDraw(doc, palette[si % palette.length])
        doc.setLineWidth(1.5)
        for (let i = 0; i < cats.length - 1; i++) {
          const x1 = chartX + i * stepX + stepX / 2
          const x2 = chartX + (i + 1) * stepX + stepX / 2
          const y1 = zeroY - (s.values[i] / range) * plotH
          const y2 = zeroY - (s.values[i + 1] / range) * plotH
          doc.line(x1, y1, x2, y2)
        }
      })
    } else {
      const barW = stepX / (data.series.length + 1)
      data.series.forEach((s, si) => {
        setFill(doc, palette[si % palette.length])
        s.values.forEach((val, i) => {
          const x = chartX + i * stepX + si * barW + stepX / 4
          const h = (val / range) * plotH
          const y = val >= 0 ? zeroY - h : zeroY
          doc.rect(x, y, barW - 1, Math.abs(h), 'F')
        })
      })
    }

    if (data.series.length > 1 || data.kind === 'line') {
      setText(doc, c.text)
      doc.setFontSize(9)
      data.series.forEach((s, i) => {
        const lx = chartX + chartW - 50
        const ly = chartY + 4 + i * 8
        setFill(doc, palette[i % palette.length])
        doc.rect(lx, ly - 3, 4, 3, 'F')
        setText(doc, c.text)
        doc.text(s.name, lx + 6, ly)
      })
    }
  }
}

function drawComparisonSlide(doc, spec, theme, yStart) {
  const c = theme.colors
  const data = spec.comparison
  const gap = 8
  const colW = (SLIDE_W - 2 * MARGIN - gap) / 2
  const leftX = MARGIN
  const rightX = leftX + colW + gap

  setFill(doc, c.primary)
  doc.rect(leftX, yStart - 6, colW, 10, 'F')
  setText(doc, [255, 255, 255])
  doc.setFont(theme.font, 'bold')
  doc.setFontSize(16)
  doc.text(doc.splitTextToSize(data.left_title, colW - 4), leftX + 2, yStart)

  setFill(doc, c.accent)
  doc.rect(rightX, yStart - 6, colW, 10, 'F')
  doc.text(doc.splitTextToSize(data.right_title, colW - 4), rightX + 2, yStart)

  let leftY = yStart + 14
  let rightY = yStart + 14
  doc.setFont(theme.font, 'normal')
  doc.setFontSize(14)
  setText(doc, c.text)

  for (const item of data.left_items || []) {
    doc.text('\u2022', leftX, leftY)
    const wrapped = doc.splitTextToSize(item, colW - 8)
    doc.text(wrapped, leftX + 6, leftY)
    leftY += wrapped.length * 8 + 3
  }
  for (const item of data.right_items || []) {
    doc.text('\u2022', rightX, rightY)
    const wrapped = doc.splitTextToSize(item, colW - 8)
    doc.text(wrapped, rightX + 6, rightY)
    rightY += wrapped.length * 8 + 3
  }
}

function drawImageSlide(doc, spec, theme, yStart) {
  const base64 = spec.image.base64
  const maxW = SLIDE_W - 2 * MARGIN
  const maxH = SLIDE_H - yStart - MARGIN
  try {
    doc.addImage(`data:image/png;base64,${base64}`, 'PNG', MARGIN, yStart, maxW, maxH, undefined, 'FAST')
  } catch {
    setText(doc, theme.colors.muted)
    doc.setFontSize(14)
    doc.text('Изображение недоступно для предпросмотра', MARGIN, yStart + 10)
  }
}

async function loadFont(doc, url, fileName, style) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Не удалось загрузить шрифт: ${url}`)
  const buffer = await response.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  doc.addFileToVFS(fileName, btoa(binary))
  doc.addFont(fileName, 'DejaVuSans', style)
}

export async function buildPdf(title, slides, themeKey) {
  const visualAdvisor = slides.some((slide) => slide.visualAdvisor)
  const theme = THEMES[visualAdvisor ? 'corporate' : themeKey] || THEMES.default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [SLIDE_W, SLIDE_H] })
  await loadFont(doc, '/fonts/DejaVuSans.ttf', 'DejaVuSans.ttf', 'normal')
  await loadFont(doc, '/fonts/DejaVuSans-Bold.ttf', 'DejaVuSans-Bold.ttf', 'bold')

  addTitleSlide(doc, title, theme, visualAdvisor)
  addPageNumber(doc, 1, theme)

  for (const [index, spec] of slides.entries()) {
    doc.addPage()
    addBackground(doc, theme)
    addSlideHeader(doc, spec, theme)
    addPageNumber(doc, index + 2, theme)

    const yStart = 36
    if (spec.type === 'text') drawTextSlide(doc, spec, theme, yStart)
    else if (spec.type === 'table') drawTableSlide(doc, spec, theme, yStart)
    else if (spec.type === 'chart') drawChartSlide(doc, spec, theme, yStart)
    else if (spec.type === 'comparison') drawComparisonSlide(doc, spec, theme, yStart)
    else if (spec.type === 'image') drawImageSlide(doc, spec, theme, yStart)
  }

  return doc.output('blob')
}
