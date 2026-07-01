/**
 * ResourcePackManager — Impone AUTOMÁTICAMENTE el set y ORDEN canónico de resource
 * packs del modpack Sangre Arcana RPG en el options.txt de la instancia, para que
 * TODOS los jugadores queden IDÉNTICOS y el jugador NO toque nada.
 *
 * Historia del bug: el deploy de la traducción (v2.3.1) dejaba activo SOLO
 * `sangre-arcana-es` y apagaba las texturas/interfaces (Faithless, Immersive
 * Interfaces, armas, etc.). El "preservar lo que ya estaba activo" no bastaba: una
 * vez apagados, no había nada que preservar y quedaban en vanilla para siempre.
 *
 * Solución (determinista): definimos el ORDEN CANÓNICO (copiado de la instancia de
 * referencia SANGRE-ARCANA-DEV) y lo escribimos en options.txt en cada arranque.
 *  - Las entradas file/ solo se activan si el .zip existe en resourcepacks/.
 *  - Las entradas inyectadas por mods (vanilla, mod_resources, Moonlight,
 *    a_good_place:*, netherexp:*, builtin/*) se dejan pasar; MC ignora las que no
 *    pueda resolver en un cliente dado.
 *  - `sangre-arcana-es.zip` va de ÚLTIMO = máxima prioridad (la traducción gana).
 *  - El resto de options.txt (keybinds, video, lang, etc.) se preserva intacto.
 *
 * Los § de algunos nombres se escriben como § para que el archivo fuente sea
 * ASCII y no dependa de la codificación al empaquetar en el asar.
 */
const fs   = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('ResourcePackManager')

// Orden canónico del modpack (fuente: SANGRE-ARCANA-DEV). Determinista para todos.
const CANONICAL_ORDER = [
    'vanilla',
    'mod_resources',
    'file/FreshAnimations_v1.9.2.zip',
    'file/Faithless 1.20.zip',
    'file/DSWG Thunder Sound 1.20 v1.1.zip',
    'file/Skyrim Soundpack v5.8b.zip',
    'Moonlight Mods Dynamic Assets',
    'file/waystones_1.20.zip',
    'a_good_place:default_animations',
    'file/Water+Improved.zip',
    'file/§6Immersive§8_§6Interfaces§8.zip',
    'file/PERFECTION SOUNDTRACK.zip',
    'file/PERFECTION RESOURCES.zip',
    'file/Better illagers FA.zip',
    'file/!§bKnightArmor.zip',
    'file/+§bSunBreathing§8-[v1.0].zip',
    'file/Expressive Fresh Moves v3.0.1.zip',
    'file/Los aldeanos hablan.zip',
    'builtin/add_pack_finders_test',
    'file/[Compressed] Alternative Rain Sounds 1.20-1.20.1.zip',
    'netherexp:jne_emissive',
    'netherexp:jne_retextures',
    'file/EnderEyes_1.20.1_v3.zip',
    'file/sangre-arcana-es.zip'
]

/**
 * Asegura que options.txt active exactamente el set/orden canónico de packs.
 * @param {Object} server HeliosServer
 * @param {string} instanceDirectory ConfigManager.getInstanceDirectory()
 * @returns {Promise<{applied: string[]}>}
 */
exports.applyResourcePacks = async function(server, instanceDirectory) {
    const result = { applied: [] }
    if (server == null) return result

    const instanceDir = path.join(instanceDirectory, server.rawServer.id)
    const rpDir       = path.join(instanceDir, 'resourcepacks')
    const optionsPath = path.join(instanceDir, 'options.txt')

    // Packs físicamente presentes en resourcepacks/
    const present = new Set()
    try {
        if (await fs.pathExists(rpDir)) {
            for (const f of await fs.readdir(rpDir)) present.add(f)
        }
    } catch (err) {
        logger.warn('No se pudo leer la carpeta resourcepacks/:', err)
    }

    // Construir la lista deseada a partir del orden canónico.
    // file/ -> solo si el .zip existe; no-file/ -> siempre (MC ignora lo que no resuelva).
    const desired = []
    let canonicalFilePresent = 0
    for (const entry of CANONICAL_ORDER) {
        if (entry.startsWith('file/')) {
            const base = entry.slice('file/'.length)
            if (present.has(base)) {
                desired.push(entry)
                canonicalFilePresent++
            }
        } else {
            desired.push(entry)
        }
    }

    // Si no hay NINGÚN pack canónico presente, esta instancia no es la del modpack:
    // no tocamos nada (seguridad para no romper otros escenarios).
    if (canonicalFilePresent === 0) return result

    if (!await fs.pathExists(optionsPath)) {
        // options.txt aún no existe (primer arranque); MC lo crea. Se aplica al siguiente.
        return result
    }

    let content
    try {
        content = await fs.readFile(optionsPath, 'utf8')
    } catch (err) {
        logger.warn('No se pudo leer options.txt:', err)
        return result
    }

    const lines = content.split(/\r?\n/)
    const idx = lines.findIndex(l => l.startsWith('resourcePacks:'))
    const newLine = 'resourcePacks:' + JSON.stringify(desired)

    // ¿Ya está exactamente igual? No reescribir.
    if (idx !== -1 && lines[idx] === newLine) {
        return result
    }

    if (idx !== -1) {
        lines[idx] = newLine
    } else {
        lines.push(newLine)
    }

    try {
        await fs.writeFile(optionsPath, lines.join('\n'), 'utf8')
        result.applied = desired.filter(e => e.startsWith('file/'))
        logger.info(`Resource packs impuestos (orden canónico): ${result.applied.join(', ')}`)
    } catch (err) {
        logger.warn('No se pudo escribir options.txt:', err)
    }
    return result
}
