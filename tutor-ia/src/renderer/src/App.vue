<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useAvatarAnimation } from "./composables/useAvatarAnimation";
import { useTutorSession } from "./composables/useTutorSession";

const pizarraContainer = ref(null);
const canvas = ref(null);
const debugCanvas = ref(null);
const mostrarVision = ref(false);

const {
  avatarSrc,
  avatarPos,
  cargarManifest,
  setAvatarEstado,
  iniciarFlotacion,
} = useAvatarAnimation();

const { status, micActive, micEmoji, bootstrap, modoRatonActivo } =
  useTutorSession({
    canvasRef: canvas,
    debugCanvasRef: debugCanvas,
    setAvatarEstado,
  });

// Función que escucha el teclado
function manejarAtajoVision(e) {
  // Si presionas la 'v' o 'V', se alterna la ventana
  if (e.key.toLowerCase() === "v") {
    mostrarVision.value = !mostrarVision.value;
  }
}

onMounted(async () => {
  window.addEventListener("keydown", manejarAtajoVision); // 👉 Activamos el atajo
  await cargarManifest();
  setAvatarEstado("hablando");
  iniciarFlotacion(pizarraContainer);
  await bootstrap();
});

onUnmounted(() => {
  window.removeEventListener("keydown", manejarAtajoVision); // 👉 Limpiamos memoria
});
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
    <div ref="pizarraContainer" id="pizarra-container">
      <canvas ref="canvas" width="1400" height="800"></canvas>
      <img class="avatar-float" :src="avatarSrc" :style="{ top: avatarPos.top + 'px', left: avatarPos.left + 'px' }"
        alt="ZenZen" />
    </div>
  </main>

  <div id="cursor-virtual" v-show="modoRatonActivo" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 24px;
      height: 24px;
      background-color: rgba(
        239,
        68,
        68,
        0.9
      ); /* Rojo brillante para destacar en la pizarra */
      border: 3px solid white;
      border-radius: 50%;
      pointer-events: none; /* Para que los clics pasen a través del punto */
      z-index: 9999;
      transition: transform 0.03s linear; /* Suaviza el movimiento sin meter lag */
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    "></div>

  <div v-show="mostrarVision" class="vision-debug-container" style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      border: 2px solid #4f46e5;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
      z-index: 10000;
      background: #000;
    ">
    <div style="
        background: #4f46e5;
        color: white;
        padding: 4px 8px;
        font-size: 12px;
        font-weight: bold;
        font-family: sans-serif;
        display: flex;
        justify-content: space-between;
      ">
      <span>Motor de Visión Activo</span>
      <span style="color: #a5b4fc">Live</span>
    </div>
    <canvas ref="debugCanvas" width="320" height="240" style="display: block"></canvas>
  </div>
</template>
