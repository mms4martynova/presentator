import { supabase } from './lib/supabase.js'
import { buildOutline } from './lib/content.js'
import { buildPptx } from './lib/pptxBuilder.js'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function formatError(err) {
  if (err?.message?.includes('JWT')) return 'Сессия истекла. Войдите снова.'
  if (err?.message) return err.message
  return 'Что-то пошло не так, попробуйте еще раз'
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new ApiError(error.message, 401)
  return data
}

export async function signUp(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  })
  if (error) throw new ApiError(error.message, 400)
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { id: user.id, name: user.user_metadata?.name || user.email }
}

export const api = {
  async listTasks() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw new ApiError(formatError(error), 500)
    return data.map(mapTask)
  },

  async getTask(id) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new ApiError(formatError(error), 500)
    if (!data) throw new ApiError('Задача не найдена', 404)
    return mapTask(data)
  },

  async createTask(body) {
    const request = { ...body }
    delete request.mode

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: body.title,
        want_pdf: body.want_pdf,
        request,
        status: 'processing',
        progress: 0,
      })
      .select()
      .single()
    if (error) throw new ApiError(formatError(error), 500)

    const task = mapTask(data)
    try {
      await generatePresentation(task)
    } catch (err) {
      await supabase.from('tasks').update({ status: 'failed', error: err.message }).eq('id', task.id)
      return { ...task, status: 'failed', error: err.message }
    }
    return await this.getTask(task.id)
  },

  async rebuildTask(taskId, changes) {
    const parent = await this.getTask(taskId)
    const newRequest = { ...parent.request, ...changes }
    const title = changes.title || parent.title
    const wantPdf = changes.want_pdf ?? parent.want_pdf

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        parent_task_id: parent.id,
        title,
        want_pdf: wantPdf,
        request: newRequest,
        status: 'processing',
        progress: 0,
      })
      .select()
      .single()
    if (error) throw new ApiError(formatError(error), 500)

    const task = mapTask(data)
    try {
      await generatePresentation(task)
    } catch (err) {
      await supabase.from('tasks').update({ status: 'failed', error: err.message }).eq('id', task.id)
      return { ...task, status: 'failed', error: err.message }
    }
    return await this.getTask(task.id)
  },
}

function mapTask(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    progress: row.progress,
    error: row.error,
    parent_task_id: row.parent_task_id,
    want_pdf: row.want_pdf,
    request: row.request,
    outline: row.outline,
    has_pptx: !!row.pptx_key,
    has_pdf: !!row.pdf_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
    _pptx_key: row.pptx_key,
    _pdf_key: row.pdf_key,
  }
}

async function generatePresentation(task) {
  const req = task.request
  const outline = buildOutline(req)
  const themeKey = req.template_id || 'default'
  const pptxBlob = await buildPptx(task.title, outline, themeKey)

  const fileName = `presentations/${task.id}/${Date.now()}.pptx`
  const { error: uploadError } = await supabase.storage
    .from('presentations')
    .upload(fileName, pptxBlob, { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
  if (uploadError) throw new Error('Не удалось сохранить файл: ' + uploadError.message)

  await supabase.from('tasks').update({
    status: 'completed',
    progress: 100,
    outline,
    pptx_key: fileName,
  }).eq('id', task.id)
}

export async function downloadResult(taskId, taskPptxKey, title) {
  const { data, error } = await supabase.storage
    .from('presentations')
    .download(taskPptxKey)
  if (error) throw new ApiError('Не удалось скачать файл', error.status || 500)
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}.pptx`
  link.click()
  URL.revokeObjectURL(url)
}
