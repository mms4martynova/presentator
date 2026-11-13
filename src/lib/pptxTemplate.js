import JSZip from 'jszip'
import { DEFAULT_LAYOUT } from './pptxBuilder.js'

const MAX_FILE_BYTES = 50 * 1024 * 1024
const EMU_PER_INCH = 914400
const BASE_WIDTH = 13.333
const BASE_HEIGHT = 7.5
const THEME_PATH = 'ppt/theme/theme1.xml'
const MASTER_PATH = 'ppt/slideMasters/slideMaster1.xml'
const MASTER_RELS_PATH = 'ppt/slideMasters/_rels/slideMaster1.xml.rels'
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

function allElements(root, tag) {
  return Array.from(root?.getElementsByTagName(tag) ?? [])
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

function applyLum(hex, lumMod, lumOff) {
  if (!hex || (lumMod == null && lumOff == null)) return hex
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const apply = (ch) => {
    let v = ch
    if (lumMod != null) v = Math.round(v * lumMod / 100000)
    if (lumOff != null) v = Math.round(v + 255 * lumOff / 100000)
    return Math.max(0, Math.min(255, v))
  }
  return [apply(r), apply(g), apply(b)].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function readColorFull(element, palette, colorMap) {
  if (!element) return null
  const srgb = firstElement(element, 'a:srgbClr')
  if (srgb) return srgb.getAttribute('val')?.toUpperCase() ?? null
  const sys = firstElement(element, 'a:sysClr')
  if (sys) return sys.getAttribute('lastClr')?.toUpperCase() ?? null
  const scheme = firstElement(element, 'a:schemeClr')
  if (!scheme) return null
  const name = scheme.getAttribute('val')
  let base = palette[colorMap[name] ?? name] ?? null
  if (!base) return null
  const lumMod = scheme.getElementsByTagName('a:lumMod')[0]
  const lumOff = scheme.getElementsByTagName('a:lumOff')[0]
  return applyLum(base,
    lumMod ? parseInt(lumMod.getAttribute('val'), 10) : null,
    lumOff ? parseInt(lumOff.getAttribute('val'), 10) : null,
  )
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

function emuToInch(emu, scale) { return (Number(emu) / EMU_PER_INCH) * scale }

function readPlaceholderBox(masterXml, types, scale) {
  for (const shape of allElements(masterXml, 'p:sp')) {
    const ph = firstElement(shape, 'p:ph')
    if (!ph || !types.includes(ph.getAttribute('type') ?? 'obj')) continue
    const xfrm = firstElement(shape, 'a:xfrm')
    const off = firstElement(xfrm, 'a:off')
    const ext = firstElement(xfrm, 'a:ext')
    if (!off || !ext) continue
    return {
      x: emuToInch(off.getAttribute('x'), scale.x),
      y: emuToInch(off.getAttribute('y'), scale.y),
      w: emuToInch(ext.getAttribute('cx'), scale.x),
    }
  }
  return null
}

function readPlaceholderFontSize(masterXml, types) {
  for (const shape of allElements(masterXml, 'p:sp')) {
    const ph = firstElement(shape, 'p:ph')
    if (!ph || !types.includes(ph.getAttribute('type') ?? 'obj')) continue
    const txBody = firstElement(shape, 'p:txBody')
    if (!txBody) continue
    // Check lstStyle / lvl1pPr / defRPr for sz attribute (hundredths of point)
    for (const tag of ['a:lstStyle', 'a:bodyPr']) {
      const lst = firstElement(txBody, 'a:lstStyle')
      const lvl = firstElement(lst, 'a:lvl1pPr')
      const rpr = firstElement(lvl, 'a:defRPr')
      const sz = rpr?.getAttribute('sz')
      if (sz) return Math.round(Number(sz) / 100)
    }
    // Fallback: check direct rPr in body runs
    const rpr = firstElement(txBody, 'a:rPr')
    const sz = rpr?.getAttribute('sz')
    if (sz) return Math.round(Number(sz) / 100)
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

async function readRelationships(zip) {
  const file = zip.file(MASTER_RELS_PATH)
  if (!file) return {}
  const xml = parseXml(await file.async('string'))
  const rels = {}
  for (const rel of allElements(xml, 'Relationship')) {
    rels[rel.getAttribute('Id')] = rel.getAttribute('Target')
  }
  return rels
}

async function readMasterImages(zip, masterXml, rels, presentationXml) {
  const size = firstElement(presentationXml, 'p:sldSz')
  const scale = {
    x: BASE_WIDTH / (Number(size.getAttribute('cx')) / EMU_PER_INCH),
    y: BASE_HEIGHT / (Number(size.getAttribute('cy')) / EMU_PER_INCH),
  }

  const images = []
  for (const pic of allElements(masterXml, 'p:pic')) {
    const blip = firstElement(pic, 'a:blip')
    const rId = blip?.getAttribute('r:embed')
    if (!rId || !rels[rId]) continue

    // Target is relative to ppt/slideMasters/, so resolve it
    const target = rels[rId].replace(/^\.\.\//, 'ppt/')
    const imgFile = zip.file(target)
    if (!imgFile) continue

    const bytes = await imgFile.async('uint8array')
    const ext = target.split('.').pop().toLowerCase()
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', emf: null, wmf: null }
    const mime = mimeMap[ext]
    if (!mime) continue // skip vector/Windows formats

    const b64 = btoa(Array.from(bytes).map((b) => String.fromCharCode(b)).join(''))
    const dataUrl = `data:${mime};base64,${b64}`

    const xfrm = firstElement(pic, 'a:xfrm')
    const off = firstElement(xfrm, 'a:off')
    const ext2 = firstElement(xfrm, 'a:ext')
    if (!off || !ext2) continue

    images.push({
      data: dataUrl,
      x: emuToInch(off.getAttribute('x'), scale.x),
      y: emuToInch(off.getAttribute('y'), scale.y),
      w: emuToInch(ext2.getAttribute('cx'), scale.x),
      h: emuToInch(ext2.getAttribute('cy'), scale.y),
    })
  }
  return images
}

function readMasterShapes(masterXml, palette, colorMap, presentationXml) {
  const size = firstElement(presentationXml, 'p:sldSz')
  const scale = {
    x: BASE_WIDTH / (Number(size.getAttribute('cx')) / EMU_PER_INCH),
    y: BASE_HEIGHT / (Number(size.getAttribute('cy')) / EMU_PER_INCH),
  }

  const shapes = []
  for (const sp of allElements(masterXml, 'p:sp')) {
    if (firstElement(sp, 'p:ph')) continue // skip placeholders

    const xfrm = firstElement(sp, 'a:xfrm')
    const off = firstElement(xfrm, 'a:off')
    const ext = firstElement(xfrm, 'a:ext')
    if (!off || !ext) continue

    const x = emuToInch(off.getAttribute('x'), scale.x)
    const y = emuToInch(off.getAttribute('y'), scale.y)
    const w = emuToInch(ext.getAttribute('cx'), scale.x)
    const h = emuToInch(ext.getAttribute('cy'), scale.y)

    // Skip shapes outside visible slide area
    if (x > BASE_WIDTH || y > BASE_HEIGHT || w <= 0 || h <= 0) continue

    const spPr = firstElement(sp, 'p:spPr')
    const solidFill = firstElement(spPr, 'a:solidFill')
    const fillColor = solidFill ? readColorFull(solidFill, palette, colorMap) : null

    const ln = firstElement(spPr, 'a:ln')
    const lineFill = firstElement(ln, 'a:solidFill')
    const lineColor = lineFill ? readColorFull(lineFill, palette, colorMap) : null

    // Determine geometry
    const prstGeom = firstElement(spPr, 'a:prstGeom')
    const geom = prstGeom?.getAttribute('prst') ?? 'rect'

    // Skip shapes with no visible fill or line
    if (!fillColor && !lineColor) continue

    const noFill = firstElement(spPr, 'a:noFill')
    if (noFill && !lineColor) continue

    shapes.push({ geom, x, y, w, h, fillColor: noFill ? null : fillColor, lineColor })
  }
  return shapes
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

  const [themeText, masterText, presentationText] = await Promise.all([
    zip.file(THEME_PATH).async('string'),
    zip.file(MASTER_PATH).async('string'),
    zip.file(PRESENTATION_PATH).async('string'),
  ])

  const themeXml = parseXml(themeText)
  const masterXml = parseXml(masterText)
  const presentationXml = parseXml(presentationText)

  const palette = readPalette(themeXml)
  const colorMap = readColorMap(masterXml)
  const background = readColorFull(firstElement(masterXml, 'p:bg'), palette, colorMap)

  const colors = {
    primary: palette.accent1,
    dark: palette.dk2,
    light: background ?? palette.lt1,
    accent: palette.accent2,
    text: palette.dk1,
    muted: mixHex(palette.dk1, palette.lt1, 0.45),
  }

  const majorFont = firstElement(themeXml, 'a:majorFont')
  const minorFont = firstElement(themeXml, 'a:minorFont')
  const headingFont = firstElement(majorFont, 'a:latin')?.getAttribute('typeface')
    || majorFont?.getAttribute('typeface')
    || 'Calibri'
  const bodyFont = firstElement(minorFont, 'a:latin')?.getAttribute('typeface')
    || minorFont?.getAttribute('typeface')
    || 'Calibri'

  const titleFontSize = readPlaceholderFontSize(masterXml, ['title', 'ctrTitle']) ?? 36
  const headingFontSize = readPlaceholderFontSize(masterXml, ['body']) ?? 26

  // Title text color from master title placeholder
  let titleColor = null
  for (const shape of allElements(masterXml, 'p:sp')) {
    const ph = firstElement(shape, 'p:ph')
    const type = ph?.getAttribute('type') ?? 'obj'
    if (!['title', 'ctrTitle'].includes(type)) continue
    const rpr = firstElement(firstElement(shape, 'p:txBody'), 'a:defRPr')
      ?? firstElement(firstElement(shape, 'p:txBody'), 'a:rPr')
    titleColor = rpr ? readColorFull(rpr, palette, colorMap) : null
    break
  }

  const rels = await readRelationships(zip)
  const [masterImages, masterShapes, layoutNames] = await Promise.all([
    readMasterImages(zip, masterXml, rels, presentationXml),
    Promise.resolve(readMasterShapes(masterXml, palette, colorMap, presentationXml)),
    readLayoutNames(zip),
  ])

  return {
    colors,
    font: bodyFont,
    headingFont,
    titleFontSize,
    headingFontSize,
    titleColor,
    masterImages,
    masterShapes,
    layout: readLayout(masterXml, presentationXml),
    layoutNames,
  }
}
