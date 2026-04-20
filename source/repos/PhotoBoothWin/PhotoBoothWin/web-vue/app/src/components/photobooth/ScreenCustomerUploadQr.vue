<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import QRCode from 'qrcode'
import { usePhotobooth } from '@/composables/usePhotobooth'

defineOptions({ name: 'ScreenCustomerUploadQr' })

const { currentScreen, showScreen, setPendingCustomerUploadAndGoToTemplate } = usePhotobooth()

const sessionId = ref('')
const qrDataUrl = ref('')
const statusMessage = ref('')
const pollError = ref('')

/**
 * 手機應開「首頁」含 session（GET），由頁內 JS 再 POST /upload；勿把 /upload API 當成 QR 目標。
 * 預設：http://HOST:PORT → QR 為 http://HOST:PORT/?session=uuid
 */
function getQrBase(): string {
  const raw = import.meta.env.VITE_CUSTOMER_UPLOAD_QR_BASE
  if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/\/$/, '')
  return 'http://18.177.149.30:3000'
}

function applySessionToUrlTemplate(tmpl: string, session: string): string {
  const enc = encodeURIComponent(session)
  return tmpl.replace(/\{\{session\}\}/g, enc).replace(/\{\{id\}\}/g, enc)
}

function getPollUrl(session: string): string {
  const tmpl = import.meta.env.VITE_CUSTOMER_UPLOAD_POLL_URL
  if (typeof tmpl === 'string' && tmpl.trim() && (tmpl.includes('{{id}}') || tmpl.includes('{{session}}'))) {
    return applySessionToUrlTemplate(tmpl.trim(), session)
  }
  const base = getQrBase()
  try {
    const u = new URL(base.includes('://') ? base : `http://${base}`)
    return `${u.origin}/upload/status?session=${encodeURIComponent(session)}`
  } catch {
    return `http://18.177.149.30:3000/upload/status?session=${encodeURIComponent(session)}`
  }
}

function getPollIntervalMs(): number {
  const raw = import.meta.env.VITE_CUSTOMER_UPLOAD_POLL_MS
  const n = raw !== undefined && raw !== '' ? parseInt(raw, 10) : 2000
  return Number.isNaN(n) || n < 500 ? 2000 : Math.min(60000, n)
}

function generateSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  return `u-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

const qrPageUrl = computed(() => {
  const id = sessionId.value
  if (!id) return ''
  const base = getQrBase()
  const join = base.includes('?') ? '&' : '?'
  return `${base}${join}session=${encodeURIComponent(id)}`
})

function parseUploadedImageUrl(data: unknown): string | null {
  if (data == null) return null
  if (typeof data === 'string') {
    if (data.startsWith('http://') || data.startsWith('https://')) return data
    try {
      return parseUploadedImageUrl(JSON.parse(data) as unknown)
    } catch {
      return null
    }
  }
  if (typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const keys = ['imageUrl', 'url', 'fileUrl', 'image', 'src']
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'))) return v
  }
  if (o.data && typeof o.data === 'object') {
    return parseUploadedImageUrl(o.data)
  }
  return null
}

async function pollOnce(): Promise<string | null> {
  const id = sessionId.value
  if (!id) return null
  const url = getPollUrl(id)
  const res = await fetch(url, { method: 'GET', cache: 'no-store', mode: 'cors' })
  if (res.status === 410 || res.status === 404) {
    pollError.value = '此 QR 已失效或已使用，請返回待機重新開始'
    return '__error__'
  }
  if (!res.ok) return null
  let data: unknown
  try {
    data = await res.json()
  } catch {
    return null
  }
  const imageUrl = parseUploadedImageUrl(data)
  if (imageUrl) return imageUrl
  if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>
    if (o.error === 'used' || o.invalid === true || o.expired === true) {
      pollError.value = '此上傳連結已失效'
      return '__error__'
    }
  }
  return null
}

let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPolling() {
  if (pollTimer != null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function startSession() {
  stopPolling()
  pollError.value = ''
  statusMessage.value = '請用手機掃描 QR code 上傳照片'
  sessionId.value = generateSessionId()
  const text = qrPageUrl.value
  try {
    qrDataUrl.value = await QRCode.toDataURL(text, { width: 420, margin: 2 })
  } catch {
    qrDataUrl.value = ''
  }

  const tick = async () => {
    if (currentScreen.value !== 'customer-upload-qr') return
    try {
      const got = await pollOnce()
      if (got === '__error__') {
        stopPolling()
        return
      }
      if (got) {
        stopPolling()
        statusMessage.value = '已收到照片，請稍候…'
        setPendingCustomerUploadAndGoToTemplate(got)
      }
    } catch {
      // 網路錯誤時略過，下次再詢問
    }
  }

  void tick()
  pollTimer = setInterval(() => void tick(), getPollIntervalMs())
}

watch(
  () => currentScreen.value === 'customer-upload-qr',
  (active) => {
    if (active) void startSession()
    else stopPolling()
  }
)

onMounted(() => {
  if (currentScreen.value === 'customer-upload-qr') void startSession()
})

onUnmounted(() => {
  stopPolling()
})

function onBackToIdle() {
  stopPolling()
  showScreen('idle')
}
</script>

<template>
  <div class="screen screen--customer-upload-qr" role="region" aria-label="手機上傳 QR code">
    <div class="customer-upload-qr__inner">
      <h1 class="customer-upload-qr__title">請掃描 QR code 上傳您的照片</h1>
      <p class="customer-upload-qr__hint">掃描後會開啟上傳首頁（含專屬 session），於手機選圖後再送出；成功後此 QR 即失效</p>
      <div v-if="qrDataUrl" class="customer-upload-qr__frame">
        <img class="customer-upload-qr__img" :src="qrDataUrl" alt="上傳用 QR code" />
      </div>
      <p v-else class="customer-upload-qr__loading">產生 QR 中…</p>
      <p class="customer-upload-qr__status">{{ statusMessage }}</p>
      <p v-if="pollError" class="customer-upload-qr__error">{{ pollError }}</p>
      <button type="button" class="customer-upload-qr__back" @click="onBackToIdle">返回待機</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.screen--customer-upload-qr {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a2e;
  background-image: linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #fff;
  z-index: 5;
}

.customer-upload-qr__inner {
  max-width: 640px;
  padding: 32px 24px 48px;
  text-align: center;
}

.customer-upload-qr__title {
  font-size: clamp(1.5rem, 4vw, 2rem);
  font-weight: 700;
  margin: 0 0 12px;
  letter-spacing: 0.04em;
}

.customer-upload-qr__hint {
  margin: 0 0 28px;
  font-size: 1rem;
  opacity: 0.85;
  line-height: 1.5;
}

.customer-upload-qr__frame {
  display: inline-block;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}

.customer-upload-qr__img {
  display: block;
  width: min(420px, 72vw);
  height: auto;
  vertical-align: top;
}

.customer-upload-qr__loading {
  margin: 24px 0;
  opacity: 0.8;
}

.customer-upload-qr__status {
  margin: 24px 0 8px;
  font-size: 1.1rem;
}

.customer-upload-qr__error {
  margin: 8px 0;
  color: #ffb4b4;
  font-size: 1rem;
}

.customer-upload-qr__back {
  margin-top: 32px;
  padding: 14px 36px;
  font-size: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.customer-upload-qr__back:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: #fff;
}
</style>
