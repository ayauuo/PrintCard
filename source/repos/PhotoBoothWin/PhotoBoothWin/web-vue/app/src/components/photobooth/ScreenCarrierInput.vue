<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import SimpleKeyboard from 'simple-keyboard'
import 'simple-keyboard/build/css/index.css'
import JsBarcode from 'jsbarcode'
import { useCarrier, normalizeCarrier, isValidCarrier } from '@/composables/useCarrier'
import { usePhotobooth } from '@/composables/usePhotobooth'

const { showScreen } = usePhotobooth()
const { setCarrierNumber, setBarcodeSvgRef } = useCarrier()

const inputValue = ref('')
const errMsg = ref('')
const barcodeRef = ref<SVGElement | null>(null)
const keyboardRef = ref<SimpleKeyboard | null>(null)

function showErr(msg: string) {
  errMsg.value = msg
}
function clearErr() {
  errMsg.value = ''
}

function generateBarcode(): boolean {
  clearErr()
  const fixed = normalizeCarrier(inputValue.value)
  inputValue.value = fixed
  keyboardRef.value?.setInput(fixed)
  setCarrierNumber(fixed)

  if (!isValidCarrier(fixed)) {
    showErr('格式不正確：請輸入「/」+ 7 碼（A-Z、0-9、+、-、.），例如 /A1B2C.4（或直接輸入 7 碼會自動補 /）')
    if (barcodeRef.value) barcodeRef.value.innerHTML = ''
    return false
  }

  try {
    JsBarcode(barcodeRef.value!, fixed, {
      format: 'CODE39',
      width: 3,
      height: 90,
      margin: 8,
      displayValue: true,
      fontSize: 18,
      textMargin: 6,
      background: 'transparent',
      lineColor: '#000000',
    })
  } catch {
    barcodeRef.value && (barcodeRef.value.innerHTML = '')
    return false
  }
  return true
}

function onNext() {
  if (generateBarcode()) {
    setBarcodeSvgRef(barcodeRef.value)
    showScreen('carrier-preview')
  }
}

function syncKeyboardInput(val: string) {
  keyboardRef.value?.setInput(val)
}

function onClear() {
  keyboardRef.value?.clearInput()
  inputValue.value = ''
  setCarrierNumber('')
  clearErr()
  if (barcodeRef.value) barcodeRef.value.innerHTML = ''
}

onMounted(() => {
  keyboardRef.value = new SimpleKeyboard('.simple-keyboard', {
    theme: 'hg-theme-default',
    layout: {
      default: [
        '1 2 3 4 5 6 7 8 9 0',
        'Q W E R T Y U I O P',
        'A S D F G H J K L',
        '/ + - . Z X C V B N M {bksp}',
        '{clear} {enter} {gen}',
      ],
    },
    display: {
      '{bksp}': '⌫',
      '{enter}': '確定',
      '{clear}': '清除',
      '{gen}': '下一步',
    },
    onChange: (value) => {
      const fixed = normalizeCarrier(value)
      if (fixed !== value) keyboardRef.value?.setInput(fixed)
      inputValue.value = fixed
    },
    onKeyPress: (button) => {
      if (button === '{enter}') generateBarcode()
      if (button === '{gen}') onNext()
      if (button === '{clear}') onClear()
    },
  })
})

onUnmounted(() => {
  keyboardRef.value?.destroy()
  keyboardRef.value = null
})
</script>

<template>
  <div class="screen screen--carrier-input">
    <div class="carrier-panel">
      <h1 class="carrier-title">輸入載具號碼 → 產生載具</h1>
      <p class="carrier-hint">
        載具為 8 碼，開頭「/」，後面 7 碼（可用 A-Z、0-9、+、-、.）
      </p>

      <input
        v-model="inputValue"
        class="carrier-input"
        placeholder="/JNXJ3S0（或輸入 7 碼：JNXJ3S0）"
        autocomplete="off"
        inputmode="none"
        @input="(e) => { inputValue = normalizeCarrier((e.target as HTMLInputElement).value); syncKeyboardInput(inputValue) }"
      />

      <div v-if="errMsg" class="carrier-err">{{ errMsg }}</div>

      <div class="barcode-box" aria-label="barcode">
        <svg ref="barcodeRef" class="carrier-barcode"></svg>
      </div>

      <div class="simple-keyboard"></div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.screen--carrier-input {
  position: absolute;
  inset: 0;
  background: #0f0f10;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}

.carrier-panel {
  width: min(900px, 100%);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 24px;
  padding: 22px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
}

.carrier-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 10px;
  letter-spacing: 1px;
}

.carrier-hint {
  margin: 0 0 10px;
  opacity: 0.78;
  font-size: 14px;
  line-height: 1.45;
}

.carrier-input {
  width: 100%;
  font-size: 30px;
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  outline: none;
  box-sizing: border-box;
  letter-spacing: 2px;
  text-transform: uppercase;

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
}

.carrier-err {
  margin-top: 10px;
  color: #ffb4b4;
  font-size: 14px;
}

.barcode-box {
  margin-top: 14px;
  background: #fff;
  border: 1px dashed rgba(0, 0, 0, 0.18);
  border-radius: 18px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 150px;
  overflow: hidden;
}

.carrier-barcode {
  background: transparent;
  border-radius: 12px;
  padding: 0;
}

:deep(.simple-keyboard.hg-theme-default) {
  margin-top: 16px;
  background: #1d1f22;
  padding: 16px;
  border-radius: 22px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);

  .hg-button {
    background: #2e3136;
    color: #fff !important;
    border-radius: 14px;
    height: 62px;
    font-size: 20px;
    border: 1px solid rgba(255, 255, 255, 0.08);

    &:hover {
      background: #3a3e45;
    }
    &:active {
      background: #4b515b;
    }

    &[data-skbtn='{bksp}'] {
      background: #3b3b3b;
    }
    &[data-skbtn='{clear}'] {
      background: #6b4b00;
      font-weight: 700;
    }
    &[data-skbtn='{enter}'] {
      background: #c62828;
      font-weight: 800;
      width: 160px;
    }
    &[data-skbtn='{gen}'] {
      background: #2e7d32;
      font-weight: 800;
      width: 160px;
    }
  }

  .hg-button span {
    color: #fff !important;
  }
}
</style>
