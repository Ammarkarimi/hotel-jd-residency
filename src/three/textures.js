import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Grid of randomly lit windows, used on the distant city blocks. */
export function cityWindowTexture() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 256; y += 16) {
    for (let x = 6; x < 128; x += 14) {
      const r = Math.random();
      if (r > 0.62) {
        g.fillStyle = r > 0.93 ? '#7fd8ff' : r > 0.85 ? '#ff9ec0' : '#ffc46b';
        g.globalAlpha = 0.35 + Math.random() * 0.65;
        g.fillRect(x, y, 7, 9);
      }
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Glowing hotel name, rendered to a canvas so no font file has to be downloaded. */
export function signTexture(text, color = '#ffcf6e') {
  const [c, g] = canvas(1024, 192);
  g.clearRect(0, 0, 1024, 192);
  let size = 112;
  const font = (px) => `800 ${px}px "Syne", "Arial Black", Arial, sans-serif`;
  g.font = font(size);
  while (size > 40 && g.measureText(text).width > 960) g.font = font((size -= 4));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.fillStyle = color;
  g.fillText(text, 512, 100);
  g.shadowBlur = 0;
  g.fillStyle = '#fff6df';
  g.fillText(text, 512, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Night skyline seen through the room's window. */
export function skylineTexture() {
  const [c, g] = canvas(512, 320);
  const sky = g.createLinearGradient(0, 0, 0, 320);
  sky.addColorStop(0, '#0b0820');
  sky.addColorStop(0.55, '#2b1640');
  sky.addColorStop(1, '#ff8a5c');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 320);
  g.fillStyle = '#fff';
  for (let i = 0; i < 60; i++) {
    g.globalAlpha = Math.random() * 0.8;
    g.fillRect(Math.random() * 512, Math.random() * 150, 1.5, 1.5);
  }
  g.globalAlpha = 1;
  let x = 0;
  while (x < 512) {
    const w = 20 + Math.random() * 46;
    const h = 60 + Math.random() * 170;
    g.fillStyle = '#0a0812';
    g.fillRect(x, 320 - h, w - 3, h);
    for (let wy = 320 - h + 8; wy < 312; wy += 10) {
      for (let wx = x + 4; wx < x + w - 8; wx += 8) {
        if (Math.random() > 0.6) {
          g.fillStyle = Math.random() > 0.8 ? '#8fdcff' : '#ffc46b';
          g.globalAlpha = 0.5 + Math.random() * 0.5;
          g.fillRect(wx, wy, 4, 5);
          g.globalAlpha = 1;
        }
      }
    }
    x += w;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dark pill with a gold dot and white text, for labels floating inside the 3D room. */
export function labelTexture(text) {
  const scale = 2;
  const m = canvas(10, 10)[1];
  const font = `700 ${26 * scale}px "Manrope", system-ui, sans-serif`;
  m.font = font;
  const h = 52 * scale;
  const w = Math.ceil(m.measureText(text).width + 74 * scale);
  const [c, g] = canvas(w, h);
  g.fillStyle = 'rgba(8, 7, 13, 0.82)';
  g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  g.lineWidth = 2 * scale;
  g.beginPath();
  g.roundRect(scale, scale, w - 2 * scale, h - 2 * scale, h / 2);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255, 217, 138, 0.3)';
  g.beginPath();
  g.arc(28 * scale, h / 2, 11 * scale, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffd98a';
  g.beginPath();
  g.arc(28 * scale, h / 2, 6 * scale, 0, Math.PI * 2);
  g.fill();
  g.font = font;
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(text, 48 * scale, h / 2 + scale);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: w / h };
}
