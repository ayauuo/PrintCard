<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import SecretKeypad from '@/components/photobooth/SecretKeypad.vue'

defineOptions({ name: 'ScreenIdle' })

const props = withDefaults(
  defineProps<{
    /** 是否啟用紙鈔機或投幣器；false 時可點擊螢幕進入選版型 */
    isPaymentsEnabled?: boolean
  }>(),
  { isPaymentsEnabled: true }
)
const emit = defineEmits<{
  clickToStart: []
}>()

const CAROUSEL_INTERVAL_MS = 5000
const basePath = '/assets/templates/IdlePage'
/** 輪播圖（相對 basePath），對應 public/assets/templates/IdlePage/cover/ */
const slideImages = ['cover/cover.png', 'cover/cover_2.png']

const isCarousel = computed(() => {
  const v = import.meta.env.VITE_IDLE_CAROUSEL
  return v === '1' || v === 'true'
})

/** 取得單張圖的 URL（支援以 / 開頭的絕對路徑或相對檔名） */
function getSlideUrl(img: string): string {
  return img.startsWith('/') ? img : `${basePath}/${img}`
}

/** 無輪播時用的靜態背景：用第一張圖 */
const staticBackgroundUrl = computed(() =>
  slideImages[0] ? getSlideUrl(slideImages[0]) : ''
)

/** 輪播時目前顯示的圖 */
const currentCarouselUrl = computed(() => {
  const i = currentIndex.value
  const name = slideImages[i]
  return name ? getSlideUrl(name) : ''
})

const currentIndex = ref(0)
let intervalId: ReturnType<typeof setInterval> | null = null

function startCarousel() {
  if (!isCarousel.value || slideImages.length <= 1) return
  intervalId = setInterval(() => {
    currentIndex.value = (currentIndex.value + 1) % slideImages.length
  }, CAROUSEL_INTERVAL_MS)
}

function stopCarousel() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

onMounted(() => {
  if (isCarousel.value) startCarousel()
})

onUnmounted(() => {
  stopCarousel()
})
</script>

<template>
  <div
    class="screen screen--idle"
    :class="{ 'is-click-to-start': !props.isPaymentsEnabled }"
    role="region"
    aria-label="待機畫面"
    @click="!props.isPaymentsEnabled && emit('clickToStart')"
  >
    <div class="idle__scroll">
      <img
        v-if="!isCarousel"
        class="idle__bg-img"
        :src="staticBackgroundUrl"
        alt=""
        draggable="false"
      />
      <img
        v-else
        class="idle__bg-img"
        :src="currentCarouselUrl"
        alt=""
        draggable="false"
      />
      <div class="idle__layer">
        <SecretKeypad />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.screen--idle {
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

  &.is-click-to-start {
    cursor: pointer;
  }
}

.idle__scroll {
  position: relative;
  display: block;
  flex: 0 0 auto;
  width: 100%;
  min-width: 100%;
  background-color: transparent;
}

.idle__bg-img {
  display: block;
  width: 100%;
  max-width: none;
  height: auto;
  pointer-events: none;
  user-select: none;
}

.idle__layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  min-height: 100%;
  box-sizing: border-box;
  pointer-events: none;
}
</style>
