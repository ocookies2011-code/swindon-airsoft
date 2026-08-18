import React from 'react'
import { Photo, PHOTOS } from '../components/common'

const IMAGES = [
  { src: PHOTOS.gallery1, cap: 'Kitting up before the brief' },
  { src: PHOTOS.gallery2, cap: 'Holding the line, mid-game' },
  { src: PHOTOS.gallery3, cap: 'Down time between rounds' },
  { src: PHOTOS.gallery4, cap: 'Close-quarters, no hesitation' },
  { src: PHOTOS.gallery5, cap: 'Crossing open ground' },
  { src: PHOTOS.gallery6, cap: 'Woodland cover, worth the mud' },
]

export default function Gallery() {
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="section-tag">From The Field</span>
          <h1>Gallery</h1>
          <p className="page-hero-sub">A look at what a match day actually looks like — no stock photography, no staged shots.</p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="gallery-grid">
            {IMAGES.map((img, i) => (
              <div className="gallery-item" key={i}>
                <Photo src={img.src} alt={img.cap} />
                <div className="gallery-cap">{img.cap}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
