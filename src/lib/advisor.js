/**
 * AI Visual Advisor — анализирует входные данные презентации и рекомендует
 * оптимальный способ визуализации для каждого слайда: график, таблица,
 * диаграмма, текстовый блок, сравнение или изображение.
 *
 * Анализ работает в три этапа:
 *  1. analyzeRequest — оценивает весь ввод (текст, структуру, аудиторию)
 *  2. recommend(slide) — рекомендует тип визуализации для одного слайда
 *  3. resolve(slide) — применяет рекомендацию и достраивает данные
 */

// ─── Паттерны распознавания ──────────────────────────────────────────────

const TIME_LABEL = /(?:(?:19|20)\d{2}(?:\s?г\.?)?|(?:Q[1-4]|[1-4]\s?кв\S*)(?:\s?\d{2,4})?|\d{4}-\d{2}(?:-\d{2})?|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\.\d{4}|(?:янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[а-яa-z]*\.?(?:\s?\d{2,4})?|(?:пн|вт|ср|чт|пт|сб|вс|mon|tue|wed|thu|fri|sat|sun)[а-яa-z]*)/i

const SHARE_HINT = /доля|доли|структур|распредел|share|proportion|%/i

const TREND_HINT = /динамик|рост|снижен|паден|тренд|измен|увелич|уменьш|grow|decline|trend|change|increase|decrease/i

const COMPARISON_HINT = /сравн|преимуществ|недостат|плюс|минус|против|versus|vs|отлич|разница|better|worse|advantage|disadvantage/i

const PROCESS_HINT = /этап|шаг|стадия|фаз|процесс|step|stage|phase|process|алгоритм|workflow/i

const QUOTE_HINT = /«|»|"|"|цитат|quote|говор|сказал/i

const NUMBER_HINT = /^\s*[-+]?\d[\d\s.,]*\s*(%|тыс|млн|млрд|k|m|b|руб|\$|€)?/i

const BULLET_PAIR = /^\s*(.+?)\s*[:–—]\s*(.+?)\s*$/

// ─── Маппинги ────────────────────────────────────────────────────────────

const CHART_VISUALIZATION = { column: 'column_chart', line: 'line_chart', pie: 'pie_chart' }

const SLIDE_TYPE_BY_VIZ = {
  text: 'text',
  table: 'table',
  line_chart: 'chart',
  column_chart: 'chart',
  pie_chart: 'chart',
  comparison: 'comparison',
  image: 'image',
}

const VIZ_LABELS = {
  text: 'Текстовый блок',
  table: 'Таблица',
  line_chart: 'Линейный график',
  column_chart: 'Столбчатая диаграмма',
  pie_chart: 'Круговая диаграмма',
  comparison: 'Сравнение',
  image: 'Изображение',
}

// ─── Анализ входных данных презентации ───────────────────────────────────

/**
 * Анализирует весь ввод презентации и возвращает контекст,
 * который используется для рекомендаций по каждому слайду.
 */
export function analyzeRequest(data) {
  const text = data.text || ''
  const title = data.title || ''
  const slides = data.slides || []
  const audience = data.audience || ''
  const tone = data.tone || ''

  const hasStructured = slides.length > 0
  const hasFreeText = text.trim().length > 0
  const chartCount = slides.filter((s) => s.chart).length
  const tableCount = slides.filter((s) => s.table).length
  const comparisonCount = slides.filter((s) => s.comparison).length
  const imageCount = slides.filter((s) => s.image).length
  const textOnlyCount = slides.filter((s) => !s.chart && !s.table && !s.comparison && !s.image).length

  const numericBullets = countNumericBullets(text)
  const trendMentions = (text.match(new RegExp(TREND_HINT, 'gi')) || []).length
  const comparisonMentions = (text.match(new RegExp(COMPARISON_HINT, 'gi')) || []).length
  const processMentions = (text.match(new RegExp(PROCESS_HINT, 'gi')) || []).length

  const audienceType = detectAudience(audience)
  const formality = detectFormality(tone, audience)

  return {
    hasStructured,
    hasFreeText,
    slideCount: slides.length,
    chartCount,
    tableCount,
    comparisonCount,
    imageCount,
    textOnlyCount,
    numericBullets,
    trendMentions,
    comparisonMentions,
    processMentions,
    audienceType,
    formality,
    visualAdvisor: /ai\s+visual\s+advisor/i.test(`${title} ${text}`),
  }
}

function countNumericBullets(text) {
  return text
    .split('\n')
    .filter((line) => NUMBER_HINT.test(line.trim()))
    .length
}

function detectAudience(audience) {
  const a = audience.toLowerCase()
  if (/инвестор|совет директор|ceo|cxo|руководств|board|investor|executive/.test(a)) return 'executive'
  if (/техничес|инженер|разработчик|developer|engineer|технический|technical/.test(a)) return 'technical'
  if (/продаж|маркетинг|sales|marketing|клиент|customer/.test(a)) return 'sales'
  if (/студент|образован|курс|лекц|student|education|course/.test(a)) return 'education'
  return 'general'
}

function detectFormality(tone, audience) {
  const t = (tone || '').toLowerCase()
  if (/формал|официаль|formal|official|строг/.test(t)) return 'formal'
  if (/неформал|дружелюб|casual|friendly|лёгк|легк/.test(t)) return 'casual'
  if (detectAudience(audience) === 'executive') return 'formal'
  return 'neutral'
}

// ─── Вспомогательные проверки для отдельного слайда ──────────────────────

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
    const m = bullet.match(BULLET_PAIR)
    if (!m || !/[-+]?\d/.test(m[2])) return null
    pairs.push([m[1].trim(), m[2].trim()])
  }
  return pairs
}

function hasTrendSignal(slide, ctx) {
  if (TREND_HINT.test(slide.title)) return true
  if (ctx && ctx.trendMentions > 0) return true
  return false
}

function hasComparisonSignal(slide, ctx) {
  if (COMPARISON_HINT.test(slide.title)) return true
  if (slide.bullets && slide.bullets.some((b) => COMPARISON_HINT.test(b))) return true
  return false
}

function hasProcessSignal(slide) {
  if (PROCESS_HINT.test(slide.title)) return true
  const numbered = (slide.bullets || []).filter((b) => /^\d+[.)]\s/.test(b))
  return numbered.length >= 3
}

function isQuote(slide) {
  if (QUOTE_HINT.test(slide.title)) return true
  const bullets = slide.bullets || []
  if (bullets.length === 1 && QUOTE_HINT.test(bullets[0])) return true
  return false
}

// ─── Выбор типа диаграммы ────────────────────────────────────────────────

function chartKind(slide, ctx) {
  const chart = slide.chart
  if (chart.kind) return [chart.kind, 'Тип диаграммы задан пользователем.', 1.0]

  if (chart.categories.length >= 3 && isTimeSeries(chart.categories)) {
    return ['line', 'Значения упорядочены по времени — линейный график показывает динамику.', 0.92]
  }
  if (chart.series.length === 1 && isShare(chart, slide.title)) {
    return ['pie', 'Значения описывают доли одного целого — круговая диаграмма.', 0.88]
  }
  if (hasTrendSignal(slide, ctx) && chart.series.length >= 1) {
    return ['line', 'Заголовок указывает на динамику — линейный график.', 0.75]
  }
  if (chart.categories.length <= 6 && chart.series.length <= 3) {
    return ['column', 'Сравниваются категории — столбчатая диаграмма.', 0.85]
  }
  if (chart.categories.length > 6) {
    return ['line', 'Много категорий — линейный график читается лучше столбцов.', 0.7]
  }
  return ['column', 'Сравнение категорий — столбчатая диаграмма.', 0.6]
}

// ─── Рекомендация для одного слайда ──────────────────────────────────────

/**
 * Возвращает рекомендацию визуализации для одного слайда.
 * Результат: { visualization, slide_type, reasoning, confidence }
 */
export function recommend(slide, ctx) {
  // 1. Пользователь явно задал тип — приоритет
  if (slide.type) {
    if (slide.type === 'chart') {
      const [kind, reason, conf] = chartKind(slide, ctx)
      return build(CHART_VISUALIZATION[kind], reason, conf)
    }
    return build(slide.type, 'Тип слайда задан пользователем.', 1.0)
  }

  // 2. Изображение
  if (slide.image) return build('image', 'Передано изображение — слайд строится вокруг него.', 1.0)

  // 3. Сравнение
  if (slide.comparison) return build('comparison', 'Есть два набора данных для сравнения.', 0.95)

  // 4. Явная диаграмма
  if (slide.chart) {
    const [kind, reason, conf] = chartKind(slide, ctx)
    return build(CHART_VISUALIZATION[kind], reason, conf)
  }

  // 5. Явная таблица
  if (slide.table) return build('table', 'Данные представлены таблицей.', 0.95)

  // 6. Текстовые маркеры — пробуем извлечь числовые данные
  const pairs = numericPairs(slide.bullets || [])

  // 7. Сигналы сравнения в тексте
  if (hasComparisonSignal(slide, ctx) && (slide.bullets || []).length >= 2 && !pairs) {
    const items = slide.bullets || []
    const mid = Math.ceil(items.length / 2)
    return build('comparison', 'Текст содержит противопоставление — разделён на две колонки.', 0.6)
  }

  // 8. Числовые показатели → таблица
  if (pairs) {
    return build('table', 'Несвязанные числовые показатели удобнее читать в таблице.', 0.78)
  }

  // 9. Цитата → текстовый блок (с подсказкой)
  if (isQuote(slide)) {
    return build('text', 'Цитата — текстовый блок с акцентом.', 0.7)
  }

  // 10. Процесс/шаги → текстовый блок
  if (hasProcessSignal(slide)) {
    return build('text', 'Описание процесса или шагов — текстовый список.', 0.65)
  }

  // 11. Длинный текст, мало маркеров → текст
  const bullets = slide.bullets || []
  if (bullets.length <= 2) {
    return build('text', 'Мало данных для графика или таблицы — текстовый блок.', 0.5)
  }

  // 12. По умолчанию — текст
  return build('text', 'Недостаточно числовых данных для визуализации — текстовый блок.', 0.4)
}

function build(viz, reasoning, confidence) {
  return {
    visualization: viz,
    slide_type: SLIDE_TYPE_BY_VIZ[viz],
    reasoning,
    confidence: Math.round(confidence * 100) / 100,
  }
}

// ─── Применение рекомендации к слайду ────────────────────────────────────

/**
 * Применяет рекомендацию к слайду: устанавливает тип, достраивает
 * таблицу из числовых маркеров, уточняет тип диаграммы.
 */
export function resolve(slide, ctx, index = 0) {
  if (ctx.visualAdvisor) {
    const visualAdvisorSlide = {
      ...slide,
      type: 'text',
      chart: undefined,
      table: undefined,
      comparison: undefined,
      image: undefined,
      visualAdvisor: true,
      reasoning: 'Для AI Visual Advisor используются качественные текстовые данные без диаграмм.',
    }
    if (index === 1) {
      visualAdvisorSlide.bullets = [
        'Боль: разрозненные шаблоны и несогласованный визуальный язык',
        'Часы: ручная подготовка презентации занимает слишком много времени',
        'Конфликт стилей: брендовые правила теряются между слайдами',
      ]
      visualAdvisorSlide.iconBullets = ['!', '◷', '↔']
    }
    return visualAdvisorSlide
  }

  const rec = recommend(slide, ctx)
  const resolved = { ...slide, type: rec.slide_type, reasoning: rec.reasoning }

  if (!slide.type && rec.visualization === 'table' && !slide.table) {
    const pairs = numericPairs(slide.bullets || []) || []
    if (pairs.length > 0) {
      resolved.table = { headers: ['Показатель', 'Значение'], rows: pairs }
      resolved.bullets = []
    }
  }

  if (!slide.type && rec.visualization === 'comparison' && !slide.comparison) {
    const items = slide.bullets || []
    const mid = Math.ceil(items.length / 2)
    resolved.comparison = {
      left_title: 'Вариант A',
      right_title: 'Вариант B',
      left_items: items.slice(0, mid),
      right_items: items.slice(mid),
    }
    resolved.bullets = []
  }

  if (slide.chart && !slide.chart.kind && rec.visualization.endsWith('_chart')) {
    const kind = rec.visualization.replace('_chart', '')
    resolved.chart = { ...slide.chart, kind }
  }

  return resolved
}

// ─── Сводный отчёт по всей презентации ───────────────────────────────────

/**
 * Возвращает сводку рекомендаций по всем слайдам.
 * Полезно для отображения пользователю перед генерацией.
 */
export function summarize(outline, ctx) {
  const counts = {}
  let totalConfidence = 0

  for (const slide of outline) {
    const rec = recommend(slide, ctx)
    counts[rec.visualization] = (counts[rec.visualization] || 0) + 1
    totalConfidence += rec.confidence
  }

  const avgConfidence = outline.length > 0 ? totalConfidence / outline.length : 0
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])

  return {
    distribution: sorted.map(([viz, count]) => ({
      visualization: viz,
      label: VIZ_LABELS[viz] || viz,
      count,
    })),
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    totalSlides: outline.length,
  }
}

export { VIZ_LABELS }
