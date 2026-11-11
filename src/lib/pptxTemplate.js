import JSZip from 'jszip'
import { DEFAULT_LAYOUT } from './pptxBuilder.js'

const MAX_FILE_BYTES = 50 * 1024 * 1024
const EMU_PER_INCH = 914400
const BASE_WIDTH = 13.333
const BASE_HEIGHT = 7.5
const THEME_PATH = 'ppt/theme/theme1.xml'
const MASTER_PATH = 'ppt/slideMasters/slideMaster1.xml'
const PRESENTATION_PATH = 'ppt/presentation.xml'
const LAYOUT_PATTERN = /^ppt\/slideLayouts\/slideLayout\d+\.xml$/
const SCHEME_NAMES = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']
const FALLBACK_PALETTE = {
  dk1: '0F172A', lt1: 'FFFFFF', dk2: '1E3A5F', lt2: 'F1F5F9',
  accent1: '2563EB', accent2: '3B82F6', accent3: '64748B', accent4: '22C55E', accent5: 'B45309', accent6: 'A78BFA',
}

function parseXml(text) {
  return new DOMParser().parseFromString(text, 'application/xml')
}

function firstElement(root, tag) {
  return root?.getElementsByTagName(tag)[0] ?? null
}

function readColor(element, palette, colorMap) {
  if (!element) return null
  const srgb = firstElement(element, 'a:srgbClr')
  if (srgb) return srgb.getAttribute('val')
  const sys = firstElement(element, 'a:sysClr')
  if (sys) return sys.getAttribute('lastClr')
  const scheme = firstElement(element, 'a:schemeClr')
  if (!scheme) return null
  const name = scheme.getAttribute('val')
  return palette[colorMap[name] ?? name] ?? null
}

function mixHex(a, b, weight) {
  const channels = [0, 2, 4].map((offset) => {
    const from = parseInt(a.slice(offset, offset + 2), 16)
    const to = parseInt(b.slice(offset, offset + 2), 16)
    return Math.round(from + (to - from) * weight).toString(16).padStart(2, '0')
  })
  return channels.join('').toUpperCase()
}

function readPalette(themeXml) {
  const scheme = firstElement(themeXml, 'a:clrScheme')
  const palette = {}
  for (const name of SCHEME_NAMES) {
    palette[name] = readColor(firstElement(scheme, `a:${name}`), {}, {}) ?? FALLBACK_PALETTE[name]
  }
  return palette
}

function readColorMap(masterXml) {
  const colorMap = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }
  const node = firstElement(masterXml, 'p:clrMap')
  for (const attr of Array.from(node?.attributes ?? [])) colorMap[attr.name] = attr.value
  return colorMap
}

function readPlaceholderBox(masterXml, types, scale) {
  for (const shape of Array.from(masterXml.getElementsByTagName('p:sp'))) {
    const ph = firstElement(shape, 'p:ph')
    if (!ph || !types.includes(ph.getAttribute('type') ?? 'obj')) continue
    const xfrm = firstElement(shape, 'a:xfrm')
    const off = firstElement(xfrm, 'a:off')
    const ext = firstElement(xfrm, 'a:ext')
    if (!off || !ext) continue
    return {
      x: (Number(off.getAttribute('x')) / EMU_PER_INCH) * scale.x,
      y: (Number(off.getAttribute('y')) / EMU_PER_INCH) * scale.y,
      w: (Number(ext.getAttribute('cx')) / EMU_PER_INCH) * scale.x,
    }
  }
  return null
}

function readLayout(masterXml, presentationXml) {
  const size = firstElement(presentationXml, 'p:sldSz')
  const scale = {
    x: BASE_WIDTH / (Number(size.getAttribute('cx')) / EMU_PER_INCH),
    y: BASE_HEIGHT / (Number(size.getAttribute('cy')) / EMU_PER_INCH),
  }
  const title = readPlaceholderBox(masterXml, ['title', 'ctrTitle'], scale)
  const body = readPlaceholderBox(masterXml, ['body'], scale)
  return {
    titleX: title?.x ?? DEFAULT_LAYOUT.titleX,
    titleY: title?.y ?? DEFAULT_LAYOUT.titleY,
    titleW: title?.w ?? DEFAULT_LAYOUT.titleW,
    contentX: body?.x ?? DEFAULT_LAYOUT.contentX,
    contentY: body?.y ?? DEFAULT_LAYOUT.contentY,
    contentW: body?.w ?? DEFAULT_LAYOUT.contentW,
  }
}

async function readLayoutNames(zip) {
  const paths = Object.keys(zip.files).filter((path) => LAYOUT_PATTERN.test(path)).sort()
  const names = []
  for (const path of paths) {
    const xml = parseXml(await zip.file(path).async('string'))
    const name = firstElement(xml, 'p:cSld')?.getAttribute('name')
    if (name) names.push(name)
  }
  return names
}

export async function parseTemplateFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('Файл слишком большой, максимум 50 МБ')

  let zip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('Файл не является презентацией PPTX')
  }
  if (!zip.file(PRESENTATION_PATH) || !zip.file(THEME_PATH) || !zip.file(MASTER_PATH)) {
    throw new Error('В файле нет оформления PowerPoint, выберите другой шаблон')
  }

  const themeXml = parseXml(await zip.file(THEME_PATH).async('string'))
  const masterXml = parseXml(await zip.file(MASTER_PATH).async('string'))
  const presentationXml = parseXml(await zip.file(PRESENTATION_PATH).async('string'))

  const palette = readPalette(themeXml)
  const colorMap = readColorMap(masterXml)
  const background = readColor(firstElement(masterXml, 'p:bg'), palette, colorMap)

  const colors = {
    primary: palette.accent1,
    dark: palette.dk2,
    light: background ?? palette.lt1,
    accent: palette.accent2,
    text: palette.dk1,
    muted: mixHex(palette.dk1, palette.lt1, 0.45),
  }

  const headingFont = firstElement(firstElement(themeXml, 'a:majorFont'), 'a:latin')?.getAttribute('typeface') || 'Calibri'
  const bodyFont = firstElement(firstElement(themeXml, 'a:minorFont'), 'a:latin')?.getAttribute('typeface') || 'Calibri'

  return {
    colors,
    font: bodyFont,
    headingFont,
    layout: readLayout(masterXml, presentationXml),
    layoutNames: await readLayoutNames(zip),
  }
}
