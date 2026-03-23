<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { Template } from '@/types/photobooth'
import { usePhotobooth } from '@/composables/usePhotobooth'
import { unlockCountdownAudio } from '@/composables/useTakePicture'

const { templates, selectedTemplate, selectTemplate, showScreen } = usePhotobooth()

const msgboxVisible = ref(false)
const templateListRef = ref<HTMLElement | null>(null)
const hasSelection = computed(() => !!selectedTemplate.value)

function onCardClick(t: Template) {
  if (selectedTemplate.value?.id === t.id) {
    msgboxVisible.value = true
    return
  }
  selectTemplate(t)
}

function confirmTemplate() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/60461173-9774-483b-a750-822bb1590c42', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ScreenTemplate.vue:confirmTemplate', message: 'confirmTemplate_called', data: { hasSelection: !!selectedTemplate.value }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H1' }) }).catch(() => {})
  // #endregion
  unlockCountdownAudio()
  msgboxVisible.value = false
  // 立即切到拍照頁；若仍用 nextTick 導致未切換，改同步呼叫確保進入拍攝畫面
  showScreen('shoot')
}

function repeatChoose() {
  msgboxVisible.value = false
}

watch(selectedTemplate, (v) => {
  if (!v) msgboxVisible.value = false
})

// 相機改由 ScreenShoot.vue 進入拍照頁時才啟動，不在此預熱
</script>

<template>
  <div class="screen screen--template" role="region" aria-label="選版型畫面">
    <div class="screen-template__scroll">
      <h1 class="screen-template__title">選擇相框版型</h1>
      <!-- <button
        v-show="hasSelection"
        type="button"
        class="screen-template__start-btn"
        @click="confirmTemplate"
      >
        開始拍照
      </button> -->
      <div
        ref="templateListRef"
        class="screen-template__grid"
        :class="{ 'has-selection': hasSelection }"
      >
        <button
          v-for="t in templates"
          :key="t.id"
          type="button"
          class="screen-template__card"
          :class="{ 'is-selected': selectedTemplate?.id === t.id }"
          @click="onCardClick(t)"
        >
          <div class="screen-template__card-preview">
            <img
              class="screen-template__card-img"
              :src="t.preview"
              :alt="t.id"
              loading="lazy"
            />
          </div>
        </button>
      </div>
    </div>
    <div
      class="screen-template__msgbox"
      :class="{ 'screen-template__msgbox--hidden': !msgboxVisible }"
      role="dialog"
      aria-modal="true"
      aria-label="確認版型"
    >
      <div class="screen-template__msgbox-backdrop" @click="msgboxVisible = false" />
      <div class="screen-template__msgbox-window">
        <img
          class="screen-template__msgbox-window-bg"
          src="/assets/templates/chooselayout/msgbox/window.png"
          alt=""
        />
        <div class="screen-template__msgbox-btns">
          <button
            type="button"
            class="screen-template__msgbox-btn screen-template__msgbox-btn--confirm"
            aria-label="確認"
            @click="confirmTemplate"
          >
            <img src="/assets/templates/chooselayout/msgbox/confirm.png" alt="確認" />
          </button>
          <button
            type="button"
            class="screen-template__msgbox-btn screen-template__msgbox-btn--repeat"
            aria-label="重選"
            @click="repeatChoose"
          >
            <img src="/assets/templates/chooselayout/msgbox/repeat.png" alt="重選" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.screen--template {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 0;
  background: #fff;
  background-image: url('#{$path-templates}/chooselayout/background.png');
  background-repeat: no-repeat;
  background-position: center bottom;
  background-size: cover;
}

.screen-template__scroll {
  flex: 1;
  overflow: hidden;
  padding: 80px 0 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  position: relative;
  z-index: 1;
}

.screen-template__title {
  position: absolute;
  top: 24px;
  left: 0;
  right: 0;
  margin: 0;
  font-size: 96px;
  font-weight: bold;
  color: $color-111;
  text-align: center;
  line-height: 1.2;
  letter-spacing: 10px;
  z-index: 2;
}

.screen-template__start-btn {
  position: absolute;
  top: 140px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  padding: 16px 48px;
  font-size: 28px;
  font-weight: bold;
  color: #fff;
  background: var(--accent, #ff4d4f);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);

  &:hover {
    opacity: 0.95;
  }
}

.screen-template__grid {
  position: absolute;
  top: 197px;
  left: 0;
  display: flex;
  gap: 28px;
  align-items: center;
  justify-content: center;
  padding: 0;
  width: 100%;
  transform: translateX(0);

  &.has-selection :deep(.screen-template__card:not(.is-selected)) {
    transform: scale(0.9);
  }
}

.screen-template__card {
  border: none;
  border-radius: $radius-xl;
  background: transparent;
  padding: 0;
  cursor: pointer;
  transition: transform 0.3s ease;
  z-index: 1;

  &.is-selected {
    outline: 6px solid var(--accent, #ff4d4f);
    transform: scale(1.2);
    z-index: 10;
    position: relative;
  }
}

.screen-template__card-preview {
  width: 428px;
  height: auto;
  display: block;
  transition: width 0.3s ease;
}

.screen-template__card-img {
  width: 100%;
  height: auto;
  display: block;
}

.screen-template__msgbox {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;

  &.screen-template__msgbox--hidden {
    display: none !important;
  }
}

.screen-template__msgbox-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

.screen-template__msgbox-window {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.screen-template__msgbox-window-bg {
  display: block;
  max-width: 100%;
  height: auto;
}

.screen-template__msgbox-btns {
  display: flex;
  gap: $spacing-5xl;
  justify-content: center;
  align-items: center;
  margin-top: -150px;
}

.screen-template__msgbox-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: block;
  transition: opacity 0.2s;

  img {
    display: block;
    width: auto;
    height: auto;
    max-height: 80px;
  }

  &:hover {
    opacity: 0.9;
  }
}
</style>
