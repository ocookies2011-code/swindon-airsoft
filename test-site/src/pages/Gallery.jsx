import React, { useEffect, useState } from 'react'
import { Photo } from '../components/common'
import { supabase } from '../supabaseClient'

function useRealGallery() {
  const [images, setImages] = useState(null)
  const [albumTitle, setAlbumTitle] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Most recent album with images, newest first
        const { data: albums, error: albErr } = await supabase
          .from('gallery_albums')
          .select('id, title, created_at')
          .order('created_at', { ascending: false })
          .limit(8)
        if (albErr) throw albErr

        for (const album of albums || []) {
          const { data: imgs } = await supabase
            .from('gallery_images')
            .select('url')
            .eq('album_id', album.id)
            .order('sort_order', { ascending: true })
            .limit(9)
          if (imgs && imgs.length > 0) {
            if (!cancelled) { setImages(imgs.map(i => i.url)); setAlbumTitle(album.title) }
            return
          }
        }
        if (!cancelled) setImages([])
      } catch {
        if (!cancelled) { setError(true); setImages([]) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { images, albumTitle, error }
}

export default function Gallery() {
  const { images, albumTitle, error } = useRealGallery()

  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="section-tag">From The Field</span>
          <h1>Gallery</h1>
          <p className="page-hero-sub">
            {albumTitle ? `Real photos from ${albumTitle} — pulled live from the gallery.` : 'Real match-day photos, pulled live from the gallery.'}
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          {images === null && <div className="empty-note">Loading gallery…</div>}
          {error && <div className="error-note">Couldn't reach the gallery just now.</div>}
          {images && images.length === 0 && !error && <div className="empty-note">No photos published yet — check back after the next game day.</div>}
          {images && images.length > 0 && (
            <div className="gallery-grid">
              {images.map((src, i) => (
                <div className="gallery-item" key={i}>
                  <Photo src={src} alt="" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
