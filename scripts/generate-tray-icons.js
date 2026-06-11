const { createCanvas } = require('@napi-rs/canvas')
const fs = require('fs')
const path = require('path')

const outDir = path.join(__dirname, '..', 'build')
fs.mkdirSync(outDir, { recursive: true })

function drawGitIcon(ctx, s, color, clear = true) {
  if (clear) ctx.clearRect(0, 0, s, s)

  const pad = Math.round(s * 0.12)
  const inner = s - pad * 2

  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(2, Math.round(s * 0.09))
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const cx = pad + inner * 0.36
  const topY = pad + inner * 0.08
  const r = inner * 0.15

  // Top circle (filled)
  ctx.beginPath()
  ctx.arc(cx, topY + r, r, 0, Math.PI * 2)
  ctx.fill()

  // Trunk line
  const trunkTop = topY + r * 2
  const trunkBottom = pad + inner * 0.78
  ctx.beginPath()
  ctx.moveTo(cx, trunkTop)
  ctx.lineTo(cx, trunkBottom)
  ctx.stroke()

  // Bottom bar
  const barWidth = inner * 0.30
  ctx.beginPath()
  ctx.moveTo(cx - barWidth, trunkBottom)
  ctx.lineTo(cx + barWidth, trunkBottom)
  ctx.stroke()

  // Right branch circle
  const branchX = pad + inner * 0.72
  const branchY = topY + r
  const br = inner * 0.11
  ctx.beginPath()
  ctx.arc(branchX, branchY, br, 0, Math.PI * 2)
  ctx.stroke()

  // Right branch line
  ctx.beginPath()
  ctx.moveTo(cx + r * 0.7, topY + r + r * 0.3)
  ctx.lineTo(branchX - br, branchY)
  ctx.stroke()

  // Bottom-left circle
  const blX = pad + inner * 0.20
  const blY = pad + inner * 0.92
  ctx.beginPath()
  ctx.arc(blX, blY, br, 0, Math.PI * 2)
  ctx.stroke()

  // Bottom-left branch line
  ctx.beginPath()
  ctx.moveTo(cx, trunkBottom - inner * 0.08)
  ctx.lineTo(blX, blY - br)
  ctx.stroke()
}

function createTrayIcon(size, scale, color) {
  const w = size * scale
  const canvas = createCanvas(w, w)
  const ctx = canvas.getContext('2d')
  drawGitIcon(ctx, w, color)
  return canvas.toBuffer('image/png')
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// "Active" icon: white glyph on a filled accent background, shown while the
// panel is open to mimic the native highlighted status item. Non-template.
function createActiveTrayIcon(size, scale) {
  const w = size * scale
  const canvas = createCanvas(w, w)
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, w)
  const r = Math.round(w * 0.24)
  ctx.fillStyle = '#2f81f7'
  roundRectPath(ctx, 0.5, 0.5, w - 1, w - 1, r)
  ctx.fill()
  drawGitIcon(ctx, w, 'white', false)
  return canvas.toBuffer('image/png')
}

const variants = [
  { name: 'trayTemplate.png', size: 22, scale: 1, color: 'black' },
  { name: 'trayTemplate@2x.png', size: 22, scale: 2, color: 'black' },
]

for (const v of variants) {
  const buf = createTrayIcon(v.size, v.scale, v.color)
  const out = path.join(outDir, v.name)
  fs.writeFileSync(out, buf)
  console.log(`  ${v.name} (${buf.length} bytes)`)
}

const activeVariants = [
  { name: 'trayActive.png', size: 22, scale: 1 },
  { name: 'trayActive@2x.png', size: 22, scale: 2 },
]

for (const v of activeVariants) {
  const buf = createActiveTrayIcon(v.size, v.scale)
  const out = path.join(outDir, v.name)
  fs.writeFileSync(out, buf)
  console.log(`  ${v.name} (${buf.length} bytes)`)
}

console.log('Tray icons generated.')
