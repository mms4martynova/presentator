import { supabase } from './lib/supabase.js'
import { parseTemplateFile } from './lib/pptxTemplate.js'
import { saveBlob } from './lib/saveBlob.js'

const BUCKET = 'corporate-templates'
const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const TEMPLATE_QUERY = '*, versions:template_versions(*)'

function mapTemplate(row) {
  const versions = [...(row.versions ?? [])].sort((a, b) => b.version_number - a.version_number)
  return {
    ...row,
    versions,
    current: versions.find((version) => version.version_number === row.current_version) ?? null,
  }
}

async function currentUserName() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.user_metadata?.name || user?.email || null
}

async function uploadVersion(templateId, versionNumber, file, theme, changeNote) {
  const versionId = crypto.randomUUID()
  const fileKey = `${templateId}/${versionId}.pptx`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(fileKey, file, { contentType: PPTX_TYPE })
  if (uploadError) {
    console.error('template upload failed', uploadError)
    throw new Error('Не удалось сохранить файл шаблона')
  }

  const { error } = await supabase.from('template_versions').insert({
    id: versionId,
    template_id: templateId,
    version_number: versionNumber,
    file_key: fileKey,
    file_name: file.name,
    theme,
    change_note: changeNote || null,
    author_name: await currentUserName(),
  })
  if (error) {
    console.error('template version insert failed', error)
    throw new Error('Не удалось сохранить версию шаблона')
  }
}

export async function listTemplates() {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_QUERY)
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('listTemplates failed', error)
    throw new Error('Не удалось загрузить шаблоны')
  }
  return data.map(mapTemplate)
}

export async function getTemplate(templateId) {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_QUERY)
    .eq('id', templateId)
    .maybeSingle()
  if (error) {
    console.error('getTemplate failed', error)
    throw new Error('Не удалось загрузить шаблон')
  }
  if (!data) throw new Error('Шаблон не найден')
  return mapTemplate(data)
}

export async function createTemplate({ name, description, brand, file }) {
  const theme = await parseTemplateFile(file)
  const templateId = crypto.randomUUID()
  const { error } = await supabase.from('templates').insert({
    id: templateId,
    name,
    description: description || null,
    brand: brand || null,
    author_name: await currentUserName(),
  })
  if (error) {
    console.error('template insert failed', error)
    throw new Error('Не удалось создать шаблон')
  }

  try {
    await uploadVersion(templateId, 1, file, theme, null)
  } catch (err) {
    await supabase.from('templates').delete().eq('id', templateId)
    throw err
  }
  return getTemplate(templateId)
}

export async function updateTemplateInfo(templateId, { name, description, brand }) {
  const { error } = await supabase
    .from('templates')
    .update({
      name,
      description: description || null,
      brand: brand || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)
  if (error) {
    console.error('updateTemplateInfo failed', error)
    throw new Error('Не удалось сохранить изменения')
  }
  return getTemplate(templateId)
}

export async function addTemplateVersion(template, { file, changeNote }) {
  const theme = await parseTemplateFile(file)
  const versionNumber = Math.max(0, ...template.versions.map((version) => version.version_number)) + 1
  await uploadVersion(template.id, versionNumber, file, theme, changeNote)
  await setCurrentVersion(template.id, versionNumber)
  return getTemplate(template.id)
}

export async function setCurrentVersion(templateId, versionNumber) {
  const { error } = await supabase
    .from('templates')
    .update({ current_version: versionNumber, updated_at: new Date().toISOString() })
    .eq('id', templateId)
  if (error) {
    console.error('setCurrentVersion failed', error)
    throw new Error('Не удалось переключить версию')
  }
  return getTemplate(templateId)
}

export async function deleteTemplate(template) {
  const fileKeys = template.versions.map((version) => version.file_key).filter(Boolean)
  if (fileKeys.length) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove(fileKeys)
    if (storageError) console.error('template file cleanup failed', storageError)
  }
  const { error } = await supabase.from('templates').delete().eq('id', template.id)
  if (error) {
    console.error('deleteTemplate failed', error)
    throw new Error('Не удалось удалить шаблон')
  }
}

export async function downloadTemplateFile(version, templateName) {
  const { data, error } = await supabase.storage.from(BUCKET).download(version.file_key)
  if (error) {
    console.error('template download failed', error)
    throw new Error('Не удалось скачать файл шаблона')
  }
  saveBlob(data, `${templateName.replace(/[\\/:*?"<>|]/g, '_')} v${version.version_number}.pptx`)
}

export async function getVersionTheme(versionId) {
  const { data, error } = await supabase
    .from('template_versions')
    .select('theme')
    .eq('id', versionId)
    .maybeSingle()
  if (error) {
    console.error('getVersionTheme failed', error)
    throw new Error('Не удалось загрузить шаблон оформления')
  }
  if (!data) throw new Error('Версия шаблона не найдена')
  return data.theme
}
