const TIME_LABEL = /(?:(?:19|20)\d{2}(?:\s?г\.?)?|(?:Q[1-4]|[1-4]\s?кв\S*)(?:\s?\d{2,4})?|\d{4}-\d{2}(?:-\d{2})?|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\.\d{4}|(?:янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[а-яa-z]*\.?(?:\s?\d{2,4})?|(?:пн|вт|ср|чт|пт|сб|вс|mon|tue|wed|thu|fri|sat|sun)[а-яa-z]*)/i

const SHARE_HINT = /доля|доли|структур|распредел|share|proportion|%/i

const CHART_VISUALIZATION = { column: 'column_chart', line: 'line_chart', pie: 'pie_chart' }
const SLIDE_TYPE_BY_VIZ = {
  text: 'text', table: 'table', line_chart: 'chart',
  column_chart: 'chart', pie_chart: 'chart', comparison: 'comparison', image: 'image',
}

function isTimeSeries(categories) {
  const matches = categories.filter((c) => TIME_LABEL.test(c.trim())).length
  return matches >= Math.max(3, Math.floor(categories.length * 0.8))
}

function isShare(chart, title) {
  const values = chart.series[0].values
  if (values.some((v) => v < 0) || values.length < 2 || values.length > 8) return false
  const total = values.reduce((a, b) => a + b, 0)
  return Math.abs(total - 100) <= 1 || SHARE_HINT.test(title)
}

function numericPairs(bullets) {
  if (bullets.length < 3) return null
  const pairs = []
  for (const bullet of bullets) {
    const m = bullet.match(/^\s*(.+?)\s*[:–—]\s*(.+?)\s*$/)
    if (!m || !/[-+]?\d/.test(m[2])) return null
    pairs.push([m[1].trim(), m[2].trim()])
  }
  return pairs
}

function chartKind(slide) {
  const chart = slide.chart
  if (chart.kind) return [chart.kind, 'Тип диаграммы задан пользователем.']
  if (chart.categories.length >= 3 && isTimeSeries(chart.categories)) {
    return ['line', 'Значения упорядочены по времени, поэтому линейный график показывает динамику.']
  }
  if (chart.series.length === 1 && isShare(chart, slide.title)) {
    return ['pie', 'Значения описывают доли одного целого, поэтому выбрана круговая диаграмма.']
  }
  return ['column', 'Сравниваются категории между собой, поэтому выбрана столбчатая диаграмма.']
}

function build(viz, reasoning) {
  return { visualization: viz, slide_type: SLIDE_TYPE_BY_VIZ[viz], reasoning }
}

export function recommend(slide) {
  if (slide.type) {
    if (slide.type === 'chart') {
      const [kind] = chartKind(slide)
      return build(CHART_VISUALIZATION[kind], 'Тип слайда задан пользователем, поэтому он имеет приоритет над рекомендацией.')
    }
    return build(slide.type, 'Тип слайда задан пользователем, поэтому он имеет приоритет над рекомендацией.')
  }
  if (slide.image) return build('image', 'Передано изображение, поэтому слайд строится вокруг него.')
  if (slide.comparison) return build('comparison', 'Есть два набора данных для сравнения, поэтому выбран слайд сравнения.')
  if (slide.chart) {
    const [kind, reason] = chartKind(slide)
    return build(CHART_VISUALIZATION[kind], reason)
  }
  if (slide.table) return build('table', 'Данные представлены таблицей, поэтому она сохраняется как есть.')
  const pairs = numericPairs(slide.bullets || [])
  if (pairs) return build('table', 'Несвязанные числовые показатели удобнее читать в таблице, поэтому они собраны в таблицу.')
  return build('text', 'Данных для графика или таблицы нет, поэтому выбран текстовый блок.')
}

export function resolve(slide) {
  const rec = recommend(slide)
  const resolved = { ...slide, type: rec.slide_type, reasoning: rec.reasoning }
  if (!slide.type && rec.visualization === 'table' && !slide.table) {
    const pairs = numericPairs(slide.bullets || []) || []
    resolved.table = { headers: ['Показатель', 'Значение'], rows: pairs }
    resolved.bullets = []
  }
  if (slide.chart && !slide.chart.kind && rec.visualization.endsWith('_chart')) {
    const kind = rec.visualization.replace('_chart', '')
    resolved.chart = { ...slide.chart, kind }
  }
  return resolved
}
