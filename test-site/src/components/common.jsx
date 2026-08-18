import React, { useEffect, useRef, useState } from 'react'

export function useInView() {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect() } },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, inView]
}

export function Reveal({ children, as: Tag = 'div', ...rest }) {
  const [ref, inView] = useInView()
  return <Tag ref={ref} className={`reveal${inView ? ' in-view' : ''}`} {...rest}>{children}</Tag>
}

export function Photo({ src, alt }) {
  return (
    <div className="photo">
      <img src={src} alt={alt} loading="lazy" />
    </div>
  )
}

// Real photography (Unsplash, free license), duotoned via .photo in styles.css
// so shots from different photographers read as one cohesive brand.
export const PHOTOS = {
  hero:   'https://images.unsplash.com/photo-1541513982013-5dc4f56697f9?auto=format&fit=crop&w=2400&q=80',
  ground: 'https://images.unsplash.com/photo-1569242840838-2a6bdd402fe4?auto=format&fit=crop&w=1600&q=80',
  note1:  'https://images.unsplash.com/photo-1615589184136-9f1818682216?auto=format&fit=crop&w=900&q=80',
  note2:  'https://images.unsplash.com/photo-1598744591141-0370fe5aec26?auto=format&fit=crop&w=900&q=80',
  note3:  'https://images.unsplash.com/photo-1566566716921-b50e82140547?auto=format&fit=crop&w=900&q=80',
  gallery1: 'https://images.unsplash.com/photo-1605092262243-28c74cfc74c7?auto=format&fit=crop&w=1200&q=80',
  gallery2: 'https://images.unsplash.com/photo-1576317193864-b65b3b7f08f3?auto=format&fit=crop&w=1200&q=80',
  gallery3: 'https://images.unsplash.com/photo-1569242840510-9fe6f0112cee?auto=format&fit=crop&w=1200&q=80',
  gallery4: 'https://images.unsplash.com/photo-1566566713478-131a85da90b2?auto=format&fit=crop&w=1200&q=80',
  gallery5: 'https://images.unsplash.com/photo-1541513982013-5dc4f56697f9?auto=format&fit=crop&w=1200&q=80',
  gallery6: 'https://images.unsplash.com/photo-1615589184136-9f1818682216?auto=format&fit=crop&w=1200&q=80',
  rulesBanner: 'https://images.unsplash.com/photo-1598744591141-0370fe5aec26?auto=format&fit=crop&w=2000&q=80',
  contactBanner: 'https://images.unsplash.com/photo-1605092262243-28c74cfc74c7?auto=format&fit=crop&w=2000&q=80',
}
