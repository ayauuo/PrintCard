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
  const extraWeapon7 = Array.from({ length: 100 }, () => ({
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

let draggingId: string | null = null
let lastClientX = 0
let lastClientY = 0

function getSticker(id: string) {
  return stickers.value.find((s) => s.id === id)
}

const stageRef = ref<HTMLElement | null>(null)

function onStickerMouseDown(e: MouseEvent, id: string) {
  e.preventDefault()
  draggingId = id
  lastClientX = e.clientX
  lastClientY = e.clientY
}

function onStickerTouchStart(e: TouchEvent, id: string) {
  const t = e.touches[0]
  if (!t) return
  draggingId = id
  lastClientX = t.clientX
  lastClientY = t.clientY
}

function onMouseMove(e: MouseEvent) {
  const stage = stageRef.value
  if (draggingId && stage) {
    const s = getSticker(draggingId)
    if (s) {
      const rect = stage.getBoundingClientRect()
      const dx = ((e.clientX - lastClientX) / rect.width) * 100
      const dy = ((e.clientY - lastClientY) / rect.height) * 100
      s.x = Math.max(0, Math.min(100, s.x + dx))
      s.y = Math.max(0, Math.min(100, s.y + dy))
      lastClientX = e.clientX
      lastClientY = e.clientY
    }
  }
}

function onTouchMove(e: TouchEvent) {
  if (!draggingId) return
  e.preventDefault()
  const t = e.touches[0]
  const stage = stageRef.value
  if (!t || !stage) return
  if (draggingId) {
    const s = getSticker(draggingId)
    if (s) {
      const rect = stage.getBoundingClientRect()
      const dx = ((t.clientX - lastClientX) / rect.width) * 100
      const dy = ((t.clientY - lastClientY) / rect.height) * 100
      s.x = Math.max(0, Math.min(100, s.x + dx))
      s.y = Math.max(0, Math.min(100, s.y + dy))
      lastClientX = t.clientX
      lastClientY = t.clientY
    }
  }
}

function onPointerUp() {
  draggingId = null
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

function onStickerClick(e: MouseEvent, id: string) {
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
    if (isActive) initStickers()
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onPointerUp)
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onPointerUp)
  window.addEventListener('touchcancel', onPointerUp)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onPointerUp)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onPointerUp)
  window.removeEventListener('touchcancel', onPointerUp)
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
        <div ref="stageRef" class="found-game__stage">
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
            @click="onStickerClick($event, s.id)"
            @mousedown="onStickerMouseDown($event, s.id)"
            @touchstart="onStickerTouchStart($event, s.id)"
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
  /* 圖片較矮時捲動區外不露出 #app 淺灰 */
  background-color: #0d0d0d;
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
  cursor: grab;
  z-index: 1;
  touch-action: none;
  user-select: none;

  &:active {
    cursor: grabbing;
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
