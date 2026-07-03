/**
 * PerformanceProfiles — Perfiles de rendimiento seleccionables, POR SERVIDOR.
 *
 * Cada servidor puede tener su propio set de perfiles (Normal/Rendimiento/Ultra),
 * porque distintas versiones de Minecraft y distintos servers necesitan valores
 * distintos. Un servidor que NO esté en este mapa queda 100% intacto: el launcher
 * no le muestra selector ni le escribe options.txt (no interfiere).
 *
 * Hoy solo está calibrado "SangreArcana-RPG-1.20.1" (verificado contra su
 * options.txt real). Para sumar otro server en el futuro: agregar su id aquí con
 * sus 3 perfiles ya verificados en su versión. NO inventar valores.
 *
 * Los valores se escriben tal cual tras "clave:" en options.txt. Semántica vanilla:
 *   - particles:        0=Todas, 1=Disminuidas, 2=Mínimas
 *   - graphicsMode:     0=Rápido(Fast), 1=Detallado(Fancy), 2=Fabuloso
 *   - renderClouds:     "true"=Detalladas, "fast"=Rápidas, "false"=Apagadas
 *   - ao:               true/false (smooth lighting)
 *   - biomeBlendRadius: 0..7 (mezcla de color entre biomas; caro para el CPU)
 *   - entityShadows:    true/false
 *   - entityDistanceScaling: 0.5..5.0
 *   - mipmapLevels:     0..4
 *   - renderDistance / simulationDistance: enteros (en MP el server topa el máximo).
 */
const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('PerformanceProfiles')

// Etiquetas de los 3 niveles (comunes a cualquier server que tenga perfiles).
const TIERS = [
    { id: 'normal',      label: '✨ Normal' },
    { id: 'rendimiento', label: '⚡ Rendimiento' },
    { id: 'ultra',       label: '🔧 Ultra' }
]

// Perfiles POR ID DE SERVIDOR. Solo los servers listados aquí son gestionados.
const PROFILES_BY_SERVER = {
    // Sangre Arcana RPG (Forge 1.20.1) — valores verificados contra su options.txt.
    'SangreArcana-RPG-1.20.1': {
        // ✨ Normal — experiencia completa para equipos buenos.
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
}

/**
 * ¿Este servidor tiene perfiles definidos (es gestionado por el launcher)?
 * @param {string} serverid
 * @returns {boolean}
 */
exports.hasProfiles = function(serverid){
    return serverid != null && PROFILES_BY_SERVER[serverid] != null
}

/**
 * Lista de perfiles a mostrar en la UI para un servidor. Vacía si no gestionado.
 * @param {string} serverid
 * @returns {Array<{id:string,label:string}>}
 */
exports.getProfileList = function(serverid){
    return exports.hasProfiles(serverid) ? TIERS.slice() : []
}

/**
 * Aplica el perfil elegido a options.txt (en cada arranque), SOLO si el server
 * está gestionado. Si no lo está, no toca nada y devuelve {skipped:true}.
 * Sobrescribe únicamente las claves del perfil; preserva el resto del archivo.
 *
 * @param {Object} server HeliosServer.
 * @param {string} instanceDirectory ConfigManager.getInstanceDirectory().
 * @param {string} profileId 'normal' | 'rendimiento' | 'ultra'.
 * @returns {Promise<{applied:boolean, skipped?:boolean, profile?:string}>}
 */
exports.applyPerformanceProfile = async function(server, instanceDirectory, profileId){
    if(server == null) return { applied: false, skipped: true }

    const serverSet = PROFILES_BY_SERVER[server.rawServer.id]
    // Server no gestionado -> NO tocar su options.txt (queda como el usuario lo tenga).
    if(serverSet == null){
        return { applied: false, skipped: true }
    }

    // Perfil inválido -> caer al de rendimiento (seguro) de ESTE server.
    const profile = serverSet[profileId] || serverSet.rendimiento
    const resolvedId = serverSet[profileId] ? profileId : 'rendimiento'

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
        while(lines.length > 0 && lines[lines.length-1] === '') lines.pop()
        await fs.writeFile(optionsPath, lines.join('\n') + '\n', 'utf8')
        logger.info(`Perfil de rendimiento aplicado: ${resolvedId} (${server.rawServer.id})`)
        return { applied: true, profile: resolvedId }
    } catch(err){
        logger.warn('No se pudo aplicar el perfil de rendimiento (no fatal):', err)
        return { applied: false, profile: resolvedId }
    }
}
