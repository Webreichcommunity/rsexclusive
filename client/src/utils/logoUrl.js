export function logoDisplayUrl(url) {
  const value = String(url || '').trim()
  if (!value || value.startsWith('/') || value.startsWith('data:') || value.endsWith('.svg')) return value
  if (!value.includes('/image/upload/')) return value
  if (/\.(png|webp|gif)(\?|$)/i.test(value)) return value
  if (value.includes('/e_make_transparent')) return value
  return value.replace('/image/upload/', '/image/upload/e_make_transparent:18,f_png/')
}
