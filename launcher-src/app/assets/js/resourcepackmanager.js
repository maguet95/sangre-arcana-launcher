/**
 * ResourcePackManager — Activa AUTOMÁTICAMENTE los resource packs de la
 * distribución en el options.txt de la instancia, para que el jugador NO
 * tenga que activarlos a mano (el launcher hace todo).
 *
 * - Mantiene las entradas no-archivo (vanilla, mod_resources, builtin/*).
 * - Quita los packs "file/" huérfanos (ej. un pack viejo que ya no se usa).
 * - Activa los packs de la distribución (los .zip en resourcepacks/), en orden.
 * - Preserva el resto de options.txt (keybinds, video, etc.).
 */
const fs   = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('ResourcePackManager')

/** Recolecta los nombres de archivo de los resource packs declarados en la distribución. */
function collectExpectedPacks(modules, list) {
    if (!Array.isArray(modules)) return list
    for (const mdl of modules) {
        const raw = mdl.rawModule
        if (raw && raw.artifact && typeof raw.artifact.path === 'string') {
            const p = raw.artifact.path.replace(/\\/g, '/')
            if (p.startsWith('resourcepacks/')) {
                list.push(path.basename(p))
            }
        }
        if (mdl.subModules && mdl.subModules.length) collectExpectedPacks(mdl.subModules, list)
    }
    return list
}

/**
 * Asegura que options.txt active exactamente los resource packs de la distribución.
 * @param {Object} server HeliosServer
 * @param {string} instanceDirectory ConfigManager.getInstanceDirectory()
 * @returns {Promise<{applied: string[]}>}
 */
exports.applyResourcePacks = async function(server, instanceDirectory) {
    const result = { applied: [] }
    if (server == null) return result

    const expected = collectExpectedPacks(server.modules, [])
    if (expected.length === 0) return result // nada que activar, no tocar

    const optionsPath = path.join(instanceDirectory, server.rawServer.id, 'options.txt')
    if (!await fs.pathExists(optionsPath)) {
        // options.txt aún no existe (primer arranque); MC lo crea. Se aplicará en el siguiente.
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
    let idx = lines.findIndex(l => l.startsWith('resourcePacks:'))

    // Parsear lista existente (si hay)
    let current = []
    if (idx !== -1) {
        const m = lines[idx].match(/^resourcePacks:(\[.*\])$/)
        if (m) {
            try { current = JSON.parse(m[1]) } catch (e) { current = [] }
        }
    }

    // Conservar entradas que NO son "file/" (vanilla, mod_resources, builtin/*, program/*)
    const keep = current.filter(e => typeof e === 'string' && !e.startsWith('file/'))
    if (!keep.includes('vanilla')) keep.unshift('vanilla')

    // Activar los packs de la distribución (en orden; el último tiene mayor prioridad en MC)
    const filePacks = expected.map(name => `file/${name}`)
    const newList = [...keep, ...filePacks]

    const newLine = 'resourcePacks:' + JSON.stringify(newList)

    // ¿Cambió algo?
    if (idx !== -1 && lines[idx] === newLine) {
        return result // ya está bien, no reescribir
    }

    if (idx !== -1) {
        lines[idx] = newLine
    } else {
        lines.push(newLine)
    }

    try {
        await fs.writeFile(optionsPath, lines.join('\n'), 'utf8')
        result.applied = filePacks
        logger.info(`Resource packs activados automáticamente: ${filePacks.join(', ')}`)
    } catch (err) {
        logger.warn('No se pudo escribir options.txt:', err)
    }
    return result
}
