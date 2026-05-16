// Photography catalog for Groundwork
// All images sourced from Unsplash under the Unsplash License (free for commercial use, no attribution required but credited below)
// Treatment spec: warm color grade, natural light, real coffee subjects, no posed stock
// See DESIGN_DIRECTION.md Section 4 for full treatment specification

export type Placement =
  | 'homepage-hero'
  | 'module-concept'
  | 'module-financials'
  | 'module-operations'
  | 'module-staffing'
  | 'module-build-out'
  | 'module-menu'
  | 'module-marketing'
  | 'module-launch'
  | 'empty-state-primary'
  | 'empty-state-secondary'
  | 'onboarding-about-shop'
  | 'onboarding-equipment'
  | 'reserve'

export type CropRatio = '16:9' | '3:2' | '1:1' | '4:3'

export interface Photo {
  /** Unsplash share ID (used in unsplash.com/photos/{id}) */
  unsplashId: string
  /** Base CDN URL — append ?w=&q=&fm=webp for next/image optimization */
  cdnUrl: string
  /** Photographer credit */
  photographer: string
  /** Unsplash profile handle */
  photographerHandle: string
  /** License */
  license: 'Unsplash License'
  /** Primary placement in the product */
  placement: Placement
  /** Crop ratio for this placement */
  cropRatio: CropRatio
  /** Alt text (voice-mandate compliant: descriptive, no banned words) */
  alt: string
  /** Subject tags for searching */
  tags: string[]
}

// Unsplash License: free for commercial and non-commercial use.
// Attribution not legally required but recommended.
// No permission needed to use or modify the photos.
// Full license: https://unsplash.com/license

export const PHOTOS: Photo[] = [
  // ── HOMEPAGE HERO ──────────────────────────────────────────────────────────
  {
    unsplashId: 'B5giYHNQPvA',
    cdnUrl: 'https://images.unsplash.com/photo-1775059956734-78ffd2075cec',
    photographer: 'Nikita Pishchugin',
    photographerHandle: 'nikita_pishchugin',
    license: 'Unsplash License',
    placement: 'homepage-hero',
    cropRatio: '16:9',
    alt: 'Empty coffee shop interior in the morning, chairs on tables, window light crossing the floor',
    tags: ['interior', 'morning', 'window-light', 'empty', 'atmosphere'],
  },

  // ── MODULE THUMBNAILS (3:2, one per module) ────────────────────────────────
  {
    unsplashId: 'TD4DBagg2wE',
    cdnUrl: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e',
    photographer: 'Mike Kenneally',
    photographerHandle: 'asthetik',
    license: 'Unsplash License',
    placement: 'module-concept',
    cropRatio: '3:2',
    alt: 'Coffee beans in a white ceramic bowl, close-up',
    tags: ['beans', 'concept', 'origin', 'craft'],
  },
  {
    unsplashId: 'TYIzeCiZ_60',
    cdnUrl: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31',
    photographer: 'Karl Fredrickson',
    photographerHandle: 'kfred',
    license: 'Unsplash License',
    placement: 'module-financials',
    cropRatio: '3:2',
    alt: 'Pour-over coffee brewing in progress, natural window light',
    tags: ['pour-over', 'brewing', 'craft', 'process'],
  },
  {
    unsplashId: '69ilqMz0p1s',
    cdnUrl: 'https://images.unsplash.com/photo-1553292218-4892c2e7e1ae',
    photographer: 'Zarak Khan',
    photographerHandle: 'zarakvg',
    license: 'Unsplash License',
    placement: 'module-operations',
    cropRatio: '3:2',
    alt: 'Hands pressing coffee grounds into a portafilter, espresso machine out of focus behind',
    tags: ['portafilter', 'espresso', 'hands', 'craft', 'operations'],
  },
  {
    unsplashId: 'vhQUnmnOLys',
    cdnUrl: 'https://images.unsplash.com/photo-1532713107108-dfb5d8d2fc42',
    photographer: 'Brent Gorwin',
    photographerHandle: 'brentg',
    license: 'Unsplash License',
    placement: 'module-staffing',
    cropRatio: '3:2',
    alt: 'Barista pouring latte art, side angle, working in a coffee shop',
    tags: ['barista', 'candid', 'staffing', 'people', 'latte-art'],
  },
  {
    unsplashId: '1GEkZAwKZLw',
    cdnUrl: 'https://images.unsplash.com/photo-1777464026512-3d50455d11fd',
    photographer: 'Haberdoedas',
    photographerHandle: 'haberdoedas',
    license: 'Unsplash License',
    placement: 'module-build-out',
    cropRatio: '3:2',
    alt: 'Coffee shop counter detail, equipment and surfaces in warm light',
    tags: ['counter', 'equipment', 'build-out', 'interior', 'detail'],
  },
  {
    unsplashId: '7GpNIIfyfYM',
    cdnUrl: 'https://images.unsplash.com/photo-1761271046396-97d231b59dd7',
    photographer: 'Karl Joshua Bernal',
    photographerHandle: 'karljosh16',
    license: 'Unsplash License',
    placement: 'module-menu',
    cropRatio: '3:2',
    alt: 'Barista pouring latte art into a coffee cup, overhead angle, wooden surface below',
    tags: ['latte-art', 'pour', 'overhead', 'menu', 'craft'],
  },
  {
    unsplashId: 'qbC9hh0aRiY',
    cdnUrl: 'https://images.unsplash.com/photo-1551529563-fce9529e67ac',
    photographer: 'Louis Hansel',
    photographerHandle: 'louishansel',
    license: 'Unsplash License',
    placement: 'module-marketing',
    cropRatio: '3:2',
    alt: 'Coffee shop counter from barista side, preparation in progress',
    tags: ['counter', 'barista', 'marketing', 'atmosphere', 'interior'],
  },
  {
    unsplashId: 'NYGgdHWDlJM',
    cdnUrl: 'https://images.unsplash.com/photo-1596517447156-4408f27791ae',
    photographer: 'Jojo Yuen',
    photographerHandle: 'sharemyfoodd',
    license: 'Unsplash License',
    placement: 'module-launch',
    cropRatio: '3:2',
    alt: 'Coffee shop storefront with people seated outside during the day',
    tags: ['storefront', 'exterior', 'launch', 'open', 'street'],
  },

  // ── EMPTY STATES (4:3, reduced opacity overlay) ───────────────────────────
  {
    unsplashId: 'ZAtS8cfdiWY',
    cdnUrl: 'https://images.unsplash.com/photo-1524060279306-45f990101bf9',
    photographer: 'Ben Kolde',
    photographerHandle: 'benkolde',
    license: 'Unsplash License',
    placement: 'empty-state-primary',
    cropRatio: '4:3',
    alt: 'Coffee cup on a wooden surface near a window, morning light',
    tags: ['cup', 'window', 'morning', 'quiet', 'empty-state'],
  },
  {
    unsplashId: 'c2Y16tC3yO8',
    cdnUrl: 'https://images.unsplash.com/photo-1507133750040-4a8f57021571',
    photographer: 'Nathan Dumlao',
    photographerHandle: 'nate_dumlao',
    license: 'Unsplash License',
    placement: 'empty-state-secondary',
    cropRatio: '4:3',
    alt: 'Latte art in a ceramic cup, warm tones, top-down view',
    tags: ['latte-art', 'cup', 'warm', 'close-up', 'empty-state'],
  },

  // ── ONBOARDING ────────────────────────────────────────────────────────────
  {
    unsplashId: 'UPTYzwX3QME',
    cdnUrl: 'https://images.unsplash.com/photo-1645677020082-721a854c24f2',
    photographer: 'Roman Denisenko',
    photographerHandle: 'romandempire',
    license: 'Unsplash License',
    placement: 'onboarding-about-shop',
    cropRatio: '16:9',
    alt: 'Coffee shop interior with natural light, warm and inviting atmosphere',
    tags: ['interior', 'shop', 'onboarding', 'atmosphere', 'morning'],
  },

  // ── RESERVE (available for additional placements) ─────────────────────────
  {
    unsplashId: 'BnrKDRn5sjg',
    cdnUrl: 'https://images.unsplash.com/photo-1475241404975-c3ae90fdd9e6',
    photographer: 'Brigitte Tohm',
    photographerHandle: 'brigittetohm',
    license: 'Unsplash License',
    placement: 'reserve',
    cropRatio: '3:2',
    alt: 'Espresso in a white demitasse cup, warm backlit steam, counter surface in background',
    tags: ['espresso', 'demitasse', 'steam', 'close-up', 'warm'],
  },
  {
    unsplashId: 'KixfBEdyp64',
    cdnUrl: 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf',
    photographer: 'Nathan Dumlao',
    photographerHandle: 'nate_dumlao',
    license: 'Unsplash License',
    placement: 'reserve',
    cropRatio: '3:2',
    alt: 'Espresso machine portafilter close-up, coffee grounds, warm light',
    tags: ['portafilter', 'espresso', 'machine', 'equipment', 'craft'],
  },
  {
    unsplashId: 'RZJRWMnd0DM',
    cdnUrl: 'https://images.unsplash.com/photo-1616388761741-a5936c6f61f6',
    photographer: 'Mohamed Shaffaf',
    photographerHandle: 'shaffuscanvas',
    license: 'Unsplash License',
    placement: 'reserve',
    cropRatio: '1:1',
    alt: 'Portafilter with tamped espresso grounds, ready for extraction',
    tags: ['portafilter', 'espresso', 'detail', 'craft'],
  },
  {
    unsplashId: '3n3mPoGko8g',
    cdnUrl: 'https://images.unsplash.com/photo-1593443320739-77f74939d0da',
    photographer: 'Tabitha Turner',
    photographerHandle: 'tabithaturnervisuals',
    license: 'Unsplash License',
    placement: 'reserve',
    cropRatio: '1:1',
    alt: 'Latte art close-up in a white ceramic cup, warm tones',
    tags: ['latte-art', 'close-up', 'cup', 'warm'],
  },
  {
    unsplashId: 'Nw8wbiDE3gU',
    cdnUrl: 'https://images.unsplash.com/photo-1559001724-fbad036dbc9e',
    photographer: 'Phil Desforges',
    photographerHandle: 'storybyphil',
    license: 'Unsplash License',
    placement: 'reserve',
    cropRatio: '3:2',
    alt: 'Latte art in a coffee cup, barista hands visible, natural light',
    tags: ['latte-art', 'cup', 'hands', 'craft', 'natural-light'],
  },
  {
    unsplashId: 'N3btvQ51dL0',
    cdnUrl: 'https://images.unsplash.com/photo-1522012188892-24beb302783d',
    photographer: 'Nathan Dumlao',
    photographerHandle: 'nate_dumlao',
    license: 'Unsplash License',
    placement: 'reserve',
    cropRatio: '3:2',
    alt: 'Pour-over coffee dripping through a filter, close-up, warm tones',
    tags: ['pour-over', 'filter', 'brewing', 'close-up', 'craft'],
  },
  {
    unsplashId: 'fmc-tFMMiBs',
    cdnUrl: 'https://images.unsplash.com/photo-1606486544554-164d98da4889',
    photographer: 'Łukasz Rawa',
    photographerHandle: 'lukasz_rawa',
    license: 'Unsplash License',
    placement: 'reserve',
    cropRatio: '1:1',
    alt: 'Roasted coffee beans, close-up, warm rich tones',
    tags: ['beans', 'roasted', 'close-up', 'warm', 'origin'],
  },
  {
    unsplashId: 'p5C7y-IGa_k',
    cdnUrl: 'https://images.unsplash.com/photo-1573987033487-f2cf1a9ffd34',
    photographer: 'Mekht',
    photographerHandle: 'mekht',
    license: 'Unsplash License',
    placement: 'reserve',
    cropRatio: '3:2',
    alt: 'White ceramic coffee cup on a saucer near a window, soft morning light',
    tags: ['cup', 'saucer', 'window', 'morning', 'quiet'],
  },
]

/**
 * Returns all photos assigned to a given placement.
 */
export function getPhotosByPlacement(placement: Placement): Photo[] {
  return PHOTOS.filter((p) => p.placement === placement)
}

/**
 * Returns the primary photo for a placement, or undefined if none assigned.
 */
export function getPrimaryPhoto(placement: Placement): Photo | undefined {
  return PHOTOS.find((p) => p.placement === placement)
}

/**
 * Builds a next/image-compatible src URL from a CDN base URL.
 * Unsplash CDN supports fm=webp, fm=avif, w=, q= for optimization.
 */
export function buildUnsplashSrc(
  cdnUrl: string,
  opts: { width?: number; quality?: number; format?: 'webp' | 'avif' | 'jpg' } = {}
): string {
  const { width = 1920, quality = 80, format = 'webp' } = opts
  return `${cdnUrl}?fm=${format}&w=${width}&q=${quality}&auto=format&fit=crop`
}
