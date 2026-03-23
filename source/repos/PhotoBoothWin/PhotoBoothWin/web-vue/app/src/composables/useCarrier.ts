import { ref, shallowRef } from 'vue'
import type { ScreenName } from '@/types/photobooth'
import { callHost } from './useHost'

const MAX_LEN = 8 // 手機條碼載具：/ + 7 碼

/** 載具號碼正規化：大寫、只保留有效字元、7 碼自動補 / */
export function normalizeCarrier(value: string): string {
  let cleaned = (value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9+\-./]/g, '')
  if (cleaned.length === 7 && cleaned[0] !== '/') cleaned = '/' + cleaned
  return cleaned.slice(0, MAX_LEN)
}

/** 驗證載具格式：/ + 7 碼（A-Z 0-9 + - .） */
export function isValidCarrier(v: string): boolean {
  return /^\/[A-Z0-9+\-.]{7}$/.test(v)
}

const carrierNumber = ref('')
const barcodeSvgRef = shallowRef<SVGElement | null>(null)
/** 切換到預覽時快取 SVG 字串，避免 DOM 被隱藏後參考失效 */
const barcodeSvgSnapshot = ref<string>('')
const selectedCardStyle = ref(1) // 1~4
const carrierBackgroundUrls = ref<string[]>([]) // 預覽用背景（由 C# 注入或預設）
const carrierActualBackgroundUrls = ref<string[]>([]) // 列印用背景

export function useCarrier() {
  function setCarrierNumber(v: string) {
    carrierNumber.value = normalizeCarrier(v)
  }

  function setBarcodeSvgRef(el: SVGElement | null) {
    barcodeSvgRef.value = el
    barcodeSvgSnapshot.value = el?.outerHTML?.trim() ?? ''
  }

  function setSelectedCardStyle(idx: number) {
    selectedCardStyle.value = Math.max(1, Math.min(4, idx))
  }

  function setCarrierBackgroundUrls(urls: string[]) {
    carrierBackgroundUrls.value = urls
  }

  function setCarrierActualBackgroundUrls(urls: string[]) {
    carrierActualBackgroundUrls.value = urls
  }

  /** 取得預覽用背景 URL（載具背景1~4） */
  function getPreviewBackgroundUrl(idx: number): string {
    const urls = carrierBackgroundUrls.value
    const u = urls?.[idx - 1]
    if (u) return u
    return `/assets/templates/carrier/載具背景${idx}.png`
  }

  /** 取得列印用背景 URL（實際背景1~4） */
  function getActualBackgroundUrl(idx: number): string {
    const urls = carrierActualBackgroundUrls.value
    const u = urls?.[idx - 1]
    if (u) return u
    return `/assets/templates/carrier/實際背景${idx}.png`
  }

  function resetCarrier() {
    carrierNumber.value = ''
    barcodeSvgRef.value = null
    barcodeSvgSnapshot.value = ''
    selectedCardStyle.value = 1
  }

  /** 取得條碼 SVG 字串（優先使用快取，避免 DOM 隱藏後失效） */
  function getBarcodeSvgData(): string | null {
    const svg = barcodeSvgRef.value
    if (svg?.outerHTML && svg.innerHTML.trim() !== '') return new XMLSerializer().serializeToString(svg)
    if (barcodeSvgSnapshot.value) return barcodeSvgSnapshot.value
    return null
  }

  /** 合成背景+條碼為 dataUrl，並送出列印。失敗時 throw 錯誤訊息供 UI 顯示。 */
  async function composeAndPrint(filename = 'carrier-with-background.png'): Promise<boolean> {
    const svgData = getBarcodeSvgData()
    if (!svgData) {
      console.warn('[載具列印] 條碼 SVG 為空，無法列印')
      throw new Error('條碼資料遺失，請返回上一頁重新產生條碼')
    }

    const backgroundUrl = getActualBackgroundUrl(selectedCardStyle.value)
    const bgImg = new Image()
    const barcodeImg = new Image()

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)
    barcodeImg.src = svgUrl

    return new Promise<boolean>((resolve, reject) => {
      Promise.all([
        new Promise<HTMLImageElement>((res, rej) => {
          bgImg.onload = () => res(bgImg)
          bgImg.onerror = () => rej(new Error('bg load fail'))
          bgImg.src = backgroundUrl
        }),
        new Promise<HTMLImageElement>((res, rej) => {
          barcodeImg.onload = () => res(barcodeImg)
          barcodeImg.onerror = () => rej(new Error('barcode load fail'))
          barcodeImg.src = svgUrl
        }),
      ])
        .then(([loadedBg, loadedBarcode]) => {
          console.log('[載具列印] 背景與條碼載入成功，合成中…')
          const canvas = document.createElement('canvas')
          canvas.width = loadedBg.width
          canvas.height = loadedBg.height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(false)
            return
          }
          ctx.drawImage(loadedBg, 0, 0, loadedBg.width, loadedBg.height)

          const baseWidth = loadedBg.width * 0.6
          const baseScale = baseWidth / loadedBarcode.width
          const baseHeight = loadedBarcode.height * baseScale
          const targetWidth = baseWidth
          const targetHeight = baseHeight
          const x = 199
          const y = 142
          ctx.drawImage(loadedBarcode, x, y, targetWidth, targetHeight)

          const dataUrl = canvas.toDataURL('image/png')
          console.log('[載具列印] 合成完成，送出列印指令 (dataUrl 長度:', dataUrl.length, ')')
          callHost('print_hiti_carrier', { dataUrl, fileName: filename })
            .then(() => resolve(true))
            .catch((err) => {
              console.warn('[載具列印] callHost 失敗:', err)
              reject(err instanceof Error ? err : new Error(String(err)))
            })
        })
        .catch((err) => {
          console.warn('[載具列印] 圖片載入或合成失敗:', err)
          resolve(false)
        })
        .finally(() => URL.revokeObjectURL(svgUrl))
    })
  }

  return {
    carrierNumber,
    barcodeSvgRef,
    getBarcodeSvgData,
    selectedCardStyle,
    carrierBackgroundUrls,
    carrierActualBackgroundUrls,
    setCarrierNumber,
    setBarcodeSvgRef,
    setSelectedCardStyle,
    setCarrierBackgroundUrls,
    setCarrierActualBackgroundUrls,
    getPreviewBackgroundUrl,
    getActualBackgroundUrl,
    resetCarrier,
    composeAndPrint,
  }
}
