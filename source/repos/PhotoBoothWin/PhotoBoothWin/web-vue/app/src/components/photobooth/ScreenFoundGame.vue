<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { usePhotobooth } from '@/composables/usePhotobooth'

defineOptions({ name: 'ScreenFoundGame' })

const { showScreen, currentScreen, setUnlockedTemplateIndices, selectTemplate, templates } = usePhotobooth()

const IMAGE_BASE = '/assets/templates/Foundgame'
const WEAPON_BASE = `${IMAGE_BASE}/weapon`
/** 與選角頁相同：自適應寬度之背景圖 */
const FOUND_GAME_BG = `${WEAPON_BASE}/background.png`

interface WeaponSticker {
  id: string
  weaponNum: number // 1~7
  x: number // 畫面上的 %（0-100）
  y: number
  rotation: number // 初始隨機旋轉角度（deg）
  visible: boolean // weapon7 雙擊後設為 false
}

const stickers = ref<WeaponSticker[]>([])
let nextId = 1

/** 武器編號 → 版型索引（0=bk01, 1=bk02...） */
const WEAPON_TO_TEMPLATE: Record<number, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 1,
  5: 2,
  6: 3,
}

/** weapon1~7 起始不落在螢幕上方：y 從此 % 以下隨機 */
const MIN_Y_PERCENT_NO_TOP = 40

function initStickers() {
  const weapon1to6 = [1, 2, 3, 4, 5, 6].map((n) => ({
    id: `w-${nextId++}`,
    weaponNum: n,
    x: 10 + Math.random() * 80,
    y: MIN_Y_PERCENT_NO_TOP + Math.random() * (100 - MIN_Y_PERCENT_NO_TOP),
    rotation: Math.random() * 360,
    visible: true,
  }))
  const firstWeapon7 = {
    id: `w-${nextId++}`,
    weaponNum: 7,
    x: 10 + Math.random() * 80,
    y: MIN_Y_PERCENT_NO_TOP + Math.random() * (100 - MIN_Y_PERCENT_NO_TOP),
    rotation: Math.random() * 360,
    visible: true,
  }
  const extraWeapon7 = Array.from({ length: 60 }, () => ({
    id: `w-${nextId++}`,
    weaponNum: 7,
    x: 10 + Math.random() * 80,
    y: MIN_Y_PERCENT_NO_TOP + Math.random() * (100 - MIN_Y_PERCENT_NO_TOP),
    rotation: Math.random() * 360,
    visible: true,
  }))
  // weapon1~6 在前（圖層較低），weapon7 在後（z-index 較高）
  stickers.value = [...weapon1to6, firstWeapon7, ...extraWeapon7]
}

const visibleStickers = computed(() => stickers.value.filter((s) => s.visible))

/** 武器圖快取：用於依 alpha 判定是否點在非透明像素上 */
const weaponHitCanvas = new Map<number, HTMLCanvasElement>()

const ALPHA_HIT_THRESHOLD = 24

function stickerBoxSize(weaponNum: number): { w: number; h: number } {
  return weaponNum <= 6 ? { w: 200, h: 365 } : { w: 300, h: 548 }
}

async function ensureWeaponHitCanvas(weaponNum: number): Promise<HTMLCanvasElement | null> {
  const existing = weaponHitCanvas.get(weaponNum)
  if (existing) return existing
  const src = `${WEAPON_BASE}/weapon${weaponNum}.png`
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    await img.decode()
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    if (nw <= 0 || nh <= 0) return null
    const c = document.createElement('canvas')
    c.width = nw
    c.height = nh
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    weaponHitCanvas.set(weaponNum, c)
    return c
  } catch {
    return null
  }
}

async function preloadWeaponHitCanvases() {
  await Promise.all([1, 2, 3, 4, 5, 6, 7].map((n) => ensureWeaponHitCanvas(n)))
}

/** 螢幕座標轉貼紙邊框盒內座標（左上為 0,0），旋轉以中心為軸 */
function clientToStickerLocal(
  stageRect: DOMRect,
  s: WeaponSticker,
  clientX: number,
  clientY: number,
  boxW: number,
  boxH: number
): { ux: number; uy: number } {
  // 目前樣式同時用了 margin 負偏移 + translate(-50%, -50%)，
  // 貼紙實際中心會比 left/top 再往左上半個 box。
  const cx = stageRect.left + (s.x / 100) * stageRect.width - boxW / 2
  const cy = stageRect.top + (s.y / 100) * stageRect.height - boxH / 2
  const dx = clientX - cx
  const dy = clientY - cy
  const rad = (-s.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const lx = dx * cos - dy * sin
  const ly = dx * sin + dy * cos
  return { ux: lx + boxW / 2, uy: ly + boxH / 2 }
}

/** object-fit: contain 下，邊框盒座標對應到圖檔自然像素；落在 letterbox 則為透明 */
function localToNatural(
  ux: number,
  uy: number,
  naturalW: number,
  naturalH: number,
  boxW: number,
  boxH: number
): { nx: number; ny: number } | null {
  const scale = Math.min(boxW / naturalW, boxH / naturalH)
  const drawW = naturalW * scale
  const drawH = naturalH * scale
  const ox = (boxW - drawW) / 2
  const oy = (boxH - drawH) / 2
  if (ux < ox || uy < oy || ux >= ox + drawW || uy >= oy + drawH) return null
  return { nx: (ux - ox) / scale, ny: (uy - oy) / scale }
}

function isOpaqueAtNatural(weaponNum: number, nx: number, ny: number): boolean {
  const c = weaponHitCanvas.get(weaponNum)
  if (!c) return false
  const ix = Math.floor(nx)
  const iy = Math.floor(ny)
  if (ix < 0 || iy < 0 || ix >= c.width || iy >= c.height) return false
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  const d = ctx.getImageData(ix, iy, 1, 1).data
  return d[3]! > ALPHA_HIT_THRESHOLD
}

/** 由上而下（同 z-index 後蓋前）挑第一個非透明命中 */
function pickStickerAt(clientX: number, clientY: number): WeaponSticker | null {
  const stage = stageRef.value
  if (!stage) return null
  const stageRect = stage.getBoundingClientRect()
  const list = [...visibleStickers.value]
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!
    const { w, h } = stickerBoxSize(s.weaponNum)
    const { ux, uy } = clientToStickerLocal(stageRect, s, clientX, clientY, w, h)
    if (ux < 0 || uy < 0 || ux > w || uy > h) continue
    const canvas = weaponHitCanvas.get(s.weaponNum)
    if (!canvas) continue
    const nat = localToNatural(ux, uy, canvas.width, canvas.height, w, h)
    if (!nat) continue
    if (isOpaqueAtNatural(s.weaponNum, nat.nx, nat.ny)) return s
  }
  return null
}

let draggingId: string | null = null
let lastClientX = 0
let lastClientY = 0
/** 本次按下是否曾移動超過閾值（用於區分點擊／拖曳） */
let dragMovedSq = 0
const CLICK_MOVE_THRESHOLD_PX = 8

function getSticker(id: string) {
  return stickers.value.find((s) => s.id === id)
}

const stageRef = ref<HTMLElement | null>(null)

function beginPointerOnSticker(e: PointerEvent, id: string) {
  e.preventDefault()
  draggingId = id
  dragMovedSq = 0
  lastClientX = e.clientX
  lastClientY = e.clientY
}

function onStagePointerDown(e: PointerEvent) {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  const hit = pickStickerAt(e.clientX, e.clientY)
  if (!hit) return
  beginPointerOnSticker(e, hit.id)
}

function applyDragDelta(clientX: number, clientY: number) {
  const stage = stageRef.value
  if (!draggingId || !stage) return
  const s = getSticker(draggingId)
  if (!s) return
  const rect = stage.getBoundingClientRect()
  const px = clientX - lastClientX
  const py = clientY - lastClientY
  dragMovedSq += px * px + py * py
  const dx = (px / rect.width) * 100
  const dy = (py / rect.height) * 100
  s.x = Math.max(0, Math.min(100, s.x + dx))
  s.y = Math.max(0, Math.min(100, s.y + dy))
  lastClientX = clientX
  lastClientY = clientY
}

function onPointerMoveWindow(e: PointerEvent) {
  if (!draggingId) return
  applyDragDelta(e.clientX, e.clientY)
}

const CLICK_MOVE_THRESHOLD_SQ = CLICK_MOVE_THRESHOLD_PX * CLICK_MOVE_THRESHOLD_PX

function onPointerUp() {
  const id = draggingId
  const movedSq = dragMovedSq
  draggingId = null
  dragMovedSq = 0
  if (id && movedSq < CLICK_MOVE_THRESHOLD_SQ) {
    handleStickerTap(id)
  }
}

/** 雙擊 weapon1~6：原為進「選版型」，已改為進「選角色」；若還原請取消下方註解並改回 showScreen('template') */
async function goToTemplate(templateIndex: number) {
  setUnlockedTemplateIndices([templateIndex])
  await nextTick()
  const tpl = templates.value[templateIndex]
  if (tpl) selectTemplate(tpl)
  // showScreen('template')
  showScreen('choose-character')
}

let lastClickId: string | null = null
let lastClickTime = 0
const DBL_CLICK_MS = 400

function onStickerDoubleClick(id: string) {
  const s = getSticker(id)
  if (!s || !s.visible) return
  const n = s.weaponNum
  if (n === 7) {
    s.visible = false
    return
  }
  const templateIndex = WEAPON_TO_TEMPLATE[n]
  if (templateIndex !== undefined) {
    goToTemplate(templateIndex)
  }
}

function handleStickerTap(id: string) {
  const now = Date.now()
  if (lastClickId === id && now - lastClickTime <= DBL_CLICK_MS) {
    lastClickId = null
    lastClickTime = 0
    onStickerDoubleClick(id)
  } else {
    lastClickId = id
    lastClickTime = now
  }
}

watch(
  () => currentScreen.value === 'found-game',
  (isActive) => {
    if (isActive) {
      initStickers()
      void preloadWeaponHitCanvases()
    }
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('pointermove', onPointerMoveWindow)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMoveWindow)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
})
</script>

<template>
  <div class="screen screen--found-game" role="region" aria-label="尋找遊戲">
    <div class="found-game__scroll">
      <img
        class="found-game__bg-img"
        :src="FOUND_GAME_BG"
        alt=""
        draggable="false"
      />
      <div class="found-game__layer">
        <div
          ref="stageRef"
          class="found-game__stage"
          @pointerdown="onStagePointerDown"
        >
          <div
            v-for="s in visibleStickers"
            :key="s.id"
            class="found-game__sticker"
            :class="{
              'found-game__sticker--small': s.weaponNum <= 6,
              'found-game__sticker--w7': s.weaponNum === 7,
            }"
            :style="{
              left: `${s.x}%`,
              top: `${s.y}%`,
              transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`,
            }"
          >
            <img
              :src="`${WEAPON_BASE}/weapon${s.weaponNum}.png`"
              :alt="`weapon${s.weaponNum}`"
              class="found-game__sticker-img"
              draggable="false"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.screen--found-game {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  flex-direction: column;
  align-items: stretch;
  overflow: auto;
  overflow-x: auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* 背景圖自適應寬度、高度依比例；內容高於視窗時由 .screen--found-game 出現捲軸 */
.found-game__scroll {
  position: relative;
  display: block;
  flex: 0 0 auto;
  width: 100%;
  min-width: 100%;
  /* 勿設 min-height:100vh，否則圖片高度小於視窗時捲到底會露出底色 */
  background-color: transparent;
}

.found-game__bg-img {
  display: block;
  width: 100%;
  max-width: none;
  height: auto;
  pointer-events: none;
  user-select: none;
}

/* 與選角頁 choose-character__layer 相同：覆蓋整張背景圖區域 */
.found-game__layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  min-height: 100%;
  box-sizing: border-box;
}

.found-game__stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: visible;
  touch-action: none;
}

.found-game__header {
  position: absolute;
  top: 24px;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 2;
  pointer-events: none;
}

.found-game__title {
  font-size: clamp(36px, 5vw, 56px);
  font-weight: 700;
  color: #111;
  letter-spacing: 8px;
  margin-bottom: 8px;
}

.found-game__hint {
  font-size: clamp(14px, 2vw, 18px);
  color: #333;
  margin: 0;
}

.found-game__sticker {
  position: absolute;
  width: 300px;
  height: 548px;
  margin-left: -150px;
  margin-top: -274px;
  cursor: inherit;
  z-index: 1;
  touch-action: none;
  user-select: none;
  pointer-events: none;

  &:active {
    cursor: inherit;
  }

  /* weapon1~6 較小，圖層在 weapon7 之下 */
  &--small {
    width: 200px;
    height: 365px;
    margin-left: -100px;
    margin-top: -183px;
    z-index: 0;
  }

  &--w7 {
    z-index: 2;
  }
}

.found-game__sticker-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
</style>
