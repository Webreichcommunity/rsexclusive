import { apiFetch } from './apiClient.js'

export async function uploadImageToCloudinary(file, { signatureUrl = '/media/signature', folder = 'hotel-assets' } = {}) {
  if (!file) return null
  const uploadFile = await compressImageForUpload(file)
  const signature = await apiFetch(signatureUrl, { method: 'POST', body: { folder } })
  const formData = new FormData()
  formData.set('file', uploadFile)
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

async function compressImageForUpload(file) {
  if (!file?.type?.startsWith('image/')) return file
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file

  const imageUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(imageUrl)
    const maxSide = 1920
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0, width, height)

    const compressed = await canvasToBlob(canvas, 'image/jpeg', 0.78)
    if (!compressed || compressed.size >= file.size) return file
    return new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read the selected image.'))
    image.src = src
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}
