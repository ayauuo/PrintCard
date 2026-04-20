<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { usePhotobooth } from '@/composables/usePhotobooth'

defineOptions({ name: 'ScreenChooseCharacter' })

const { currentScreen, buildChooseCharacterStripPrint } = usePhotobooth()

/** 暫停後幾秒自動合成 2×6 並進列印流程 */
const PAUSE_TO_PRINT_DELAY_MS = 3000

const IMAGE_BASE = '/assets/templates/ChooseCharacter'
const PAUSE_BUTTON_IMG = `${IMAGE_BASE}/button.png`
const BG_DEFAULT = `${IMAGE_BASE}/background.png`
const BG_CONGRATULATIONS = `${IMAGE_BASE}/Congratulations.png`
const IMAGES = [1, 2, 3, 4, 5, 6, 7].map((n) => `${IMAGE_BASE}/${String(n).padStart(2, '0')}.png`)
const IMAGE_WIDTH_PX = 280
const SINGLE_SET_WIDTH = IMAGE_WIDTH_PX * IMAGES.length
/** 重複三組用於無縫循環 */
const BANNER_IMAGES = [...IMAGES, ...IMAGES, ...IMAGES]
/** 每張圖停留毫秒數，離散切換不連續滑動，避免暫停時誤判 */
const STEP_INTERVAL_MS = 280

const isPaused = ref(false)
const pinnedIndex = ref(0)
const currentStepIndex = ref(0)
const bannerWrapRef = ref<HTMLElement | null>(null)
const bannerWidth = ref(800)
const scrollOffsetPx = ref(SINGLE_SET_WIDTH)
let resizeObserver: ResizeObserver | null = null
let stepTimer: ReturnType<typeof setInterval> | null = null
let pauseToPrintTimer: ReturnType<typeof setTimeout> | null = null

function clearPauseToPrintTimer() {
  if (pauseToPrintTimer != null) {
    clearTimeout(pauseToPrintTimer)
    pauseToPrintTimer = null
  }
}

function startScroll() {
  if (stepTimer) {
    clearInterval(stepTimer)
    stepTimer = null
  }
  currentStepIndex.value = 0
  scrollOffsetPx.value = SINGLE_SET_WIDTH
  stepTimer = setInterval(() => {
    if (isPaused.value) return
    currentStepIndex.value = (currentStepIndex.value + 1) % IMAGES.length
    scrollOffsetPx.value = SINGLE_SET_WIDTH + currentStepIndex.value * IMAGE_WIDTH_PX
  }, STEP_INTERVAL_MS)
}

function stopScroll() {
  if (stepTimer) {
    clearInterval(stepTimer)
    stepTimer = null
  }
}

/** 依與畫面中央的距離計算每張圖的 scale、brightness、zIndex（Cover Flow 效果） */
function getImageStyle(index: number) {
  const imgCenter = index * IMAGE_WIDTH_PX + IMAGE_WIDTH_PX / 2
  const viewportCenter = bannerWidth.value / 2
  const trackOffset = bannerWidth.value / 2 - IMAGE_WIDTH_PX / 2 - scrollOffsetPx.value
  const imgCenterInViewport = imgCenter + trackOffset
  const distance = imgCenterInViewport - viewportCenter
  const absDistance = Math.abs(distance)
  const maxDist = IMAGE_WIDTH_PX * 2.5
  const normDist = Math.min(1, absDistance / maxDist)
  const scale = Math.max(0.5, 1 - normDist * 0.5)
  const brightness = Math.max(0.35, 1 - normDist * 0.65)
  const zIndex = Math.round(100 - normDist * 80)
  return { scale, brightness, zIndex }
}

function onPauseClick() {
  if (isPaused.value) return
  isPaused.value = true
  stopScroll()
  pinnedIndex.value = currentStepIndex.value
  clearPauseToPrintTimer()
  const url = IMAGES[pinnedIndex.value] ?? IMAGES[0]!
  pauseToPrintTimer = setTimeout(() => {
    pauseToPrintTimer = null
    void buildChooseCharacterStripPrint(url)
  }, PAUSE_TO_PRINT_DELAY_MS)
}

watch(
  () => currentScreen.value === 'choose-character',
  async (isActive) => {
    if (isActive) {
      clearPauseToPrintTimer()
      scrollOffsetPx.value = SINGLE_SET_WIDTH
      currentStepIndex.value = 0
      isPaused.value = false
      pinnedIndex.value = 0
      await nextTick()
      if (bannerWrapRef.value) {
        bannerWidth.value = bannerWrapRef.value.offsetWidth || 800
      }
      startScroll()
    } else {
      stopScroll()
      clearPauseToPrintTimer()
    }
  },
  { immediate: true }
)

onMounted(async () => {
  if (currentScreen.value === 'choose-character') {
    startScroll()
  }
  await nextTick()
  const el = bannerWrapRef.value
  if (el) {
    const updateWidth = () => {
      bannerWidth.value = el.offsetWidth || 800
    }
    updateWidth()
    resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(el)
  }
})

onUnmounted(() => {
  stopScroll()
  clearPauseToPrintTimer()
  if (resizeObserver && bannerWrapRef.value) {
    resizeObserver.disconnect()
  }
})
</script>

<template>
  <div class="screen screen--choose-character" role="region" aria-label="選擇角色輪播">
    <div class="choose-character__scroll">
      <img
        class="choose-character__bg-img"
        :src="isPaused ? BG_CONGRATULATIONS : BG_DEFAULT"
        alt=""
        draggable="false"
      />
      <div class="choose-character__layer">
        <div class="choose-character__layout">
          <div ref="bannerWrapRef" class="choose-character__banner-wrap">
            <!-- Cover Flow 橫幅：離散分格切換，置中顯示 -->
            <div
              v-show="!isPaused"
              class="choose-character__track"
              :style="{
                transform: `translate3d(${-scrollOffsetPx - IMAGE_WIDTH_PX / 2}px, 0, 0)`,
              }"
            >
              <div
                v-for="(src, i) in BANNER_IMAGES"
                :key="`banner-${i}`"
                class="choose-character__card"
                :style="{
                  left: `${i * IMAGE_WIDTH_PX}px`,
                  transform: `translateY(-50%) scale(${getImageStyle(i).scale})`,
                  filter: `brightness(${getImageStyle(i).brightness})`,
                  zIndex: getImageStyle(i).zIndex,
                }"
              >
                <img :src="src" :alt="`角色 ${(i % IMAGES.length) + 1}`" class="choose-character__banner-img" />
              </div>
            </div>
            <!-- 暫停時：單一圖片放大 -->
            <div v-show="isPaused" class="choose-character__pinned">
              <img
                :src="IMAGES[pinnedIndex]"
                :alt="`角色 ${pinnedIndex + 1}`"
                class="choose-character__pinned-img"
              />
            </div>
          </div>
          <div v-if="!isPaused" class="choose-character__footer">
            <button
              type="button"
              class="choose-character__btn choose-character__btn--pause"
              aria-label="暫停"
              @click="onPauseClick"
            >
              <img
                :src="PAUSE_BUTTON_IMG"
                alt=""
                class="choose-character__btn-pause-img"
                draggable="false"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.screen--choose-character {
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

.choose-character__scroll {
  position: relative;
  display: block;
  flex: 0 0 auto;
  width: 100%;
  min-width: 100%;
  /* 勿設 min-height:100vh，否則圖片高度小於視窗時捲到底會露出底色 */
  background-color: transparent;
}

.choose-character__bg-img {
  display: block;
  width: 100%;
  max-width: none;
  height: auto;
  pointer-events: none;
  user-select: none;
}

.choose-character__layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.choose-character__layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 32px;
  width: 100%;
  max-width: 1400px;
  min-height: 100%;
  box-sizing: border-box;
}

.choose-character__banner-wrap {
  flex: 1;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.choose-character__footer {
  display: flex;
  flex-direction: row;
  gap: 24px;
  justify-content: center;
  padding: 24px 0;
  flex-shrink: 0;
  /* 整塊暫停鈕區上移約視窗高度 20% */
  transform: translateY(-10vh);
}

.choose-character__track {
  position: relative;
  left: 0;
  width: 0;
  height: 70vh;
  display: flex;
  align-items: center;
  will-change: transform;
  backface-visibility: hidden;
  transition: none;
}

.choose-character__card {
  position: absolute;
  top: 50%;
  transform-origin: center center;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 不加 transition，避免循環重置時產生過渡閃爍 */
}

.choose-character__banner-img {
  width: 280px;
  height: auto;
  max-height: 70vh;
  object-fit: contain;
  display: block;
  pointer-events: none;
}

.choose-character__pinned {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  animation: choose-character-fade-in 0.3s ease;
}

.choose-character__pinned-img {
  max-width: 85%;
  max-height: 85vh;
  object-fit: contain;
  transform: scale(1.5);
}

@keyframes choose-character-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}


.choose-character__btn {
  padding: 20px 36px;
  font-size: 24px;
  font-weight: bold;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 140px;

  &--pause {
    background: transparent;
    padding: 0;
    min-width: auto;
    box-shadow: none;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      filter: brightness(1.05);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
      filter: grayscale(0.35);
    }
  }
}

.choose-character__btn-pause-img {
  display: block;
  height: auto;
  max-height: 300px;
  width: auto;
  max-width: min(420px, 60vw);
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}
</style>
