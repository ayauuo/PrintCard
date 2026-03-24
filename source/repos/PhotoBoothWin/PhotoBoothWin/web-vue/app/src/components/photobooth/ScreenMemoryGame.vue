<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { usePhotobooth } from '@/composables/usePhotobooth'

defineOptions({ name: 'ScreenMemoryGame' })

const { showScreen, currentScreen, setUnlockedTemplateIndices } = usePhotobooth()

interface Card {
  id: number
  value: number
  flipped: boolean
  matched: boolean
  removed: boolean
}

const GAME_TIME_MS = 20000

type GamePhase = 'rules' | 'countdown' | 'playing'
const phase = ref<GamePhase>('rules')
const countdownNum = ref(3)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const cards = ref<Card[]>([])
const flippedIndices = ref<number[]>([])
const isLocked = ref(false)
const timeLeft = ref(GAME_TIME_MS / 1000)
const gameOver = ref(false)
let timerId: ReturnType<typeof setInterval> | null = null

/** 遊戲結束時的結果：'time-up' 時間到 | 'all-done' 全部配對完成 */
const gameResultPhase = ref<'time-up' | 'all-done' | null>(null)

const removedCount = computed(() => cards.value.filter((c) => c.removed).length)

/** 數字 n (1~4) 是否已全部移除（4 張都 removed） */
function isNumberFullyRemoved(n: number): boolean {
  return cards.value.filter((c) => c.value === n && c.removed).length === 4
}

/** 取得解鎖的版型索引（0=bk01, 1=bk02...） */
function getUnlockedIndices(): number[] {
  const unlocked: number[] = []
  for (let n = 1; n <= 4; n++) {
    if (isNumberFullyRemoved(n)) unlocked.push(n - 1)
  }
  return unlocked
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = a[i]!
    a[i] = a[j]!
    a[j] = temp
  }
  return a
}

function goToNextScreen() {
  const unlocked = getUnlockedIndices()
  if (unlocked.length > 0) {
    setUnlockedTemplateIndices(unlocked)
  } else {
    // 沒有完成任何版型：隨機選一個版型顯示
    const randomIndex = Math.floor(Math.random() * 4)
    setUnlockedTemplateIndices([randomIndex])
  }
  showScreen('template')
}

function endGame(reason: 'time-up' | 'all-done') {
  if (gameOver.value) return
  gameOver.value = true
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }

  if (reason === 'time-up') {
    // 時間到：先把所有剩餘的牌翻開
    cards.value.forEach((card) => {
      if (!card.removed) {
        card.flipped = true
      }
    })
  }

  gameResultPhase.value = reason
  const delayMs = 1000 // 顯示大字 1 秒後再進選版型
  setTimeout(() => {
    gameResultPhase.value = null
    goToNextScreen()
  }, delayMs)
}

function onUnderstandClick() {
  if (phase.value !== 'rules') return
  phase.value = 'countdown'
  countdownNum.value = 3
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  countdownTimer = setInterval(() => {
    countdownNum.value -= 1
    if (countdownNum.value <= 0) {
      if (countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
      phase.value = 'playing'
      initGame()
    }
  }, 1000)
}

function initGame() {
  const values = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]
  const shuffled = shuffleArray(values)
  cards.value = shuffled.map((v, i) => ({
    id: i,
    value: v,
    flipped: false,
    matched: false,
    removed: false,
  }))
  flippedIndices.value = []
  isLocked.value = false
  timeLeft.value = GAME_TIME_MS / 1000
  gameOver.value = false
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
  timerId = setInterval(() => {
    timeLeft.value = Math.max(0, timeLeft.value - 1)
    if (timeLeft.value <= 0) endGame('time-up')
  }, 1000)
}

function flipCard(index: number) {
  if (gameOver.value || isLocked.value) return
  const card = cards.value[index]
  if (!card || card.matched || card.removed || card.flipped) return
  if (flippedIndices.value.length >= 2) return

  card.flipped = true
  flippedIndices.value = [...flippedIndices.value, index]

  if (flippedIndices.value.length === 2) {
    isLocked.value = true
    const i1 = flippedIndices.value[0]
    const i2 = flippedIndices.value[1]
    if (i1 === undefined || i2 === undefined) {
      isLocked.value = false
      return
    }
    const c1 = cards.value[i1]
    const c2 = cards.value[i2]
    if (c1 && c2 && c1.value === c2.value) {
      c1.matched = true
      c2.matched = true
      flippedIndices.value = []
      isLocked.value = false
      setTimeout(() => {
        c1.removed = true
        c2.removed = true
        const allDone = cards.value.filter((c) => c.removed).length === 16
        if (allDone) endGame('all-done')
      }, 500)
    } else if (c1 && c2) {
      setTimeout(() => {
        c1.flipped = false
        c2.flipped = false
        flippedIndices.value = []
        isLocked.value = false
      }, 600)
    } else {
      flippedIndices.value = []
      isLocked.value = false
    }
  }
}

watch(
  () => currentScreen.value === 'memory-game',
  (isActive) => {
    if (isActive) {
      phase.value = 'rules'
      countdownNum.value = 3
      gameResultPhase.value = null
      if (countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
})
</script>

<template>
  <div class="screen screen--memory-game" role="region" aria-label="翻牌記憶遊戲">
    <!-- 遊戲規則頁 -->
    <div v-if="phase === 'rules'" class="memory-game__rules">
      <h1 class="memory-game__rules-title">遊戲規則</h1>
      <div class="memory-game__rules-content">
        <p>限時 20 秒從所有卡片當中找到相同圖案的卡片。</p>
        <p>每次只能翻兩張卡片。</p>
        <p>找到後一次把相同圖案的卡片翻開，即可解鎖相同圖案的主題。</p>
      </div>
      <button type="button" class="memory-game__rules-btn" @click="onUnderstandClick">
        我知道了
      </button>
    </div>
    <!-- 倒數 3 秒 -->
    <div v-else-if="phase === 'countdown'" class="memory-game__countdown">
      <span class="memory-game__countdown-num">{{ countdownNum }}</span>
      <span class="memory-game__countdown-label">秒後開始</span>
    </div>
    <!-- 遊戲主畫面（含結束時的 overlay） -->
    <template v-else>
      <div class="memory-game__panel">
        <div class="memory-game__header">
        <div class="memory-game__timer" :class="{ 'is-low': timeLeft <= 5 }">
          剩餘 {{ timeLeft }} 秒
        </div>
      </div>
      <div class="memory-game__grid">
        <button
          v-for="(card, index) in cards"
          :key="card.id"
          type="button"
          class="memory-game__card"
          :class="{
            'is-flipped': card.flipped || card.matched,
            'is-removed': card.removed,
          }"
          :disabled="card.matched || card.removed || gameOver"
          @click="flipCard(index)"
        >
          <span class="memory-game__card-inner">
            <span class="memory-game__card-back">
              <span class="memory-game__card-pattern"></span>
              <span class="memory-game__card-back-text">?</span>
            </span>
            <span class="memory-game__card-front">
              <img
                :src="`/assets/templates/CardGame/${card.value}.jpg`"
                :alt="`圖案 ${card.value}`"
                class="memory-game__card-image"
              />
            </span>
          </span>
        </button>
      </div>
    </div>
    <!-- 遊戲結束 overlay：大字顯示結果 -->
    <Transition name="result-overlay">
      <div
        v-if="gameResultPhase"
        class="memory-game__result-overlay"
        :class="{ 'is-time-up': gameResultPhase === 'time-up', 'is-all-done': gameResultPhase === 'all-done' }"
      >
        <span class="memory-game__result-text">{{ gameResultPhase === 'time-up' ? '時間到' : '太棒了' }}</span>
      </div>
    </Transition>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.screen--memory-game {
  position: absolute;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2vh 3vw;
  box-sizing: border-box;
}

/* 遊戲規則頁 */
.memory-game__rules {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
}

.memory-game__rules-title {
  margin: 0 0 32px;
  font-size: clamp(36px, 6vw, 56px);
  font-weight: 700;
  color: #fff;
  letter-spacing: 8px;
}

.memory-game__rules-content {
  max-width: 560px;
  margin: 0 0 48px;
  font-size: clamp(18px, 2.5vw, 24px);
  color: rgba(255, 255, 255, 0.9);
  line-height: 2;
  text-align: left;

  p {
    margin: 0 0 16px;
    &:last-child {
      margin-bottom: 0;
    }
  }
}

.memory-game__rules-btn {
  padding: 18px 56px;
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 700;
  color: #1a1a2e;
  background: linear-gradient(145deg, #ffd93d 0%, #f4a261 100%);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 6px 24px rgba(255, 217, 61, 0.4);
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 8px 28px rgba(255, 217, 61, 0.5);
  }
  &:active {
    transform: scale(0.98);
  }
}

/* 倒數頁 */
.memory-game__countdown {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.memory-game__countdown-num {
  font-size: clamp(120px, 20vw, 200px);
  font-weight: 800;
  color: #ffd93d;
  line-height: 1;
  animation: countdown-pop 1s ease-out;
}

.memory-game__countdown-label {
  font-size: clamp(24px, 3vw, 36px);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
}

@keyframes countdown-pop {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}

.memory-game__panel {
  width: 100%;
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.memory-game__header {
  flex-shrink: 0;
}

.memory-game__title {
  margin: 0 0 4px;
  font-size: clamp(28px, 4vw, 48px);
  font-weight: 700;
  color: #fff;
  text-align: center;
  letter-spacing: 6px;
}

.memory-game__hint {
  margin: 0 0 8px;
  font-size: clamp(12px, 2vw, 16px);
  color: rgba(255, 255, 255, 0.75);
  text-align: center;
  line-height: 1.5;
}

.memory-game__timer {
  font-size: clamp(24px, 3vw, 36px);
  font-weight: 700;
  color: #ffd93d;
  text-align: center;

  &.is-low {
    color: #ff6b6b;
    animation: pulse 1s ease-in-out infinite;
  }
}

@keyframes pulse {
  50% { opacity: 0.7; }
}

.memory-game__grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: min(16px, 2vh);
  width: min(88vw, 88vh * 5 / 7);
  height: min(88vh, 88vw * 7 / 5);
  max-width: 100%;
  max-height: 100%;
  align-self: center;
}

.memory-game__card {
  aspect-ratio: 5 / 7;
  padding: 0;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  background: transparent;
  perspective: 600px;
  transition: transform 0.15s ease;

  &:hover:not(:disabled):not(.is-removed) {
    transform: scale(1.03);
  }
  &:active:not(:disabled):not(.is-removed) {
    transform: scale(0.98);
  }
  &:disabled {
    cursor: default;
  }
  &.is-removed {
    visibility: hidden;
    pointer-events: none;
  }
}

.memory-game__card-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.1);
}

.memory-game__card.is-flipped .memory-game__card-inner {
  transform: rotateY(180deg);
}

.memory-game__card-back,
.memory-game__card-front {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid rgba(0, 0, 0, 0.15);
}

.memory-game__card-back {
  background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 50%, #1a365d 100%);
  color: #fff;
}

.memory-game__card-pattern {
  position: absolute;
  inset: 8px;
  background-image:
    repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255, 255, 255, 0.06) 6px, rgba(255, 255, 255, 0.06) 12px),
    repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(255, 255, 255, 0.06) 6px, rgba(255, 255, 255, 0.06) 12px);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.memory-game__card-back-text {
  position: relative;
  z-index: 1;
  font-size: clamp(20px, 4vh, 36px);
  font-weight: 800;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.memory-game__card-front {
  background: #f8f6f0;
  color: #1a1a1a;
  transform: rotateY(180deg);
}

.memory-game__card-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

/* 遊戲結束 overlay：大字顯示 */
.memory-game__result-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  z-index: 100;
  pointer-events: none;
}

.memory-game__result-text {
  font-size: clamp(72px, 15vw, 140px);
  font-weight: 800;
  letter-spacing: 12px;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  animation: result-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.memory-game__result-overlay.is-time-up .memory-game__result-text {
  color: #ff9f43;
}

.memory-game__result-overlay.is-all-done .memory-game__result-text {
  color: #ffd93d;
  text-shadow: 0 0 40px rgba(255, 217, 61, 0.6);
}

@keyframes result-pop {
  0% {
    transform: scale(0.3);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.result-overlay-enter-active,
.result-overlay-leave-active {
  transition: opacity 0.3s ease;
}
.result-overlay-enter-from,
.result-overlay-leave-to {
  opacity: 0;
}
</style>
