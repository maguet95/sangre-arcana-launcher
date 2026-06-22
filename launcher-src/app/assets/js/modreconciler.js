/**
 * ModReconciler — Garantiza que la carpeta de mods de la instancia coincida
 * EXACTAMENTE con lo declarado en la distribución (distribution.json).
 *
 * Helios descarga los mods de la distribución, pero NO elimina los mods que
 * dejaron de pertenecer al modpack cuando éste cambia de versión. Esos mods
 * "huérfanos" provocan crashes (ej. incompatibilidades) y comportamientos
 * inesperados en jugadores que ya tenían una versión anterior instalada.
 *
 * Este módulo borra cualquier .jar en la carpeta mods de la instancia que no
 * esté declarado en la distribución actual. Es el launcher quien hace el trabajo
 * de mantener el modpack sano — no el jugador.
 */
const fs   = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('ModReconciler')

/**
 * Recorre recursivamente los módulos de un servidor y recolecta los nombres de
 * archivo (basename) de todos los mods declarados en la carpeta mods/.
 *
 * @param {Array} modules Lista de HeliosModule (server.modules / subModules).
 * @param {Set<string>} set Acumulador de nombres de archivo esperados.
 * @returns {Set<string>}
 */
function collectExpectedMods(modules, set) {
    if (!Array.isArray(modules)) return set
    for (const mdl of modules) {
        const raw = mdl.rawModule
        if (raw && raw.artifact && typeof raw.artifact.path === 'string') {
            const p = raw.artifact.path.replace(/\\/g, '/')
            if (p.startsWith('mods/')) {
                set.add(path.basename(p))
            }
        }
        if (typeof mdl.hasSubModules === 'function' ? mdl.hasSubModules() : (mdl.subModules && mdl.subModules.length)) {
            collectExpectedMods(mdl.subModules, set)
        }
    }
    return set
}

/**
 * Purga mods huérfanos de la instancia para el servidor dado.
 *
 * @param {Object} server HeliosServer (distro.getServerById(...)).
 * @param {string} instanceDirectory Ruta base de instancias (ConfigManager.getInstanceDirectory()).
 * @returns {Promise<{removed: string[], expected: number}>}
 */
exports.reconcileMods = async function(server, instanceDirectory) {
    const result = { removed: [], expected: 0 }

    if (server == null) {
        logger.warn('Servidor nulo, se omite la reconciliación de mods.')
        return result
    }

    const expected = collectExpectedMods(server.modules, new Set())
    result.expected = expected.size

    // Si por alguna razón no hay mods esperados, abortar por seguridad
    // (no queremos vaciar la carpeta por un fallo de carga de la distribución).
    if (expected.size === 0) {
        logger.warn('La distribución no declaró mods; se omite la reconciliación por seguridad.')
        return result
    }

    const modsDir = path.join(instanceDirectory, server.rawServer.id, 'mods')

    if (!await fs.pathExists(modsDir)) {
        return result
    }

    let entries
    try {
        entries = await fs.readdir(modsDir, { withFileTypes: true })
    } catch (err) {
        logger.warn(`No se pudo leer la carpeta de mods (${modsDir}):`, err)
        return result
    }

    for (const entry of entries) {
        if (!entry.isFile()) continue // No tocar subcarpetas (ej. mods deshabilitados manualmente)
        const name = entry.name
        const isJar = name.endsWith('.jar') || name.endsWith('.jar.disabled')
        if (!isJar) continue

        // Normalizar nombre quitando el sufijo .disabled para comparar con lo esperado
        const canonical = name.endsWith('.disabled') ? name.slice(0, -('.disabled'.length)) : name

        if (!expected.has(canonical)) {
            try {
                await fs.remove(path.join(modsDir, name))
                result.removed.push(name)
                logger.info(`Mod huérfano eliminado: ${name}`)
            } catch (err) {
                logger.warn(`No se pudo eliminar el mod huérfano ${name}:`, err)
            }
        }
    }

    return result
}
