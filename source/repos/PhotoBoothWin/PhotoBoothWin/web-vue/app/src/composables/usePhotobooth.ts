import { ref, computed, shallowRef, nextTick } from 'vue'
import QRCode from 'qrcode'
import type { Template, ScreenName, FilterId, TemplateSlot } from '@/types/photobooth'
import { callHost } from './useHost'

type StickerInstance = {
  id: string
  imageUrl: string
  /** X, Y 為「該格」內的相對座標（0～1），0.5 表示該格置中 */
  x: number
  y: number
  /**
   * 貼圖寬度比例：1 代表該格寬度的 20%。
   * 合成時在該格範圍內依此比例繪製。
   */
  scale: number
}

const TEMPLATES: Template[] = [
  {
    id: 'bk01',
    preview: '/assets/templates/chooselayout/bk01.png',
    shotCount: 4,
    sizeKey: '4x6',
    captureW: 544,
    captureH: 471,
    stageSize: { maxWidth: '1000px', maxHeight: 'calc(100vh - 200px)' },
    frameAspectRatio: '544/471',
    width: 1205,
    height: 1795,
    slots: [
      { x: 43, y: 244, w: 544, h: 471 },
      { x: 42, y: 1225, w: 544, h: 471 },
      { x: 625, y: 244, w: 544, h: 471 },
      { x: 623, y: 1061, w: 544, h: 471 },
    ],
    // 換新框圖時設 displayW / displayH 為新圖的實際寬高（px），預覽與 video 會用這個尺寸
    shootLayout: { layoutKey: 'bk01', captureW: 544, captureH: 471, displayW: 988, displayH: 724 },
  },
  {
    id: 'bk02',
    preview: '/assets/templates/chooselayout/bk02.png',
    shotCount: 4,
    sizeKey: '4x6',
    captureW: 547,
    captureH: 405,
    stageSize: { maxWidth: '1000px', maxHeight: 'calc(100vh - 200px)' },
    frameAspectRatio: '547/405',
    width: 1205,
    height: 1795,
    slots: [
      { x: 39, y: 667, w: 547, h: 405 },
      { x: 39, y: 1158, w: 547, h: 405 },
      { x: 662, y: 667, w: 547, h: 405 },
      { x: 662, y: 1158, w: 547, h: 405 },
    ],
    shootLayout: { layoutKey: 'bk02', captureW: 547, captureH: 405 },
  },
  {
    id: 'bk03',
    preview: '/assets/templates/chooselayout/bk03.png',
    shotCount: 2,
    sizeKey: '4x6',
    captureW: 524,
    captureH: 502,
    stageSize: { maxWidth: '1000px', maxHeight: 'calc(100vh - 200px)' },
    frameAspectRatio: '524/502',
    width: 1205,
    height: 1795,
    slots: [
      { x: 56, y: 1004, w: 524, h: 502 },
      { x: 637, y: 590, w: 524, h: 502 },
    ],
    shootLayout: { layoutKey: 'bk03', captureW: 524, captureH: 502 },
  },
  {
    id: 'bk04',
    preview: '/assets/templates/chooselayout/bk04.png',
    shotCount: 4,
    sizeKey: '4x6',
    captureW: 529,
    captureH: 400,
    stageSize: { maxWidth: '1000px', maxHeight: 'calc(100vh - 200px)' },
    frameAspectRatio: '529/400',
    width: 1205,
    height: 1795,
    slots: [
      { x: 54, y: 761, w: 529, h: 400 },
      { x: 632, y: 761, w: 529, h: 400 },
      { x: 54, y: 1290, w: 529, h: 400 },
      { x: 632, y: 1290, w: 529, h: 400 },
    ],
    shootLayout: { layoutKey: 'bk04', captureW: 529, captureH: 400 },
  },
]

/** 選角暫停後列印：2"×6" 條幅（300dpi 常見 600×1800），Hot Folder 子資料夾名為 2x6 */
export const CHOOSE_CHARACTER_2X6: Template = {
  id: 'choose-character-2x6',
  preview: '',
  shotCount: 1,
  sizeKey: '2x6',
  captureW: 600,
  captureH: 1800,
  stageSize: { maxWidth: '1000px', maxHeight: 'calc(100vh - 200px)' },
  frameAspectRatio: '600/1800',
  width: 600,
  height: 1800,
  slots: [{ x: 0, y: 0, w: 600, h: 1800 }],
}

// 單例狀態：所有元件共用同一份，測試面板的切換才會生效
const currentScreen = ref<ScreenName>('idle')
const selectedTemplate = shallowRef<Template | null>(null)
const loading = ref(false)
const captureResults = ref<string[]>([])
const finalFilePath = ref<string | null>(null)
const finalPreviewUrl = ref<string>('')
const qrImageUrl = ref<string>('')
const qrText = ref<string>('')
const autoPrint = ref(false)
const selectedFilter = ref<FilterId | null>(null)
/** 倒數拍攝過程錄下的影片 blob，合成後上傳並在 QR 頁提供下載 */
const captureVideoBlob = ref<Blob | null>(null)
const finalVideoUrl = ref<string>('')
/** 是否為測試模式（使用測試功能時設定，記錄資料會標記為測試資料） */
const isTestSession = ref(false)
/** 使用者在濾鏡畫面擺放的貼圖，依「格」分開（key = 格索引 0-based） */
const stickersBySlot = ref<Record<number, StickerInstance[]>>({})
const nextStickerId = ref(1)
/** 記憶遊戲解鎖的版型索引（0=bk01, 1=bk02...）。null 表示顯示全部（如測試面板） */
const unlockedTemplateIndices = ref<number[] | null>(null)
/** 選角流程：合成完成進結果頁後立刻進列印中（略過結果頁倒數） */
const immediatePrintAfterNextResult = ref(false)
/** 顧客用手機 QR 上傳後取得的圖片 URL（選版型後用於合成） */
const pendingCustomerUploadUrl = ref<string>('')
/** 是否為「先 QR 上傳再選版型」流程（避免選版型時 reset 清掉待合成圖） */
const isCustomerUploadFlow = ref(false)
const templates = computed(() => TEMPLATES)
/** 選版型頁面顯示的版型：若有解鎖列表則只顯示解鎖的，否則顯示全部 */
const availableTemplates = computed(() => {
  const unlocked = unlockedTemplateIndices.value
  if (unlocked == null || unlocked.length === 0) return TEMPLATES
  return TEMPLATES.filter((_, i) => unlocked.includes(i))
})

/** 結果畫面要顯示的圖：有合成圖用合成圖，否則依 env 顯示版型占位圖（左側大圖） */
const resultDisplayUrl = computed(() => {
  if (finalPreviewUrl.value) return finalPreviewUrl.value
  const showPlaceholder = import.meta.env.VITE_RESULT_SHOW_TEMPLATE_PLACEHOLDER
  if (showPlaceholder === '1' || showPlaceholder === 'true') {
    const tpl = selectedTemplate.value
    const id = tpl?.id ?? 'bk01'
    return `/assets/templates/QRcodePage/${id}.png`
  }
  return ''
})

/** 占位時顯示的 QR 圖與文字（尚無合成圖時用，非同步產生） */
const placeholderQrImageUrl = ref<string>('')
const PLACEHOLDER_QR_TEXT = 'https://example.com/download'
QRCode.toDataURL(PLACEHOLDER_QR_TEXT, { width: 600, margin: 2 })
  .then((url: string) => { placeholderQrImageUrl.value = url })
  .catch(() => {})

/** 結果畫面要顯示的 QR 圖：有合成圖用真實 QR，否則占位時用預設 QR */
const qrDisplayUrl = computed(() => {
  if (finalPreviewUrl.value) return qrImageUrl.value
  const showPlaceholder = import.meta.env.VITE_RESULT_SHOW_TEMPLATE_PLACEHOLDER
  if (showPlaceholder === '1' || showPlaceholder === 'true') return placeholderQrImageUrl.value
  return ''
})

/** 結果畫面要顯示的 QR 文字：有合成圖用真實網址，否則占位時用預設網址 */
const qrDisplayText = computed(() => {
  if (finalPreviewUrl.value) return qrText.value
  const showPlaceholder = import.meta.env.VITE_RESULT_SHOW_TEMPLATE_PLACEHOLDER
  if (showPlaceholder === '1' || showPlaceholder === 'true') return PLACEHOLDER_QR_TEXT
  return ''
})

/** 是否顯示 QR code（VITE_QRCODE_ENABLED=0 或 false 時隱藏，預設 1） */
const showQrCode = computed(() => {
  const v = import.meta.env.VITE_QRCODE_ENABLED
  if (v === '0' || String(v).toLowerCase() === 'false') return false
  return true
})

const TEST_IMAGE_BASE = '/assets/templates/test'
async function setCaptureResultsFromTestImages() {
  // 標記為測試模式
  isTestSession.value = true
  const tplId = selectedTemplate.value?.id ?? 'bk01'
  try {
    const res = await callHost('load_test_captures', { templateId: tplId }) as { urls?: string[] }
    if (Array.isArray(res.urls) && res.urls.length > 0) {
      captureResults.value = res.urls
      return
    }
  } catch {
    // 無測試存檔時用預設測試圖
  }
  const tpl = selectedTemplate.value
  const n = tpl?.shotCount ?? 4
  captureResults.value = Array.from({ length: n }, (_, i) => `${TEST_IMAGE_BASE}/test${i}.jpg`)
}

export function usePhotobooth() {

  const setLoading = (show: boolean) => {
    loading.value = show
  }

  function showScreen(name: ScreenName) {
    // #region agent log
    const prev = currentScreen.value
    try {
      const win = typeof window !== 'undefined' ? (window as unknown as { __logPhotobooth?: (p: unknown) => void }) : null
      if (win?.__logPhotobooth) win.__logPhotobooth({ showScreen: name, prev })
    } catch { /* noop */ }
    fetch('http://127.0.0.1:7242/ingest/60461173-9774-483b-a750-822bb1590c42', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'usePhotobooth.ts:showScreen', message: 'showScreen_called', data: { name, prev }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H2,H3' }) }).catch(() => {})
    // #endregion
    // 切到選版型／待機前先 reset，避免使用者看到預設版型閃現
    if (name === 'template') {
      // #region agent log
      const isTestBeforeReset = isTestSession.value
      fetch('http://127.0.0.1:7242/ingest/60461173-9774-483b-a750-822bb1590c42', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b8574e' }, body: JSON.stringify({ sessionId: 'b8574e', location: 'usePhotobooth.ts:showScreen:before_reset', message: 'template_screen_isTest_before_reset', data: { name, isTestSession: isTestBeforeReset }, timestamp: Date.now(), hypothesisId: 'H1', runId: 'post-fix' }) }).catch(() => {})
      // #endregion
      const preserveTestSession = isTestSession.value
      const savedCustomerUrl = pendingCustomerUploadUrl.value
      const saveCustomerFlow = isCustomerUploadFlow.value
      resetSession()
      if (preserveTestSession) isTestSession.value = true
      if (saveCustomerFlow && savedCustomerUrl) {
        pendingCustomerUploadUrl.value = savedCustomerUrl
        isCustomerUploadFlow.value = true
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/60461173-9774-483b-a750-822bb1590c42', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b8574e' }, body: JSON.stringify({ sessionId: 'b8574e', location: 'usePhotobooth.ts:showScreen:after_reset', message: 'template_screen_isTest_after_reset', data: { name, isTestSession: isTestSession.value }, timestamp: Date.now(), hypothesisId: 'H1', runId: 'post-fix' }) }).catch(() => {})
      // #endregion
      notifyBillAcceptorState(false)
    }
    if (name === 'customer-upload-qr') {
      resetSession()
      notifyBillAcceptorState(false)
    }
    if (name === 'idle') {
      resetSession()
      unlockedTemplateIndices.value = null
      notifyBillAcceptorState(true)
    }
    currentScreen.value = name
  }

  function selectFilter(id: FilterId | null) {
    selectedFilter.value = id
  }

  function notifyBillAcceptorState(enabled: boolean) {
    try {
      const win = window as unknown as { chrome?: { webview?: { postMessage: (msg: string) => void } } }
      if (win.chrome?.webview) {
        win.chrome.webview.postMessage(
          JSON.stringify({ '@event': 'bill_acceptor_control', enabled })
        )
      }
    } catch {
      // ignore
    }
  }

  function getDefaultTemplateIndex(): number {
    if (!TEMPLATES.length) return 0
    const raw = import.meta.env.VITE_DEFAULT_TEMPLATE_INDEX
    const idx = raw !== undefined && raw !== '' ? parseInt(raw, 10) : 0
    if (Number.isNaN(idx) || idx < 0) return 0
    return Math.min(idx, TEMPLATES.length - 1)
  }

  function selectTemplate(t: Template | null) {
    selectedTemplate.value = t
  }

  function setUnlockedTemplateIndices(indices: number[] | null) {
    unlockedTemplateIndices.value = indices
  }

  function setCaptureResults(urls: string[]) {
    captureResults.value = urls
  }

  function setCaptureVideoBlob(blob: Blob | null) {
    captureVideoBlob.value = blob
  }

  function addSticker(slotIndex: number, imageUrl: string, x = 0.5, y = 0.5, scale = 1) {
    const id = `sticker-${nextStickerId.value++}`
    const clampedX = Math.max(0, Math.min(1, x))
    const clampedY = Math.max(0, Math.min(1, y))
    const clampedScale = Math.max(0.3, Math.min(3, scale))
    const list = stickersBySlot.value[slotIndex] ?? []
    stickersBySlot.value = {
      ...stickersBySlot.value,
      [slotIndex]: [...list, { id, imageUrl, x: clampedX, y: clampedY, scale: clampedScale }],
    }
  }

  function updateSticker(slotIndex: number, id: string, patch: Partial<Omit<StickerInstance, 'id'>>) {
    const list = stickersBySlot.value[slotIndex] ?? []
    const idx = list.findIndex((s) => s.id === id)
    if (idx === -1) return
    const prev = list[idx]
    if (!prev) return
    const next: StickerInstance = {
      id: prev.id,
      imageUrl: patch.imageUrl ?? prev.imageUrl,
      x: Math.max(0, Math.min(1, patch.x ?? prev.x)),
      y: Math.max(0, Math.min(1, patch.y ?? prev.y)),
      scale: Math.max(0.3, Math.min(3, patch.scale ?? prev.scale)),
    }
    const copy = list.slice()
    copy[idx] = next
    stickersBySlot.value = { ...stickersBySlot.value, [slotIndex]: copy }
  }

  function removeSticker(slotIndex: number, id: string) {
    const list = stickersBySlot.value[slotIndex] ?? []
    const next = list.filter((s) => s.id !== id)
    if (next.length === 0) {
      const { [slotIndex]: _, ...rest } = stickersBySlot.value
      stickersBySlot.value = rest
    } else {
      stickersBySlot.value = { ...stickersBySlot.value, [slotIndex]: next }
    }
  }

  function resetSession() {
    captureResults.value = []
    finalFilePath.value = null
    finalPreviewUrl.value = ''
    finalVideoUrl.value = ''
    qrImageUrl.value = ''
    qrText.value = ''
    captureVideoBlob.value = null
    selectedTemplate.value = null
    selectedFilter.value = null
    isTestSession.value = false
    stickersBySlot.value = {}
    pendingCustomerUploadUrl.value = ''
    isCustomerUploadFlow.value = false
  }

  function setTestSession(isTest: boolean) {
    isTestSession.value = isTest
  }

  /** 手機上傳完成後：記住圖片 URL 並進入選版型（與 showScreen('template') 內保留邏輯搭配） */
  function setPendingCustomerUploadAndGoToTemplate(imageUrl: string) {
    pendingCustomerUploadUrl.value = imageUrl
    isCustomerUploadFlow.value = true
    unlockedTemplateIndices.value = [0, 1, 2, 3]
    const list = templates.value
    if (list.length > 0) {
      const idx = getDefaultTemplateIndex()
      const tpl = list[idx] ?? list[0] ?? null
      if (tpl) selectTemplate(tpl)
    }
    showScreen('template')
  }

  /**
   * 選版型確認：在顧客上傳流程中，將同一張照片重複填入各格並合成
   */
  function startCustomerUploadCompose(): boolean {
    const url = pendingCustomerUploadUrl.value
    const tpl = selectedTemplate.value
    if (!url || !tpl) return false
    setCaptureResults(Array.from({ length: tpl.shotCount }, () => url))
    pendingCustomerUploadUrl.value = ''
    isCustomerUploadFlow.value = false
    showScreen('uploading')
    void buildFinalOutput()
    return true
  }

  function setResultMock() {
    finalPreviewUrl.value = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
    qrText.value = 'https://example.com/test'
    QRCode.toDataURL('https://example.com/test', { width: 600, margin: 2 })
      .then((url: string) => { qrImageUrl.value = url })
      .catch(() => { qrImageUrl.value = '' })
  }

  /**
   * 從 .env 讀取合成用座標（每格 寬,高,x,y 逗號串接），未設或格式錯誤則用 template.slots
   * 例：VITE_BK01_SYNTHESIS=544,471,43,244,544,471,42,1225,544,471,625,244,544,471,623,1061
   */
  function getSynthesisSlots(tpl: Template): TemplateSlot[] {
    const key = `VITE_${tpl.id.toUpperCase()}_SYNTHESIS` as keyof ImportMetaEnv
    const raw = import.meta.env[key]
    if (typeof raw !== 'string' || !raw.trim()) return tpl.slots
    const parts = raw.split(',').map((s) => parseInt(s.trim(), 10))
    const n = tpl.slots.length
    if (parts.length !== n * 4) return tpl.slots
    const slots: TemplateSlot[] = []
    for (let i = 0; i < n; i++) {
      const w = parts[i * 4 + 0] ?? NaN
      const h = parts[i * 4 + 1] ?? NaN
      const x = parts[i * 4 + 2] ?? NaN
      const y = parts[i * 4 + 3] ?? NaN
      if (Number.isNaN(w) || Number.isNaN(h) || Number.isNaN(x) || Number.isNaN(y)) return tpl.slots
      slots.push({ w, h, x, y })
    }
    return slots
  }

  const FILTER_CSS: Record<FilterId, string> = {
    'baby-pink':
      'brightness(1.17) contrast(0.88) saturate(1.11) hue-rotate(0deg) grayscale(0.14) sepia(0) invert(0) opacity(1) blur(0px) drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))',
    'clear-blue':
      'brightness(1.11) contrast(1.1) saturate(0.87) hue-rotate(16deg) grayscale(0.36) sepia(0.04) invert(0.04) opacity(1) blur(0px) drop-shadow(1px 0px 0px rgba(0, 0, 0, 0))',
    'vintage-retro':
      'brightness(0.78) contrast(1.63) saturate(0.8) hue-rotate(-3.3deg) grayscale(0) sepia(0.39) invert(0.08) opacity(1) blur(0px) drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))',
    'fresh-korean':
      'brightness(1.02) contrast(0.89) saturate(1.1) hue-rotate(-15deg) grayscale(0) sepia(0) invert(0) opacity(1) blur(0px) drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))',
    'soft-milk-tea':
      'brightness(0.95) contrast(1) saturate(1.07) hue-rotate(0deg) grayscale(0.24) sepia(0.21) invert(0.03) opacity(1) blur(0px) drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))',
    'neutral-gray':
      'brightness(1.09) contrast(1.11) saturate(1.84) hue-rotate(-15.7deg) grayscale(0.86) sepia(0.22) invert(0) opacity(1) blur(0px) drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))',
  }

  const FILTER_COLOR_BALANCE: Record<FilterId, { deltaR: number; deltaG: number; deltaB: number }> = {
    'baby-pink': { deltaR: -20.48, deltaG: -11.52, deltaB: 7.68 },
    'clear-blue': { deltaR: -30.72, deltaG: -26.88, deltaB: 30.72 },
    'vintage-retro': { deltaR: 17.92, deltaG: 0, deltaB: -16.64 },
    'fresh-korean': { deltaR: -12.8, deltaG: 0, deltaB: 19.2 },
    'soft-milk-tea': { deltaR: 6.4, deltaG: -7.68, deltaB: 8.96 },
    'neutral-gray': { deltaR: -48.64, deltaG: -15.36, deltaB: 15.36 },
  }

  /** 選中濾鏡對應的 Canvas filter（合成／預覽時套用）；選濾鏡模式一律用 canvas 繪圖 */
  function getFilterCssForCanvas(filterId: FilterId | null): string {
    if (!filterId) return 'none'
    return FILTER_CSS[filterId] ?? 'none'
  }

  /** 若該濾鏡需套色彩平衡則回傳 { deltaR, deltaG, deltaB }，否則 null */
  function getColorBalanceForFilter(
    filterId: FilterId | null
  ): { deltaR: number; deltaG: number; deltaB: number } | null {
    if (!filterId) return null
    return FILTER_COLOR_BALANCE[filterId] ?? null
  }

  /** 色彩平衡（如 PS 青↔紅、洋紅↔綠、黃↔藍），直接修改 ImageData */
  function applyColorBalance(
    imageData: ImageData,
    deltaR: number,
    deltaG: number,
    deltaB: number
  ): void {
    const data = imageData.data
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp((data[i] ?? 0) + deltaR)
      data[i + 1] = clamp((data[i + 1] ?? 0) + deltaG)
      data[i + 2] = clamp((data[i + 2] ?? 0) + deltaB)
    }
  }

  function getPrintingShowSecForPrint(): number {
    const raw = import.meta.env.VITE_PRINTING_SHOW_SEC
    if (raw === undefined || raw === '') return 20
    const n = parseInt(raw, 10)
    return Number.isNaN(n) || n < 1 ? 20 : Math.min(120, n)
  }

  function getSkipPrintForPrint(): boolean {
    const v = import.meta.env.VITE_SKIP_PRINT
    return v === '1' || String(v).toLowerCase() === 'true'
  }

  function getReceiptAmountForPrint(): string {
    const v = import.meta.env.VITE_RECEIPT_AMOUNT
    return typeof v === 'string' && v !== '' ? v : '0'
  }

  function getLogPrintRecordWhenSkipForPrint(): boolean {
    const v = import.meta.env.VITE_LOG_PRINT_RECORD_WHEN_SKIP
    return v === '1' || String(v).toLowerCase() === 'true'
  }

  function getProjectNameForPrint(): string {
    const v = import.meta.env.VITE_PROJECT_NAME
    return typeof v === 'string' ? v : ''
  }

  function getMachineNameForPrint(): string {
    const v = import.meta.env.VITE_MACHINE_NAME
    return typeof v === 'string' ? v : ''
  }

  function getIsTestForPrint(): boolean {
    if (isTestSession.value) return true
    const v = import.meta.env.VITE_TEST_FAST_COUNTDOWN
    return v === '1' || String(v).toLowerCase() === 'true'
  }

  function getFinalFileNameForPrint(): string {
    const path = finalFilePath.value
    if (!path) return ''
    return path.replace(/^.*[/\\]/, '') || ''
  }

  /**
   * 結果頁自動列印／選角立即列印共用：進列印中 → DNP → 紀錄 → N 秒後回待機。
   * @param copiesForRecord 寫入 CSV 的份數（熱資料夾仍送 1 張，與原 ScreenResult 自動列印一致）
   */
  function goToPrintingThenIdle(copiesForRecord = 1) {
    const printingSec = getPrintingShowSecForPrint()
    const skipPrint = getSkipPrintForPrint()
    showScreen('processing')
    if (!finalFilePath.value) {
      setTimeout(() => {
        autoPrint.value = false
        resetSession()
        showScreen('idle')
      }, printingSec * 1000)
      return
    }
    if (skipPrint) {
      if (getLogPrintRecordWhenSkipForPrint()) {
        callHost('log_print_record', {
          templateName: selectedTemplate.value?.id ?? 'unknown',
          printTime: new Date().toISOString(),
          amount: getReceiptAmountForPrint(),
          projectName: getProjectNameForPrint(),
          machineName: getMachineNameForPrint(),
          copies: copiesForRecord,
          fileName: getFinalFileNameForPrint(),
          isTest: getIsTestForPrint(),
        }).finally(() => {
          setTimeout(() => {
            autoPrint.value = false
            resetSession()
            showScreen('idle')
          }, printingSec * 1000)
        })
      } else {
        setTimeout(() => {
          autoPrint.value = false
          resetSession()
          showScreen('idle')
        }, printingSec * 1000)
      }
      return
    }
    callHost('print_hotfolder', {
      filePath: finalFilePath.value,
      sizeKey: selectedTemplate.value?.sizeKey ?? '4x6',
      copies: 1,
    })
      .then(() =>
        callHost('log_print_record', {
          templateName: selectedTemplate.value?.id ?? 'unknown',
          printTime: new Date().toISOString(),
          amount: getReceiptAmountForPrint(),
          projectName: getProjectNameForPrint(),
          machineName: getMachineNameForPrint(),
          copies: copiesForRecord,
          fileName: getFinalFileNameForPrint(),
          isTest: getIsTestForPrint(),
        })
      )
      .finally(() => {
        setTimeout(() => {
          autoPrint.value = false
          resetSession()
          showScreen('idle')
        }, printingSec * 1000)
      })
  }

  async function buildFinalOutput() {
    const tpl = selectedTemplate.value
    if (!tpl) return
    if (!captureResults.value.length) {
      try {
        const res = await callHost('load_captures', {}) as { urls?: string[] }
        if (Array.isArray(res.urls) && res.urls.length > 0) {
          captureResults.value = res.urls
        }
      } catch {
        // ignore
      }
    }
    if (!captureResults.value.length) return
    showScreen('uploading')
    await nextTick()
    try {
      const canvas = document.createElement('canvas')
      canvas.width = tpl.width
      canvas.height = tpl.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const loadImg = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          if (src.startsWith('http://') || src.startsWith('https://')) {
            img.crossOrigin = 'anonymous'
          }
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = src
        })
      // 底層：每一格畫照片（合成座標來自 env 或 template.slots）
      const synthesisSlots = getSynthesisSlots(tpl)
      const filterCss = getFilterCssForCanvas(selectedFilter.value)
      for (let i = 0; i < Math.min(captureResults.value.length, synthesisSlots.length); i++) {
        const url = captureResults.value[i]
        const slot = synthesisSlots[i]
        if (url === undefined || url === '' || slot === undefined) continue
        const img = await loadImg(url)
        ctx.save()
        ctx.filter = filterCss
        // 填滿框、裁切溢出（object-fit: cover），與預覽一致
        const scale = Math.max(slot.w / img.naturalWidth, slot.h / img.naturalHeight)
        const drawW = img.naturalWidth * scale
        const drawH = img.naturalHeight * scale
        const dx = slot.x + (slot.w - drawW) / 2
        const dy = slot.y + (slot.h - drawH) / 2
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, drawW, drawH)
        const balance = getColorBalanceForFilter(selectedFilter.value)
        if (balance) {
          const sx = Math.round(dx)
          const sy = Math.round(dy)
          const sw = Math.max(1, Math.round(drawW))
          const sh = Math.max(1, Math.round(drawH))
          const imageData = ctx.getImageData(sx, sy, sw, sh)
          applyColorBalance(imageData, balance.deltaR, balance.deltaG, balance.deltaB)
          ctx.putImageData(imageData, sx, sy)
        }
        ctx.restore()
        img.src = '' // 釋放解碼後的點陣圖記憶體
      }
      // 前景：疊上 QRcodePage 外框
      const qrBgUrl = `/assets/templates/QRcodePage/${tpl.id}.png`
      try {
        const bgImg = await loadImg(qrBgUrl)
        ctx.drawImage(bgImg, 0, 0, tpl.width, tpl.height, 0, 0, tpl.width, tpl.height)
        bgImg.src = '' // 釋放外框圖記憶體
      } catch {
        // 無外框圖時不覆蓋
      }

      // 貼圖（固定 Logo）：在外框之上再疊一層 Texture 貼圖（PNG 透明底）
      // 檔案路徑：/assets/templates/Texture/1.png
      // try {
      //   const stickerUrl = '/assets/templates/Texture/1.png'
      //   const stickerImg = await loadImg(stickerUrl)
      //   // 依模板尺寸動態縮放，最大佔寬高 40%，避免過大
      //   const maxStickerW = tpl.width * 0.4
      //   const maxStickerH = tpl.height * 0.4
      //   const scale = Math.min(
      //     maxStickerW / stickerImg.naturalWidth,
      //     maxStickerH / stickerImg.naturalHeight,
      //     1
      //   )
      //   const stickerW = stickerImg.naturalWidth * scale
      //   const stickerH = stickerImg.naturalHeight * scale
      //   // 預設貼在右下角，保留 40px 邊界
      //   const margin = 40
      //   const sx = tpl.width - stickerW - margin
      //   const sy = tpl.height - stickerH - margin
      //   ctx.drawImage(
      //     stickerImg,
      //     0,
      //     0,
      //     stickerImg.naturalWidth,
      //     stickerImg.naturalHeight,
      //     sx,
      //     sy,
      //     stickerW,
      //     stickerH
      //   )
      //   stickerImg.src = '' // 釋放貼圖記憶體
      // } catch {
      //   // 無貼圖檔案時略過，不影響主流程
      // }

      // 使用者貼圖畫在外框「之上」、與預覽相同座標（格內 0～1），所見即所得（依 VITE_STICKER_ENABLED 開關）
      const isStickerEnabled =
        import.meta.env.VITE_STICKER_ENABLED === '1' ||
        String(import.meta.env.VITE_STICKER_ENABLED ?? '').toLowerCase() === 'true'
      const SLOT_STICKER_WIDTH_RATIO = 0.2
      for (let i = 0; i < synthesisSlots.length; i++) {
        const slot = synthesisSlots[i]
        if (!slot) continue
        const slotStickers = isStickerEnabled ? (stickersBySlot.value[i] ?? []) : []
        for (const st of slotStickers) {
          try {
            const stImg = await loadImg(st.imageUrl)
            const baseW = slot.w * SLOT_STICKER_WIDTH_RATIO * st.scale
            const aspect =
              stImg.naturalWidth > 0 && stImg.naturalHeight > 0
                ? stImg.naturalHeight / stImg.naturalWidth
                : 1
            const stDrawW = baseW
            const stDrawH = baseW * aspect
            const centerX = slot.x + slot.w * st.x
            const centerY = slot.y + slot.h * st.y
            const stDx = centerX - stDrawW / 2
            const stDy = centerY - stDrawH / 2
            ctx.drawImage(
              stImg,
              0,
              0,
              stImg.naturalWidth,
              stImg.naturalHeight,
              stDx,
              stDy,
              stDrawW,
              stDrawH
            )
            stImg.src = ''
          } catch {
            // 單張貼圖失敗時略過
          }
        }
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      canvas.width = 1
      canvas.height = 1
      const saveRes = await callHost('save_image', { imageData: dataUrl }) as { filePath?: string }
      const filePath = saveRes.filePath ?? ''
      finalFilePath.value = filePath
      finalPreviewUrl.value = dataUrl

      // 結果圖就緒（列印改由結果頁按鈕或 60 秒自動觸發）
      callHost('result_image_ready', {
        filePath,
        imageData: dataUrl,
        sizeKey: tpl.sizeKey ?? '4x6',
      }).catch(() => {})

      if (showQrCode.value) {
        const basePage = typeof import.meta.env.VITE_DOWNLOAD_PAGE_BASE_URL === 'string' && import.meta.env.VITE_DOWNLOAD_PAGE_BASE_URL
          ? import.meta.env.VITE_DOWNLOAD_PAGE_BASE_URL.replace(/\/$/, '')
          : ''

        // 上傳完成後再進結果頁：取得圖片／影片 URL，組出帶參數的下載頁網址給 QR code
        let imageUrl = ''
        try {
          const uploadRes = await callHost('upload_file', { filePath }) as { url?: string }
          imageUrl = uploadRes?.url ?? ''
        } catch (e) {
          console.error('[拍貼機] 上傳合成圖失敗', e)
        }
        let videoUrl = ''
        if (captureVideoBlob.value) {
          const videoDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(captureVideoBlob.value!)
          })
          try {
            const videoRes = await callHost('upload_video', { videoData: videoDataUrl }) as { url?: string }
            videoUrl = videoRes?.url ?? ''
            finalVideoUrl.value = videoUrl
          } catch (e) {
            console.error('[拍貼機] 上傳影片失敗', e)
          }
        }

        // 下載頁需 ?img=... 與選填 &video=...，掃 QR 才能顯示相片／影片
        const qrUrl = basePage
          ? `${basePage}?img=${encodeURIComponent(imageUrl)}${videoUrl ? `&video=${encodeURIComponent(videoUrl)}` : ''}`
          : (imageUrl || 'https://example.com/download')
        qrText.value = qrUrl
        QRCode.toDataURL(qrUrl, { width: 600, margin: 2 })
          .then((url) => { qrImageUrl.value = url })
          .catch(() => { qrImageUrl.value = '' })
      }

      // 選角立即列印：不經結果頁（避免閃爍），直接進列印中
      if (immediatePrintAfterNextResult.value) {
        immediatePrintAfterNextResult.value = false
        goToPrintingThenIdle(1)
      } else {
        showScreen(showQrCode.value ? 'result' : 'result-no-qr')
      }

      const isTestMode = (v: string | undefined) => v === '1' || String(v).toLowerCase() === 'true'
      if (!isTestMode(import.meta.env.VITE_TEST_FAST_COUNTDOWN) && isTestMode(import.meta.env.VITE_LOG_USAGE)) {
        try {
          await callHost('append_usage_log', {
            folder: 'daily report',
            time: new Date().toISOString(),
            templateId: tpl.id,
            projectName: import.meta.env.VITE_PROJECT_NAME ?? '',
            isTest: isTestSession.value, // 標記是否為測試資料
          })
        } catch {
          // ignore
        }
      }
    } finally {
      // 不再使用 setLoading，由「照片上傳中」頁面取代轉圈圈
    }
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = () => reject(new Error('readAsDataURL failed'))
      r.readAsDataURL(blob)
    })
  }

  function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      if (src.startsWith('http://') || src.startsWith('https://')) {
        img.crossOrigin = 'anonymous'
      }
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('image load failed'))
      img.src = src
    })
  }

  /**
   * 選角列印專用：不上傳頁、不上傳 QR、不套版型外框／多格合成。
   * 優先以 fetch 原圖存檔；失敗時改為單次縮放至 2×6 印張像素再存 JPEG。
   */
  async function buildChooseCharacterPrintOnly(imageUrl: string) {
    const tpl = CHOOSE_CHARACTER_2X6
    selectedTemplate.value = tpl
    selectedFilter.value = null
    stickersBySlot.value = {}

    let dataUrl: string
    try {
      const res = await fetch(imageUrl)
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      dataUrl = await blobToDataUrl(blob)
    } catch {
      const img = await loadImageElement(imageUrl)
      const canvas = document.createElement('canvas')
      canvas.width = tpl.width
      canvas.height = tpl.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const scale = Math.max(tpl.width / img.naturalWidth, tpl.height / img.naturalHeight)
      const drawW = img.naturalWidth * scale
      const drawH = img.naturalHeight * scale
      const dx = (tpl.width - drawW) / 2
      const dy = (tpl.height - drawH) / 2
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, drawW, drawH)
      img.src = ''
      dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      canvas.width = 1
      canvas.height = 1
    }

    const saveRes = await callHost('save_image', { imageData: dataUrl }) as { filePath?: string }
    const filePath = saveRes.filePath ?? ''
    finalFilePath.value = filePath
    finalPreviewUrl.value = dataUrl

    callHost('result_image_ready', {
      filePath,
      imageData: dataUrl,
      sizeKey: tpl.sizeKey ?? '2x6',
    }).catch(() => {})

    if (immediatePrintAfterNextResult.value) {
      immediatePrintAfterNextResult.value = false
      goToPrintingThenIdle(1)
    }

    const isTestMode = (v: string | undefined) => v === '1' || String(v).toLowerCase() === 'true'
    if (!isTestMode(import.meta.env.VITE_TEST_FAST_COUNTDOWN) && isTestMode(import.meta.env.VITE_LOG_USAGE)) {
      try {
        await callHost('append_usage_log', {
          folder: 'daily report',
          time: new Date().toISOString(),
          templateId: tpl.id,
          projectName: import.meta.env.VITE_PROJECT_NAME ?? '',
          isTest: isTestSession.value,
        })
      } catch {
        // ignore
      }
    }
  }

  /**
   * 選角暫停後：不經上傳頁、不合成版型、不上傳 QR，直接存圖並進列印。
   */
  async function buildChooseCharacterStripPrint(imageUrl: string) {
    immediatePrintAfterNextResult.value = true
    try {
      await buildChooseCharacterPrintOnly(imageUrl)
    } finally {
      if (!finalFilePath.value) {
        immediatePrintAfterNextResult.value = false
      }
    }
  }

  function runDevStartPage() {
    const raw = import.meta.env.VITE_DEV_START_PAGE
    const n = raw !== undefined && raw !== '' ? parseInt(raw, 10) : null
    if (n == null || n < 0 || n > 4) return
    const names: ScreenName[] = ['idle', 'template', 'shoot', 'result', 'processing']
    const name = names[n]
    if (name !== undefined) showScreen(name)
  }

  return {
    currentScreen,
    selectedTemplate,
    selectedFilter,
    loading,
    captureResults,
    finalFilePath,
    finalPreviewUrl,
    resultDisplayUrl,
    finalVideoUrl,
    qrImageUrl,
    qrText,
    qrDisplayUrl,
    qrDisplayText,
    showQrCode,
    autoPrint,
    isTestSession,
    templates,
    availableTemplates,
    setUnlockedTemplateIndices,
    setLoading,
    showScreen,
    getDefaultTemplateIndex,
    selectTemplate,
    selectFilter,
    getFilterCssForCanvas,
    getColorBalanceForFilter,
    applyColorBalance,
    setCaptureResults,
    setCaptureVideoBlob,
    resetSession,
    buildFinalOutput,
    buildChooseCharacterStripPrint,
    immediatePrintAfterNextResult,
    goToPrintingThenIdle,
    runDevStartPage,
    setResultMock,
    callHost,
    setCaptureResultsFromTestImages,
    setTestSession,
    isCustomerUploadFlow,
    pendingCustomerUploadUrl,
    setPendingCustomerUploadAndGoToTemplate,
    startCustomerUploadCompose,
    // 貼圖相關（依格分開，key = 格索引 0-based）
    stickersBySlot,
    addSticker,
    updateSticker,
    removeSticker,
    /** 合成用格位（與 buildFinalOutput 一致），供預覽區對齊 slot 比例用 */
    getSynthesisSlots,
  }
}
