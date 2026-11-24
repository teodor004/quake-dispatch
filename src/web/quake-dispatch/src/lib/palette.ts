import { useTheme } from '../hooks/useTheme'

/**
 * Colors for SVG drawn by libraries (recharts, Leaflet), which set them as
 * attributes where CSS variables do not resolve. Keep in sync with index.css.
 */
const light = {
  paper: '#EDF1F0',
  surface: '#FAFBFB',
  ink: '#1E2731',
  ink2: '#4A5561',
  ink3: '#69737D',
  rule: '#CBD3D6',
  grid: '#DCE3E5',
  trace: '#1F4C94',
  threshold: '#A86B12',
  alert: '#B3202A',
  online: '#2E7048',
  offline: '#8A949C',
}

const dark: typeof light = {
  paper: '#0F151B',
  surface: '#172029',
  ink: '#E6EBEF',
  ink2: '#A9B4BD',
  ink3: '#86919B',
  rule: '#2E3944',
  grid: '#232D37',
  trace: '#7AA9F2',
  threshold: '#E3A64A',
  alert: '#F2676B',
  online: '#4FB87A',
  offline: '#7D8892',
}

export type Palette = typeof light

export function usePalette(): Palette {
  return useTheme() === 'dark' ? dark : light
}
