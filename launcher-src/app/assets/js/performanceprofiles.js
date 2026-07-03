/**
 * PerformanceProfiles — Perfiles de rendimiento seleccionables, POR SERVIDOR.
 *
 * Cada servidor puede tener su propio set de perfiles (Normal/Rendimiento/Ultra).
 * Un servidor que NO esté en este mapa queda 100% intacto: el launcher no le
 * muestra selector ni le escribe nada (no interfiere).
 *
 * Cada perfil ajusta DOS cosas en la instancia (en cada arranque, preservando
 * el resto de cada archivo):
 *   1) options.txt  -> ajustes de vídeo vanilla (renderDistance, partículas...).
 *   2) config/embeddium-options.json -> calidad de render de Embeddium, que es
 *      donde está la mayor palanca de FPS en un pack modded (hojas sólidas vs
 *      transparentes, clima, viñeta). Solo se tocan claves de "quality"; los
 *      flags de "performance"/"advanced" ya vienen óptimos y NO se tocan.
 *
 * Valores verificados contra los archivos reales de "SangreArcana-RPG-1.20.1".
 * NO inventar. Para sumar otro server: agregar su id con perfiles verificados
 * en SU versión.
 *
 * Semántica vanilla options.txt:
 *   particles: 0=Todas,1=Disminuidas,2=Mínimas | graphicsMode: 0=Rápido,1=Detallado
 *   renderClouds: "true"=Detalladas,"fast"=Rápidas,"false"=Off | ao: true/false
 * Semántica Embeddium (enum GraphicsQuality): "DEFAULT" (sigue graphicsMode),
 *   "FANCY" (bonito), "FAST" (rápido: hojas sólidas, clima simple).
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
    // Sangre Arcana RPG (Forge 1.20.1) — valores verificados contra sus archivos.
    'SangreArcana-RPG-1.20.1': {
        // ✨ Normal — experiencia completa para equipos buenos.
        normal: {
            options: {
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
            embeddium: {
                quality: { leaves_quality: 'FANCY', weather_quality: 'DEFAULT', enable_vignette: true }
            }
        },
        // ⚡ Rendimiento — equilibrio para equipos medios (por defecto).
        rendimiento: {
            options: {
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
            embeddium: {
                quality: { leaves_quality: 'FAST', weather_quality: 'DEFAULT', enable_vignette: true }
            }
        },
        // 🔧 Ultra — máximo FPS para equipos muy bajos (papa).
        ultra: {
            options: {
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
            },
            embeddium: {
                quality: { leaves_quality: 'FAST', weather_quality: 'FAST', enable_vignette: false }
            }
        }
    }
}

/**
 * ¿Este servidor tiene perfiles definidos (es gestionado por el launcher)?
 */
exports.hasProfiles = function(serverid){
    return serverid != null && PROFILES_BY_SERVER[serverid] != null
}

/**
 * Lista de perfiles a mostrar en la UI para un servidor. Vacía si no gestionado.
 */
exports.getProfileList = function(serverid){
    return exports.hasProfiles(serverid) ? TIERS.slice() : []
}

/**
 * Escribe/actualiza las claves dadas en un options.txt (line-based), preservando
 * todas las demás líneas. Devuelve true si escribió.
 */
async function writeOptionsTxt(serverDir, optionKeys){
    const optionsPath = path.join(serverDir, 'options.txt')
    let lines = []
    if(await fs.pathExists(optionsPath)){
        lines = (await fs.readFile(optionsPath, 'utf8')).split(/\r?\n/)
    }
    for(const [key, val] of Object.entries(optionKeys)){
        const idx = lines.findIndex(l => l.startsWith(key + ':'))
        const newLine = `${key}:${val}`
        if(idx !== -1){ lines[idx] = newLine } else { lines.push(newLine) }
    }
    while(lines.length > 0 && lines[lines.length-1] === '') lines.pop()
    await fs.writeFile(optionsPath, lines.join('\n') + '\n', 'utf8')
    return true
}

/**
 * Fusiona (deep-merge de 1 nivel por sección) los overrides dados en
 * config/embeddium-options.json, PRESERVANDO todas las demás claves (los flags
 * de performance/advanced no se tocan). Si el archivo no existe, lo crea con solo
 * lo dado (Embeddium rellena el resto con sus defaults al cargar).
 */
async function mergeEmbeddium(serverDir, embOverride){
    const p = path.join(serverDir, 'config', 'embeddium-options.json')
    let json = {}
    if(await fs.pathExists(p)){
        try { json = JSON.parse(await fs.readFile(p, 'utf8')) }
        catch(e){ json = {} } // JSON corrupto: reconstruir lo mínimo sin romper.
    }
    for(const [section, vals] of Object.entries(embOverride)){
        if(vals && typeof vals === 'object' && !Array.isArray(vals)){
            json[section] = Object.assign({}, json[section], vals)
        } else {
            json[section] = vals
        }
    }
    await fs.ensureDir(path.join(serverDir, 'config'))
    await fs.writeFile(p, JSON.stringify(json, null, 2) + '\n', 'utf8')
    return true
}

/**
 * Aplica el perfil elegido (options.txt + Embeddium), SOLO si el server está
 * gestionado. Si no, no toca nada y devuelve {skipped:true}.
 *
 * @returns {Promise<{applied:boolean, skipped?:boolean, profile?:string, embeddium?:boolean}>}
 */
exports.applyPerformanceProfile = async function(server, instanceDirectory, profileId){
    if(server == null) return { applied: false, skipped: true }

    const serverSet = PROFILES_BY_SERVER[server.rawServer.id]
    if(serverSet == null){
        return { applied: false, skipped: true } // server no gestionado -> intacto
    }

    const profile = serverSet[profileId] || serverSet.normal
    const resolvedId = serverSet[profileId] ? profileId : 'normal'
    const serverDir = path.join(instanceDirectory, server.rawServer.id)

    const result = { applied: false, profile: resolvedId, embeddium: false }
    try {
        await fs.ensureDir(serverDir)
        if(profile.options){
            await writeOptionsTxt(serverDir, profile.options)
            result.applied = true
        }
        if(profile.embeddium){
            try {
                await mergeEmbeddium(serverDir, profile.embeddium)
                result.embeddium = true
            } catch(err){
                // El vídeo vanilla ya se aplicó; Embeddium es un extra, no fatal.
                logger.warn('No se pudo ajustar Embeddium (no fatal):', err)
            }
        }
        logger.info(`Perfil aplicado: ${resolvedId} (${server.rawServer.id}) options=${result.applied} embeddium=${result.embeddium}`)
    } catch(err){
        logger.warn('No se pudo aplicar el perfil de rendimiento (no fatal):', err)
    }
    return result
}
