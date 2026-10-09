import { useEffect } from 'react'

export function Seo({ title, description, image, canonical, keywords, structuredData, favicon, siteName }) {
  useEffect(() => {
    document.title = title
    setMeta('description', description)
    setMeta('keywords', keywords)
    setMeta('og:title', title, 'property')
    setMeta('og:description', description, 'property')
    setMeta('og:type', 'website', 'property')
    setMeta('og:site_name', siteName || 'Ranjeet Group of Hotels', 'property')
    if (canonical) setMeta('og:url', canonical, 'property')
    if (image) setMeta('og:image', image, 'property')
    setMeta('twitter:card', image ? 'summary_large_image' : 'summary')
    setMeta('twitter:title', title)
    setMeta('twitter:description', description)
    if (image) setMeta('twitter:image', image)
    if (canonical) setCanonical(canonical)
    setFavicon(favicon || '/mainlogo.png')
    setStructuredData(structuredData)
  }, [title, description, image, canonical, keywords, structuredData, favicon, siteName])
  return null
}

function setMeta(name, content, attr = 'name') {
  if (!content) return
  let element = document.head.querySelector(`meta[${attr}="${name}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attr, name)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

function setCanonical(url) {
  let element = document.head.querySelector('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', 'canonical')
    document.head.appendChild(element)
  }
  element.setAttribute('href', url)
}

function setFavicon(url) {
  if (!url) return
  const rels = ['icon', 'shortcut icon', 'apple-touch-icon']
  for (const rel of rels) {
    let element = document.head.querySelector(`link[rel="${rel}"]`)
    if (!element) {
      element = document.createElement('link')
      element.setAttribute('rel', rel)
      document.head.appendChild(element)
    }
    element.setAttribute('href', url)
    const type = faviconType(url)
    if (rel !== 'apple-touch-icon' && type) element.setAttribute('type', type)
  }
}

function faviconType(url) {
  const path = String(url || '').split('?')[0]
  if (/\.svg$/i.test(path)) return 'image/svg+xml'
  if (/\.webp$/i.test(path)) return 'image/webp'
  if (/\.png$/i.test(path) || path.includes('/image/upload/')) return 'image/png'
  if (/\.(jpe?g)$/i.test(path)) return 'image/jpeg'
  return ''
}

function setStructuredData(data) {
  const id = 'structured-data'
  document.getElementById(id)?.remove()
  if (!data) return
  const script = document.createElement('script')
  script.id = id
  script.type = 'application/ld+json'
  script.textContent = JSON.stringify(data)
  document.head.appendChild(script)
}
