import { useEffect } from 'react'

export function Seo({ title, description, image, canonical, keywords, structuredData }) {
  useEffect(() => {
    document.title = title
    setMeta('description', description)
    setMeta('keywords', keywords)
    setMeta('og:title', title, 'property')
    setMeta('og:description', description, 'property')
    setMeta('og:type', 'website', 'property')
    if (canonical) setMeta('og:url', canonical, 'property')
    if (image) setMeta('og:image', image, 'property')
    setMeta('twitter:card', image ? 'summary_large_image' : 'summary')
    setMeta('twitter:title', title)
    setMeta('twitter:description', description)
    if (image) setMeta('twitter:image', image)
    if (canonical) setCanonical(canonical)
    setStructuredData(structuredData)
  }, [title, description, image, canonical, keywords, structuredData])
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
