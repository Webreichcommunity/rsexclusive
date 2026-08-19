import { apiFetch } from './apiClient.js'

export async function uploadImageToCloudinary(file, { signatureUrl = '/media/signature', folder = 'hotel-assets' } = {}) {
  if (!file) return null
  const signature = await apiFetch(signatureUrl, { method: 'POST', body: { folder } })
  const formData = new FormData()
  formData.set('file', file)
  formData.set('api_key', signature.apiKey)
  formData.set('timestamp', signature.timestamp)
  formData.set('folder', signature.folder)
  formData.set('signature', signature.signature)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error?.message || 'Image upload failed')
  return {
    publicId: payload.public_id,
    secureUrl: payload.secure_url,
    width: payload.width,
    height: payload.height,
  }
}
