<script setup lang="ts">
defineOptions({ name: 'ScreenProcessing' })

const PROCESSING_BG = '/assets/templates/printPage/background.png'
</script>

<template>
  <div class="screen screen--processing" role="region" aria-label="列印中">
    <div class="processing__scroll">
      <img class="processing__bg-img" :src="PROCESSING_BG" alt="" draggable="false" />
      <div class="processing__layer">
        <div class="processing-content">
          <!-- <img
            class="processing-gif"
            src="/assets/templates/printPage/printGif.gif"
            alt=""
            aria-hidden="true"
          /> -->
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.screen--processing {
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

.processing__scroll {
  position: relative;
  display: block;
  flex: 0 0 auto;
  width: 100%;
  min-width: 100%;
  /* 勿設 min-height:100vh，否則圖片高度小於視窗時捲到底會露出底色 */
  background-color: transparent;
}

.processing__bg-img {
  display: block;
  width: 100%;
  max-width: none;
  height: auto;
  pointer-events: none;
  user-select: none;
}

.processing__layer {
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

.processing-content {
  @include flex-column;
  @include flex-center;
  gap: $spacing-lg;
  padding: 24px;
  box-sizing: border-box;
}

.processing-gif {
  max-width: min(90vw, 480px);
  max-height: min(80vh, 480px);
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}
</style>
