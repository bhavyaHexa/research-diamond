// Stroke icons (24x24 grid), drawn as one path each.
const PATHS: Record<string, string> = {
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5",
  hex: "M12 2l9 5v10l-9 5-9-5V7z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  swap: "M7 7h12l-3-3M17 17H5l3 3",
  plus: "M12 5v14M5 12h14",
  reset: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  play: "M7 5l12 7-12 7z",
  copy: "M9 9h11v11H9zM5 15V4h11",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0",
  chevron: "M9 6l6 6-6 6",
};

export function icon(name: keyof typeof PATHS | string, size = 16, strokeWidth = 1.75): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name] ?? ""}"></path></svg>`;
}
