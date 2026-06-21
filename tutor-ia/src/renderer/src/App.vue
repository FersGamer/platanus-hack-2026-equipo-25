<script setup>
import { ref, onMounted } from 'vue'
import { useAvatarAnimation } from './composables/useAvatarAnimation'
import { useTutorSession } from './composables/useTutorSession'

const pizarraContainer = ref(null)
// Refs para inyectar en el composable
const canvasRef = ref(null)
const mermaidContainerRef = ref(null)
const codeBlockRef = ref(null)

const { avatarSrc, avatarPos, cargarManifest, setAvatarEstado, iniciarFlotacion } = useAvatarAnimation()

// Extraemos las nuevas variables reactivas del composable
const { status, micActive, micEmoji, activeMode, codeLanguage, codeContent, bootstrap } = useTutorSession({ 
  canvasRef, 
  mermaidContainerRef,
  codeBlockRef,
  setAvatarEstado 
})

onMounted(async () => {
  await cargarManifest()
  setAvatarEstado('hablando')
  iniciarFlotacion(pizarraContainer)
  await bootstrap()
})
</script>

<template>
  <header class="app-header">
    <h1 class="app-title">ZenZen</h1>
    <p class="app-status">{{ status }}</p>
    <div class="mic-container" :class="{ 'mic-active': micActive }">
      <span class="mic-icon">{{ micEmoji }}</span>
    </div>
  </header>

  <main class="board-wrapper">
    <div ref="pizarraContainer" id="pizarra-container" class="pizarra-root">
      
      <canvas 
        ref="canvasRef" 
        width="1400" 
        height="800" 
        v-show="activeMode === 'canvas'"
        class="board-layer"
      ></canvas>

      <div 
        ref="mermaidContainerRef" 
        id="mermaidContainer" 
        v-show="activeMode === 'mermaid'"
        class="board-layer mermaid-layer"
      ></div>

      <div 
        id="codeContainer" 
        v-show="activeMode === 'code'"
        class="board-layer code-layer"
      >
        <pre><code ref="codeBlockRef" :class="'language-' + codeLanguage">{{ codeContent }}</code></pre>
      </div>

      <img
          class="avatar-float"
          :src="avatarSrc"
          :style="{ top: avatarPos.top + 'px', left: avatarPos.left + 'px' }"
          alt="ZenZen"
      />
    </div>
  </main>
</template>

<style scoped>
/* =========================================================
   ANIMACIONES DE MERMAID (Solo funcionan aquí en Vue)
========================================================= */

/* Hacemos que las flechas se dibujen solas de inicio a fin */
:deep(.mermaid .edgePath .path) {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: drawLine 2s ease-in-out forwards;
}

/* Hacemos que las cajas y textos aparezcan suavemente */
:deep(.mermaid .node), 
:deep(.mermaid .edgeLabel) {
  opacity: 0;
  animation: fadeIn 1s ease-in forwards;
  animation-delay: 0.5s;
}

@keyframes drawLine {
  to { stroke-dashoffset: 0; }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>