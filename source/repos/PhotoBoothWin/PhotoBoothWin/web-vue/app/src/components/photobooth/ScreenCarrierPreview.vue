<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useCarrier } from '@/composables/useCarrier'
import { usePhotobooth } from '@/composables/usePhotobooth'

const { showScreen } = usePhotobooth()
const {
  getBarcodeSvgData,
  selectedCardStyle,
  setSelectedCardStyle,
  getPreviewBackgroundUrl,
  composeAndPrint,
  resetCarrier,
} = useCarrier()

const previewCanvasRef = ref<HTMLCanvasElement | null>(null)
const isPrinting = ref(false)
const printErrMsg = ref('')

function renderPreview() {
  const svgData = getBarcodeSvgData()
  const canvas = previewCanvasRef.value
  if (!svgData || !canvas) return

  const bgUrl = getPreviewBackgroundUrl(selectedCardStyle.value)
  const bgImg = new Image()
  const barcodeImg = new Image()
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)
  barcodeImg.src = svgUrl

  Promise.all([
    new Promise<HTMLImageElement>((res, rej) => {
      bgImg.onload = () => res(bgImg)
      bgImg.onerror = () => rej()
      bgImg.src = bgUrl
    }),
    new Promise<HTMLImageElement>((res, rej) => {
      barcodeImg.onload = () => res(barcodeImg)
      barcodeImg.onerror = () => rej()
      barcodeImg.src = svgUrl
    }),
  ])
    .then(([loadedBg, loadedBarcode]) => {
      canvas.width = loadedBg.width
      canvas.height = loadedBg.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(loadedBg, 0, 0, loadedBg.width, loadedBg.height)
      const baseWidth = loadedBg.width * 0.6
      const baseScale = baseWidth / loadedBarcode.width
      const baseHeight = loadedBarcode.height * baseScale
      const targetWidth = baseWidth + 346
      const targetHeight = baseHeight + 77
      ctx.drawImage(loadedBarcode, 105, 102, targetWidth, targetHeight)
    })
    .catch(() => {})
    .finally(() => URL.revokeObjectURL(svgUrl))
}

function onBack() {
  printErrMsg.value = ''
  showScreen('carrier-input')
}

async function onPrint() {
  if (isPrinting.value) return
  isPrinting.value = true
  printErrMsg.value = ''
  try {
    try {
      const ok = await composeAndPrint('carrier-with-background.png')
      if (ok) {
        showScreen('processing')
        setTimeout(() => {
          resetCarrier()
          showScreen('idle')
        }, 3000)
      } else {
        printErrMsg.value = '列印失敗（背景或條碼圖載入失敗）。請檢查網路或重試。'
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      printErrMsg.value = msg || '列印失敗，請檢查印表機連線或重試。若在瀏覽器測試，需於完整 WPF 程式中才能列印。'
    }
  } finally {
    isPrinting.value = false
  }
}

watch(selectedCardStyle, () => renderPreview(), { immediate: false })
watch(previewCanvasRef, () => renderPreview(), { immediate: true })

onMounted(() => {
  setTimeout(renderPreview, 100)
})
</script>

<template>
  <div class="screen screen--carrier-preview">
    <div class="carrier-panel">
      <h1 class="carrier-title">選擇卡片樣式</h1>
      <div class="card-templates">
        <button
          v-for="idx in 4"
          :key="idx"
          type="button"
          class="card-option"
          :class="{ selected: selectedCardStyle === idx }"
          @click="setSelectedCardStyle(idx)"
        >
          <img :src="getPreviewBackgroundUrl(idx)" :alt="`樣式${idx}`" />
        </button>
      </div>
      <h2 class="carrier-title" style="margin-top: 24px">成品預覽</h2>
      <div class="preview-box">
        <canvas ref="previewCanvasRef" id="previewCanvas"></canvas>
      </div>
      <div v-if="printErrMsg" class="carrier-err">{{ printErrMsg }}</div>
      <div class="buttons-row">
        <button type="button" class="btn-back" @click="onBack">
          重選
        </button>
        <button type="button" class="btn-print" :disabled="isPrinting" @click="onPrint">
          {{ isPrinting ? '列印中…' : '列印' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.screen--carrier-preview {
  position: absolute;
  inset: 0;
  background: #0f0f10;
  color: #fff;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  overflow-y: auto;
}

.carrier-panel {
  width: min(900px, 100%);
  max-width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 24px;
  padding: 22px;
  margin: auto;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
}

.carrier-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  letter-spacing: 1px;
}

.card-templates {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.card-option {
  width: 100%;
  border-radius: 12px;
  cursor: pointer;
  border: 3px solid transparent;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  background: rgba(0, 0, 0, 0.2);
  min-height: 120px;
  padding: 0;
  overflow: hidden;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.7);
  }

  &.selected {
    border-color: #ffd54f;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.preview-box {
  margin-top: 18px;
  padding: 12px;
  border-radius: 18px;
  background: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  max-height: min(480px, 50vh);
  overflow: hidden;
}

#previewCanvas {
  max-width: 100%;
  max-height: min(456px, calc(50vh - 24px));
  width: auto;
  height: auto;
  display: block;
}

.buttons-row {
  margin-top: 18px;
  margin-bottom: 8px;
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-shrink: 0;
}

.btn-back,
.btn-print {
  min-width: 96px;
  padding: 10px 18px;
  border-radius: 999px;
  border: none;
  font-size: 16px;
  letter-spacing: 4px;
  cursor: pointer;
}

.btn-back {
  background: #eee;
  color: #333;
}

.carrier-err {
  margin-top: 10px;
  color: #ffb4b4;
  font-size: 14px;
  text-align: center;
}

.btn-print {
  background: #000;
  color: #fff;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
</style>
