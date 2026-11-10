import pptxgen from 'pptxgenjs'

const THEMES = {
  default: {
    name: 'Стандартная',
    colors: { primary: '2563EB', dark: '0F172A', light: 'F8FAFC', accent: '3B82F6', text: '334155', muted: '64748B' },
    font: 'Segoe UI',
  },
  corporate: {
    name: 'Корпоративная',
    colors: { primary: '1E3A5F', dark: '0F172A', light: 'F1F5F9', accent: '2B6CB0', text: '334155', muted: '64748B' },
    font: 'Segoe UI',
  },
  dark: {
    name: 'Тёмная',
    colors: { primary: '3B82F6', dark: '0F172A', light: '1E293B', accent: '60A5FA', text: 'E2E8F0', muted: '94A3B8' },
    font: 'Segoe UI',
  },
  warm: {
    name: 'Тёплая',
    colors: { primary: 'B45309', dark: '1C1917', light: 'FEF3C7', accent: 'D97706', text: '44403C', muted: '78716C' },
    font: 'Segoe UI',
  },
  forest: {
    name: 'Изумруд',
    colors: { primary: '15803D', dark: '052E16', light: 'ECFDF5', accent: '22C55E', text: '1F2937', muted: '6B7280' },
    font: 'Segoe UI',
  },
}

export function getThemes() {
  return Object.entries(THEMES).map(([key, t]) => ({ key, name: t.name }))
}

function bulletFontSize(items) {
  const total = items.reduce((sum, item) => sum + item.length, 0)
  if (total > 900) return 12
  if (total > 600) return 14
  if (total > 400) return 16
  if (total > 250) return 18
  return 20
}

export async function buildPptx(title, slides, themeKey) {
  const theme = THEMES[themeKey] || THEMES.default
  const c = theme.colors
  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE'
  pres.defineSlideMaster({
    title: 'Content',
    background: { color: c.light },
    objects: [],
    slideNumber: { x: 0.95, y: 7.0, color: c.muted, fontFace: theme.font, fontSize: 10 },
  })
  pres.defineSlideMaster({
    title: 'TitleOnly',
    background: { color: c.light },
    objects: [],
    slideNumber: { x: 0.95, y: 7.0, color: c.muted, fontFace: theme.font, fontSize: 10 },
  })

  // Title slide
  const titleSlide = pres.addSlide()
  titleSlide.background = { color: c.dark }
  titleSlide.addText(title, {
    x: 0.8, y: 2.5, w: 11.4, h: 1.5,
    fontSize: 36, bold: true, color: 'FFFFFF', fontFace: theme.font, align: 'left',
  })
  titleSlide.addShape('rect', {
    x: 0.8, y: 4.1, w: 3, h: 0.06, fill: { color: c.primary },
  })

  for (const spec of slides) {
    addSlide(pres, spec, theme)
  }

  return await pres.write({ outputType: 'blob' })
}

function addSlide(pres, spec, theme) {
  const c = theme.colors
  const slide = pres.addSlide({ masterName: 'Content' })
  slide.addText(spec.title, {
    x: 0.7, y: 0.3, w: 11.6, h: 0.9,
    fontSize: 26, bold: true, color: c.dark, fontFace: theme.font, align: 'left',
    lineSpacingMultiple: 1.0,
  })
  slide.addShape('rect', {
    x: 0.7, y: 1.15, w: 2.5, h: 0.04, fill: { color: c.primary },
  })

  if (spec.type === 'text') {
    textSlide(slide, spec, theme)
  } else if (spec.type === 'table') {
    tableSlide(slide, spec, theme)
  } else if (spec.type === 'chart') {
    chartSlide(slide, spec, theme)
  } else if (spec.type === 'comparison') {
    comparisonSlide(slide, spec, theme)
  } else if (spec.type === 'image') {
    imageSlide(slide, spec, theme)
  }
}

function textSlide(slide, spec, theme) {
  const c = theme.colors
  const items = spec.bullets || []
  if (items.length === 0) return
  const size = bulletFontSize(items)
  const rows = items.map((item) => ({
    text: item,
    options: { bullet: { code: '2022' }, fontSize: size, color: c.text, fontFace: theme.font, lineSpacingMultiple: 1.3, breakLine: true },
  }))
  slide.addText(rows, {
    x: 0.8, y: 1.4, w: 11.2, h: 5.2, valign: 'top',
  })
}

function tableSlide(slide, spec, theme) {
  const c = theme.colors
  const data = spec.table
  const rows = data.rows.length + 1
  const fontSize = rows <= 8 ? 14 : rows <= 12 ? 12 : 10
  const tableRows = [
    data.headers.map((h) => ({ text: h, options: { bold: true, fontSize, color: 'FFFFFF', fill: { color: c.primary }, fontFace: theme.font } })),
    ...data.rows.map((row) => row.map((cell) => ({ text: cell, options: { fontSize, color: c.text, fontFace: theme.font } }))),
  ]
  slide.addTable(tableRows, {
    x: 0.8, y: 1.4, w: 11.2,
    border: { type: 'solid', pt: 1, color: 'CBD5E1' },
    rowH: 0.4,
    autoPage: true,
    fill: { color: 'FFFFFF' },
    valign: 'middle',
  })
}

function chartSlide(slide, spec, theme) {
  const c = theme.colors
  const data = spec.chart
  const chartColors = [c.primary, c.accent, c.muted, '94A3B8', 'A78BFA', 'FB923C']
  const chartData = data.categories.map((cat, i) => ({
    name: cat,
    labels: data.categories,
    values: data.series.map((s) => s.values[i] ?? 0),
  }))

  const chartType = data.kind === 'pie' ? 'pie' : data.kind === 'line' ? 'line' : 'bar'
  const opts = {
    x: 0.8, y: 1.4, w: 11.2, h: 5.2,
    chartColors: chartColors.slice(0, data.series.length),
    showLegend: data.kind === 'pie' || data.series.length > 1,
    legendPos: 'b',
    fontFace: theme.font,
    fontSize: 12,
    showValue: data.kind === 'pie',
    valAxisLabelColor: c.text,
    catAxisLabelColor: c.text,
  }

  if (data.kind === 'pie') {
    const pieData = data.categories.map((cat, i) => ({
      name: cat,
      value: data.series[0].values[i] ?? 0,
    }))
    slide.addChart('pie', pieData, opts)
  } else {
    const seriesData = data.series.map((s) => ({
      name: s.name,
      labels: data.categories,
      values: s.values,
    }))
    slide.addChart(chartType, seriesData, opts)
  }
}

function comparisonSlide(slide, spec, theme) {
  const c = theme.colors
  const data = spec.comparison
  const colW = 5.4
  const gap = 0.4
  const leftX = 0.8
  const rightX = leftX + colW + gap

  slide.addText(data.left_title, {
    x: leftX, y: 1.4, w: colW, h: 0.6,
    fontSize: 20, bold: true, color: c.dark, fontFace: theme.font, align: 'center',
    fill: { color: c.primary }, fontColor: 'FFFFFF',
  })
  slide.addText(
    (data.left_items || []).map((item) => ({ text: item, options: { bullet: true, fontSize: 16, color: c.text, lineSpacingMultiple: 1.3, breakLine: true } })),
    { x: leftX, y: 2.1, w: colW, h: 4.3, valign: 'top' }
  )

  slide.addText(data.right_title, {
    x: rightX, y: 1.4, w: colW, h: 0.6,
    fontSize: 20, bold: true, color: c.dark, fontFace: theme.font, align: 'center',
    fill: { color: c.accent }, fontColor: 'FFFFFF',
  })
  slide.addText(
    (data.right_items || []).map((item) => ({ text: item, options: { bullet: true, fontSize: 16, color: c.text, lineSpacingMultiple: 1.3, breakLine: true } })),
    { x: rightX, y: 2.1, w: colW, h: 4.3, valign: 'top' }
  )
}

function imageSlide(slide, spec, theme) {
  const c = theme.colors
  const base64 = spec.image.base64
  slide.addImage({ data: `data:image/png;base64,${base64}`, x: 2, y: 1.4, w: 9, h: 5.2, sizing: { type: 'contain', w: 9, h: 5.2 } })
}
