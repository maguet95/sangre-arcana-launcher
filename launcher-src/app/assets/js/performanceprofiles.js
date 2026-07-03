/**
 * PerformanceProfiles — Sistema de perfiles de rendimiento seleccionables.
 *
 * Reemplaza al viejo performancedefaults.js (que escribía ajustes fijos una
 * sola vez). Aquí el jugador elige un perfil en el launcher y, en CADA
 * arranque, se escriben los ajustes de video correspondientes en options.txt,
 * preservando el resto del archivo (controles, sonido, resource packs, etc.).
 *
 * Claves y valores VERIFICADOS contra el options.txt real de la instancia
 * (Minecraft 1.20.1). NO se inventa ninguna clave. Semántica vanilla:
 *   - particles:        0=Todas, 1=Disminuidas, 2=Mínimas
 *   - graphicsMode:     0=Rápido(Fast), 1=Detallado(Fancy), 2=Fabuloso
 *   - renderClouds:     "true"=Detalladas, "fast"=Rápidas, "false"=Apagadas
 *   - ao:               true/false (smooth lighting / sombras suaves)
 *   - biomeBlendRadius: 0..7 (mezcla de color entre biomas; caro para el CPU)
 *   - entityShadows:    true/false
 *   - entityDistanceScaling: 0.5..5.0 (a qué distancia se dibujan las entidades)
 *   - mipmapLevels:     0..4 (suavizado de texturas a distancia)
 *   - renderDistance / simulationDistance: enteros (en multijugador el server
 *     limita el máximo real vía view-distance/simulation-distance).
 */
const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('PerformanceProfiles')

// Los 3 perfiles. Cada valor es EXACTAMENTE lo que va tras "clave:" en options.txt.
const PROFILES = {
    // ✨ Normal — experiencia completa de Minecraft para equipos buenos.
    normal: {
        renderDistance: '10',
        simulationDistance: '10',
        particles: '0',
        graphicsMode: '1',
        renderClouds: '"true"',
        biomeBlendRadius: '5',
        entityDistanceScaling: '1.0',
        entityShadows: 'true',
        ao: 'true',
        mipmapLevels: '4',
        maxFps: '120'
    },
    // ⚡ Rendimiento — equilibrio para equipos medios (por defecto).
    rendimiento: {
        renderDistance: '8',
        simulationDistance: '8',
        particles: '1',
        graphicsMode: '0',
        renderClouds: '"false"',
        biomeBlendRadius: '1',
        entityDistanceScaling: '0.75',
        entityShadows: 'false',
        ao: 'true',
        mipmapLevels: '2',
        maxFps: '120'
    },
    // 🔧 Ultra — máximo FPS para equipos muy bajos (papa).
    ultra: {
        renderDistance: '5',
        simulationDistance: '5',
        particles: '2',
        graphicsMode: '0',
        renderClouds: '"false"',
        biomeBlendRadius: '0',
        entityDistanceScaling: '0.5',
        entityShadows: 'false',
        ao: 'false',
        mipmapLevels: '0',
        maxFps: '60'
    }
}

exports.PROFILES = PROFILES

/**
 * Lista de perfiles disponibles con etiqueta para la UI.
 * @returns {Array<{id:string,label:string}>}
 */
exports.getProfileList = function(){
    return [
        { id: 'normal',      label: '✨ Normal' },
        { id: 'rendimiento', label: '⚡ Rendimiento' },
        { id: 'ultra',       label: '🔧 Ultra' }
    ]
}

/**
 * Aplica el perfil de rendimiento elegido a options.txt (en cada arranque).
 * Sobrescribe SOLO las claves del perfil; preserva todo lo demás del archivo.
 *
 * @param {Object} server HeliosServer.
 * @param {string} instanceDirectory ConfigManager.getInstanceDirectory().
 * @param {string} profileId 'normal' | 'rendimiento' | 'ultra'.
 * @returns {Promise<{applied: boolean, profile: string}>}
 */
exports.applyPerformanceProfile = async function(server, instanceDirectory, profileId){
    const result = { applied: false, profile: profileId }
    if(server == null) return result

    // Perfil inválido/desconocido -> caer al de rendimiento (seguro).
    const profile = PROFILES[profileId] || PROFILES.rendimiento
    result.profile = PROFILES[profileId] ? profileId : 'rendimiento'

    const serverDir = path.join(instanceDirectory, server.rawServer.id)
    const optionsPath = path.join(serverDir, 'options.txt')

    let lines = []
    if(await fs.pathExists(optionsPath)){
        const content = await fs.readFile(optionsPath, 'utf8')
        lines = content.split(/\r?\n/)
    }

    // Aplicar/sobrescribir cada clave del perfil, preservando el resto.
    for(const [key, val] of Object.entries(profile)){
        const idx = lines.findIndex(l => l.startsWith(key + ':'))
        const newLine = `${key}:${val}`
        if(idx !== -1){
            lines[idx] = newLine
        } else {
            lines.push(newLine)
        }
    }

    try {
        await fs.ensureDir(serverDir)
        // Evitar línea vacía colgando al final.
        while(lines.length > 0 && lines[lines.length-1] === '') lines.pop()
        await fs.writeFile(optionsPath, lines.join('\n') + '\n', 'utf8')
        result.applied = true
        logger.info(`Perfil de rendimiento aplicado: ${result.profile}`)
    } catch(err){
        logger.warn('No se pudo aplicar el perfil de rendimiento (no fatal):', err)
    }
    return result
}
