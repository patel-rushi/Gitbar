const { createCanvas } = require('@napi-rs/canvas')
const fs = require('fs')
const path = require('path')

const size = 1024
const canvas = createCanvas(size, size)
const ctx = canvas.getContext('2d')

const grad = ctx.createLinearGradient(0, 0, size, size)
grad.addColorStop(0, '#58a6ff')
grad.addColorStop(1, '#a371f7')

const r = 200
ctx.beginPath()
ctx.moveTo(r, 0)
ctx.lineTo(size - r, 0)
ctx.quadraticCurveTo(size, 0, size, r)
ctx.lineTo(size, size - r)
ctx.quadraticCurveTo(size, size, size - r, size)
ctx.lineTo(r, size)
ctx.quadraticCurveTo(0, size, 0, size - r)
ctx.lineTo(0, r)
ctx.quadraticCurveTo(0, 0, r, 0)
ctx.closePath()
ctx.fillStyle = grad
ctx.fill()

ctx.save()
ctx.translate(512, 400)

ctx.fillStyle = 'white'
ctx.beginPath()
ctx.arc(0, -150, 80, 0, Math.PI * 2)
ctx.fill()

ctx.strokeStyle = 'white'
ctx.lineWidth = 44
ctx.lineCap = 'round'

ctx.beginPath()
ctx.moveTo(0, -70)
ctx.lineTo(0, 200)
ctx.stroke()

ctx.beginPath()
ctx.moveTo(-110, 200)
ctx.lineTo(110, 200)
ctx.stroke()

ctx.beginPath()
ctx.arc(150, -150, 55, 0, Math.PI * 2)
ctx.stroke()

ctx.beginPath()
ctx.moveTo(0, -30)
ctx.lineTo(150, -100)
ctx.stroke()

ctx.beginPath()
ctx.arc(-150, 280, 55, 0, Math.PI * 2)
ctx.stroke()

ctx.beginPath()
ctx.moveTo(0, 120)
ctx.lineTo(-150, 225)
ctx.stroke()

ctx.restore()

const buffer = canvas.toBuffer('image/png')
const outPath = path.join(__dirname, '..', 'build', 'icon.png')
fs.writeFileSync(outPath, buffer)
console.log(`Icon written to ${outPath} (${buffer.length} bytes)`)
