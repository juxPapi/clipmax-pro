// Framing controls shared by the studio preview and the FFmpeg renderer, so the
// crop you see on screen is the crop that gets written to disk.

export const FRAME_DEFAULTS = { focus: 0.5, focusY: 0.5, zoom: 1 };
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2;

// Facecam split: crop the streamer's camera region into the top half and the
// gameplay region into the bottom half. Values are normalised 0..1 of the source.
export const FACE_CAM_DEFAULTS = {
  faceX: 0,      // left edge of the facecam PiP, normalised 0..1 of source
  faceY: 0.39,   // top edge of the PiP (Kai Cenat streams: ~39% down)
  faceW: 0.21,   // PiP width as a fraction of source width
  faceH: 0.21,   // PiP height as a fraction of source height
  topRatio: 0.42, // fraction of the output height for the facecam
};

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function resolveFrame(frame) {
  const { focus, focusY, zoom } = frame ?? {};
  return {
    focus: clamp(focus, 0, 1, FRAME_DEFAULTS.focus),
    focusY: clamp(focusY, 0, 1, FRAME_DEFAULTS.focusY),
    zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX, FRAME_DEFAULTS.zoom),
  };
}

/** Source rectangle that fills the target frame at the current framing controls. */
export function frameBox(srcW, srcH, targetW, targetH, frame = {}) {
  const { focus, focusY, zoom } = resolveFrame(frame);
  const aspect = targetW / targetH;
  const wide = srcW / srcH > aspect;
  const baseW = wide ? srcH * aspect : srcW;
  const baseH = wide ? srcH : srcW / aspect;
  const cropW = Math.min(srcW, Math.max(2, Math.round(baseW / zoom / 2) * 2));
  const cropH = Math.min(srcH, Math.max(2, Math.round(baseH / zoom / 2) * 2));
  return {
    cropW,
    cropH,
    x: Math.max(0, Math.min(srcW - cropW, Math.round((srcW - cropW) * focus))),
    y: Math.max(0, Math.min(srcH - cropH, Math.round((srcH - cropH) * focusY))),
  };
}

const BLUR_WIDTH_RATIO = 0.72;
const BLUR_SIGMA_DIVISOR = 26;

function evenSize(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * Composition plan for one layout. Both renderers draw from this exactly.
 * `mode` selects the strategy: fill, blur, or stacked tiles.
 */
export function composeLayout({ layout, srcW, srcH, width, height, frame = {}, facecam = {} }) {
  if (layout === 'facecam') {
    const cfg = { ...FACE_CAM_DEFAULTS, ...facecam };
    const topH = evenSize(height * clamp(cfg.topRatio, 0.25, 0.6, FACE_CAM_DEFAULTS.topRatio));
    const bottomH = evenSize(height - topH);
    const fw = evenSize(srcW * clamp(cfg.faceW, 0.08, 0.6, FACE_CAM_DEFAULTS.faceW));
    const fh = evenSize(srcH * clamp(cfg.faceH, 0.08, 0.6, FACE_CAM_DEFAULTS.faceH));
    const faceBox = {
      cropW: fw,
      cropH: fh,
      x: Math.max(0, Math.min(srcW - fw, Math.round(srcW * clamp(cfg.faceX, 0, 1 - cfg.faceW, 0)))),
      y: Math.max(0, Math.min(srcH - fh, Math.round(srcH * clamp(cfg.faceY, 0, 1 - cfg.faceH, FACE_CAM_DEFAULTS.faceY)))),
    };
    // Gameplay: a vertical crop from the bottom band using the focus controls.
    const game = frameBox(srcW, srcH, width, bottomH, frame);
    return { mode: 'facecam', topH, bottomH, face: faceBox, game };
  }

  if (layout === 'blur') {
    const scale = Math.min((width * BLUR_WIDTH_RATIO) / srcW, height / srcH);
    const fgW = evenSize(srcW * scale);
    const fgH = evenSize(srcH * scale);
    return {
      mode: 'blur',
      backdrop: frameBox(srcW, srcH, width, height, frame),
      foreground: {
        x: Math.round((width - fgW) / 2),
        y: Math.round((height - fgH) / 2),
        width: fgW,
        height: fgH,
      },
      sigma: width / BLUR_SIGMA_DIVISOR,
    };
  }

  if (layout === 'split' || layout === 'triple') {
    const tiles = layout === 'split' ? 2 : 3;
    const tileH = Math.max(2, Math.ceil(height / tiles / 2) * 2);
    return {
      mode: 'tiles',
      tiles,
      tileH,
      box: frameBox(srcW, srcH, width, tileH, frame),
      offsetY: Math.floor((tileH * tiles - height) / 2),
    };
  }

  return { mode: 'fill', box: frameBox(srcW, srcH, width, height, frame) };
}

/** CSS transform that reproduces the same crop inside a preview box. */
export function previewTransform(srcW, srcH, targetW, targetH, frame = {}) {
  const box = frameBox(srcW, srcH, targetW, targetH, frame);
  return {
    scale: targetW / box.cropW,
    translateX: -(box.x / srcW) * 100,
    translateY: -(box.y / srcH) * 100,
    originX: (box.x / srcW) * 100,
    originY: (box.y / srcH) * 100,
    box,
  };
}
