export const STATUS_LABELS = {
  queued: 'В очереди',
  processing: 'Генерируется',
  completed: 'Готово',
  failed: 'Ошибка',
}

export const SLIDE_TYPE_LABELS = {
  text: 'Текстовый блок',
  table: 'Таблица',
  chart: 'Диаграмма',
  comparison: 'Сравнение',
  image: 'Изображение',
}

export const isActiveStatus = (status) => status === 'queued' || status === 'processing'

export const formatDate = (value) =>
  new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
