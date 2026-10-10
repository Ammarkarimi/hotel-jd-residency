import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Daytime city view seen through the room's window. */
export function skylineTexture() {
  const [c, g] = canvas(512, 320);
  const sky = g.createLinearGradient(0, 0, 0, 320);
  sky.addColorStop(0, '#9cc4e4');
  sky.addColorStop(0.7, '#d9e8f2');
  sky.addColorStop(1, '#eef3f5');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 320);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  for (const [cx, cy, r] of [[90, 60, 26], [120, 55, 32], [150, 64, 22], [370, 40, 20], [395, 36, 26]]) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
  let x = 0;
  while (x < 512) {
    const w = 24 + Math.random() * 50;
    const h = 70 + Math.random() * 160;
    const shade = 150 + Math.floor(Math.random() * 50);
    g.fillStyle = `rgb(${shade - 10}, ${shade}, ${shade + 12})`;
    g.fillRect(x, 320 - h, w - 3, h);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let wy = 320 - h + 8; wy < 312; wy += 11) {
      for (let wx = x + 4; wx < x + w - 8; wx += 9) g.fillRect(wx, wy, 5, 6);
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
