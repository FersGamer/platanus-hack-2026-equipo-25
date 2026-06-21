import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import mermaid from 'mermaid'
import { SpeechToText } from '../voice/stt.js'
import svgPanZoom from 'svg-pan-zoom'

/**
 * @param {Object} deps
 * @param {import('vue').Ref<HTMLCanvasElement|null>} deps.canvasRef
 * @param {import('vue').Ref<HTMLElement|null>} deps.mermaidContainerRef
 * @param {import('vue').Ref<HTMLElement|null>} deps.codeBlockRef
 * @param {(estado: string) => void} deps.setAvatarEstado
 */
export function useTutorSession({ canvasRef, mermaidContainerRef, codeBlockRef, setAvatarEstado }) {
    const status = ref('Iniciando sistema...')
    const micActive = ref(false)
    const micEmoji = ref('🎤')
    const activeMode = ref('canvas')
    const codeLanguage = ref('txt')
    const codeContent = ref('')

    const grabadora = new SpeechToText()
    let isRecording = false
    let secuenciaActual = []
    let pasoActualIndex = 0
    let animFrameId = null
    let ctx = null
    let mermaidInitialized = false
    let panZoomInstance = null // 🚨 NUEVO: Rastreador de la cámara

    function getCtx() {
        if (!ctx && canvasRef.value) {
            ctx = canvasRef.value.getContext('2d')
        }
        return ctx
    }

    function ocultarPanelesVisuales() {
        const mermaidContainer = mermaidContainerRef.value || document.getElementById('mermaidContainer')
        const codeContainer = document.getElementById('codeContainer')

        if (mermaidContainer) mermaidContainer.style.display = 'none'
        if (codeContainer) codeContainer.style.display = 'none'
    }

    function mostrarModoCanvas() {
        activeMode.value = 'canvas'
        ocultarPanelesVisuales()
        if (canvasRef.value) canvasRef.value.style.display = 'block'
    }

    async function asegurarMermaid() {
        if (!mermaidInitialized) {
            mermaid.initialize({
                startOnLoad: false,
                // 🚨 FORZAMOS UN TEMA PERSONALIZADO ELEGANTE
                theme: 'base',
                themeVariables: {
                    primaryColor: '#334155',        /* Fondo de nodos: Pizarra oscuro */
                    primaryTextColor: '#f8fafc',    /* Texto: Blanco hueso */
                    primaryBorderColor: '#1e293b',  /* Borde: Pizarra muy oscuro */
                    lineColor: '#94a3b8',           /* Líneas y flechas: Gris claro */
                    secondaryColor: '#3730a3',      /* Acentos secundarios: Índigo mutado */
                    tertiaryColor: '#0f172a'        /* Fondos terciarios */
                },
                securityLevel: 'loose'
            })
            mermaidInitialized = true
        }
    }

    async function renderMermaid(codigo) {
        await asegurarMermaid()

        const container = mermaidContainerRef.value || document.getElementById('mermaidContainer')
        if (!container) return

        const codigoLimpio = codigo
            .replace(/```mermaid\n?/gi, '')
            .replace(/```\n?/g, '')
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .trim()

        activeMode.value = 'mermaid'
        if (canvasRef.value) canvasRef.value.style.display = 'none'
        await nextTick()
        container.style.display = 'block'
        
        // 🚨 Destruimos cámara vieja
        if (panZoomInstance) {
            panZoomInstance.destroy()
            panZoomInstance = null
        }
        
        container.innerHTML = ''
        const uniqueId = `mermaid-${Date.now()}`
        container.innerHTML = `<div class="mermaid" id="${uniqueId}" style="width: 100%; height: 100%;">${codigoLimpio}</div>`

        await nextTick()

        try {
            await mermaid.run({ nodes: [document.getElementById(uniqueId)] })

            const svgElement = document.querySelector(`#${uniqueId} svg`)
            if (svgElement) {
                // Limpiamos estilos de Mermaid para que la cámara tome el control
                svgElement.removeAttribute('style')
                svgElement.setAttribute('width', '100%')
                svgElement.setAttribute('height', '100%')

                // 🚨 USAMOS LA VERSIÓN IMPORTADA (Sin el window.)
                panZoomInstance = svgPanZoom(svgElement, {
                    zoomEnabled: true,
                    controlIconsEnabled: false, // 🚨 1. APAGAMOS LOS BOTONES ESTORBOSOS
                    fit: false,
                    center: true, 
                    minZoom: 0.3, // Permitimos alejar un poco más
                    maxZoom: 10,
                })
                
                panZoomInstance.resize()
                panZoomInstance.center()
                panZoomInstance.zoom(0.85)

                // Cámara Inteligente (Auto-Focus)
                setTimeout(() => {
                    const nodoActivo = svgElement.querySelector('.highlight')
                    if (nodoActivo && panZoomInstance) {
                        panZoomInstance.zoom(1.2)
                        
                        const containerRect = container.getBoundingClientRect()
                        const nodeRect = nodoActivo.getBoundingClientRect()
                        
                        const screenCenterX = containerRect.left + (containerRect.width / 2)
                        const screenCenterY = containerRect.top + (containerRect.height / 2)
                        const nodeCenterX = nodeRect.left + (nodeRect.width / 2)
                        const nodeCenterY = nodeRect.top + (nodeRect.height / 2)

                        panZoomInstance.panBy({
                            x: screenCenterX - nodeCenterX,
                            y: screenCenterY - nodeCenterY
                        })
                    }
                }, 50)
            }

        } catch (error) {
            console.error('Error al renderizar Mermaid:', error)
            container.innerHTML = '<p style="color: #ef4444; padding: 20px;">⚠️ Error de sintaxis en el diagrama del Tutor.</p>'
        }
    }

    function renderCodeBlock(payload) {
        const codeContainer = document.getElementById('codeContainer')
        if (!codeContainer || !codeBlockRef.value) return

        const lenguaje = payload.lenguaje || 'txt'
        const codigo = payload.codigo || ''

        activeMode.value = 'code'
        codeLanguage.value = lenguaje
        codeContent.value = codigo
        codeBlockRef.value.className = `language-${lenguaje}`
        codeBlockRef.value.textContent = codigo
        codeContainer.style.display = 'block'
        if (canvasRef.value) canvasRef.value.style.display = 'none'
        if (mermaidContainerRef.value) mermaidContainerRef.value.style.display = 'none'
    }

    // ---------------------------------------------------------------------
    // DIBUJO EN CANVAS
    // ---------------------------------------------------------------------
    function animarDibujo(dibujo, duracionMs, onComplete) {
        const context = getCtx()
        if (!context) {
            console.error('⚠️ No se puede dibujar: el canvas todavía no está montado.')
            onComplete?.()
            return
        }

        const inicio = performance.now()
        context.strokeStyle = dibujo.color || '#4f46e5'
        context.fillStyle = dibujo.color || '#4f46e5'
        context.lineWidth = 4
        context.lineCap = 'round'

        function frame(ahora) {
            const progreso = Math.min((ahora - inicio) / duracionMs, 1)
            dibujarPasoConProgreso(dibujo, progreso)

            if (progreso < 1) {
                animFrameId = requestAnimationFrame(frame)
            } else {
                onComplete?.()
            }
        }
        animFrameId = requestAnimationFrame(frame)
    }

    function dibujarPasoConProgreso(paso, progreso) {
        const context = getCtx()
        if (!context || !canvasRef.value) return
        const canvasEl = canvasRef.value

        switch (paso.comando) {
            case 'limpiar':
                context.clearRect(0, 0, canvasEl.width, canvasEl.height)
                break

            case 'linea': {
                const xActual = paso.x + (paso.x2 - paso.x) * progreso
                const yActual = paso.y + (paso.y2 - paso.y) * progreso
                context.beginPath()
                context.moveTo(paso.x, paso.y)
                context.lineTo(xActual, yActual)
                context.stroke()
                break
            }

            case 'circulo': {
                const anguloActual = (2 * Math.PI) * progreso
                context.beginPath()
                context.arc(paso.x, paso.y, paso.radio, 0, anguloActual)
                context.stroke()
                break
            }

            case 'rectangulo': {
                context.beginPath()
                if (progreso < 0.25) {
                    context.moveTo(paso.x, paso.y)
                    context.lineTo(paso.x + (paso.w * (progreso * 4)), paso.y)
                } else if (progreso < 0.5) {
                    context.moveTo(paso.x, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y + (paso.h * ((progreso - 0.25) * 4)))
                } else if (progreso < 0.75) {
                    context.moveTo(paso.x, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y + paso.h)
                    context.lineTo(paso.x + paso.w - (paso.w * ((progreso - 0.5) * 4)), paso.y + paso.h)
                } else {
                    context.moveTo(paso.x, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y)
                    context.lineTo(paso.x + paso.w, paso.y + paso.h)
                    context.lineTo(paso.x, paso.y + paso.h)
                    context.lineTo(paso.x, paso.y + paso.h - (paso.h * ((progreso - 0.75) * 4)))
                }
                context.stroke()
                break
            }

            case 'texto': {
                if (paso.contenido) {
                    const caracteresMostrar = Math.floor(paso.contenido.length * progreso)
                    const textoParcial = paso.contenido.substring(0, caracteresMostrar)
                    context.clearRect(paso.x, paso.y - 24, canvasEl.width - paso.x, 30)
                    context.font = "bold 24px 'Hanken Grotesk', sans-serif"
                    context.fillStyle = '#f1f1f1'
                    context.fillText(textoParcial, paso.x, paso.y)
                }
                break
            }
        }
    }

    function hablarTexto(texto) {
        if (!texto) return
        status.value = texto
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(texto)
        utterance.lang = 'es-MX'
        utterance.rate = 1.05
        utterance.onstart = () => setAvatarEstado('hablando')
        utterance.onend = () => setAvatarEstado('reposo')
        utterance.onerror = () => setAvatarEstado('reposo')
        window.speechSynthesis.speak(utterance)
    }

    // ---------------------------------------------------------------------
    // ORQUESTACIÓN: texto + dibujo sincronizados, paso a paso
    // ---------------------------------------------------------------------
    async function procesarContratoInterfaz(data) {
        console.log('Contrato recibido:', data)

        if (data.avatar_estado) {
            setAvatarEstado(data.avatar_estado)
        }

        window.speechSynthesis.cancel()
        if (animFrameId) cancelAnimationFrame(animFrameId)

        if (data.bloque_codigo) {
            renderCodeBlock(data.bloque_codigo)
            if (data.texto_a_hablar) hablarTexto(data.texto_a_hablar)
            return
        }

        if (data.codigo_mermaid && data.codigo_mermaid.trim() !== '') {
            await renderMermaid(data.codigo_mermaid)
            if (data.texto_a_hablar) hablarTexto(data.texto_a_hablar)
            return
        }

        // Formato nuevo: { secuencia: [{ texto, avatar_estado?, dibujo }] }
        if (data.secuencia && Array.isArray(data.secuencia)) {
            secuenciaActual = data.secuencia
            pasoActualIndex = 0
            mostrarModoCanvas()
            ejecutarSiguientePaso()
            return
        }

        // Compatibilidad con el formato viejo: { texto_a_hablar, pasos_dibujo }
        if (data.texto_a_hablar || data.pasos_dibujo) {
            console.warn('⚠️ El agente sigue enviando el formato viejo (texto_a_hablar/pasos_dibujo).')
            if (data.texto_a_hablar) {
                // 🚨 ESCUDO ANTI-FUGAS DE JSON
                // Si Claude escupe comillas y propiedades dentro del texto, lo cortamos ahí mismo.
                let textoLimpio = data.texto_a_hablar
                    .split('","')[0]     // Corta si alucina la siguiente propiedad
                    .split('", "')[0]    // Corta si alucina con espacios
                    .split('codigo_mermaid')[0] // Corta si menciona la variable
                    .replace(/["{}\\]/g, '');   // Elimina llaves y barras perdidas

                hablarTexto(textoLimpio);
            }

            if (data.pasos_dibujo && Array.isArray(data.pasos_dibujo)) {
                mostrarModoCanvas()
                let i = 0
                const dibujarSiguiente = () => {
                    if (i >= data.pasos_dibujo.length) return
                    dibujarPasoConProgreso(data.pasos_dibujo[i], 1)
                    i++
                    setTimeout(dibujarSiguiente, 400)
                }
                dibujarSiguiente()
            }
        }
    }

    function ejecutarSiguientePaso() {
        if (pasoActualIndex >= secuenciaActual.length) {
            setAvatarEstado('reposo')
            status.value = ''
            return
        }

        const paso = secuenciaActual[pasoActualIndex]
        setAvatarEstado(paso.avatar_estado || 'hablando')

        if (paso.texto) {
            status.value = paso.texto

            const utterance = new SpeechSynthesisUtterance(paso.texto)
            utterance.lang = 'es-MX'
            utterance.rate = 1.05

            const palabras = paso.texto.split(/\s+/).length
            const duracionEstimadaMs = (palabras / 2.5) * 1000

            utterance.onstart = () => {
                if (paso.dibujo) animarDibujo(paso.dibujo, duracionEstimadaMs)
            }

            utterance.onend = () => {
                if (paso.dibujo) {
                    if (animFrameId) cancelAnimationFrame(animFrameId)
                    dibujarPasoConProgreso(paso.dibujo, 1)
                }
                setAvatarEstado('reposo')
                pasoActualIndex++
                ejecutarSiguientePaso()
            }

            utterance.onerror = () => {
                setAvatarEstado('reposo')
                pasoActualIndex++
                ejecutarSiguientePaso()
            }

            window.speechSynthesis.speak(utterance)

        } else if (paso.dibujo) {
            animarDibujo(paso.dibujo, 600, () => {
                pasoActualIndex++
                ejecutarSiguientePaso()
            })
        } else {
            pasoActualIndex++
            ejecutarSiguientePaso()
        }
    }

    // ---------------------------------------------------------------------
    // VOZ (WALKIE-TALKIE: mantener barra espaciadora)
    // ---------------------------------------------------------------------
    async function manejarKeydown(event) {
        if (event.code === 'Space' && !isRecording) {
            window.speechSynthesis.cancel()
            isRecording = true
            status.value = 'Te escucho...'
            setAvatarEstado('escuchando')
            micActive.value = true
            micEmoji.value = '🎙️'

            try {
                await grabadora.startRecording()
            } catch (error) {
                console.error(error)
                status.value = 'Error al iniciar micrófono.'
                isRecording = false
                micActive.value = false
            }
        }
    }

    async function manejarKeyup(event) {
        if (event.code === 'Space' && isRecording) {
            isRecording = false
            micActive.value = false
            micEmoji.value = '🎤'

            status.value = 'Transcribiendo...'
            setAvatarEstado('pensando')

            try {
                const textoTranscrito = await grabadora.stopRecordingAndTranscribe()
                status.value = `Tú: "${textoTranscrito}"\n\nAnalizando...`

                const respuesta = await window.electronAPI.enviarMensajeAlAgente(textoTranscrito)

                if (respuesta.success) {
                    await procesarContratoInterfaz(respuesta.data)
                } else {
                    throw new Error(respuesta.error)
                }
            } catch (error) {
                status.value = 'Error en la conexión. Intenta de nuevo.'
                setAvatarEstado('confundido')
                console.error(error)
            }
        }
    }

    // ---------------------------------------------------------------------
    // ARRANQUE
    // ---------------------------------------------------------------------
    async function bootstrap() {
        try {
            grabadora.apiKey = await window.electronAPI.getGroqKey()
            if (!grabadora.apiKey) console.warn('Falta clave de Groq en .env')

            const inicial = await window.electronAPI.inicializarTutor()
            if (inicial.success) {
                await procesarContratoInterfaz(inicial.data)
            } else {
                status.value = 'Error al iniciar: ' + inicial.error
            }
        } catch (e) {
            console.error('Fallo crítico en inicialización:', e)
        }
    }
    
    onMounted(() => {
        window.addEventListener('keydown', manejarKeydown)
        window.addEventListener('keyup', manejarKeyup)
    })

    onUnmounted(() => {
        window.removeEventListener('keydown', manejarKeydown)
        window.removeEventListener('keyup', manejarKeyup)
        if (animFrameId) cancelAnimationFrame(animFrameId)
        window.speechSynthesis.cancel()
    })

    return { status, micActive, micEmoji, activeMode, codeLanguage, codeContent, bootstrap }
}