/**
 * DHConfig — Fuerza el motor de render de Distant Horizons a OPEN_GL.
 *
 * DH en MC 26.1.2 usa por defecto "BLAZE_3D", que Iris (shaders) NO soporta:
 * sale un popup de error y DH no renderiza. La solución oficial es poner
 * renderingEngine = "OPEN_GL". Este módulo lo hace automáticamente para que
 * ningún jugador tenga que tocar archivos a mano.
 *
 * - Si el config ya existe: reemplaza el valor por OPEN_GL (idempotente).
 * - Si no existe (primer arranque): pre-siembra un stub mínimo con OPEN_GL,
 *   así DH arranca directo en OPEN_GL y nadie ve el popup de error.
 */
const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('DHConfig')

const STUB = '# Generado por Sangre Arcana Launcher: OPEN_GL para compatibilidad con Iris.\n'
    + '[client.advanced.graphics.experimental]\n'
    + '\trenderingEngine = "OPEN_GL"\n'

/**
 * Asegura que Distant Horizons use OPEN_GL.
 * @param {Object} server HeliosServer
 * @param {string} instanceDirectory ConfigManager.getInstanceDirectory()
 * @returns {Promise<{applied: boolean}>}
 */
exports.ensureDistantHorizonsOpenGL = async function(server, instanceDirectory) {
    const result = { applied: false }
    if(server == null) return result

    const tomlPath = path.join(instanceDirectory, server.rawServer.id, 'config', 'DistantHorizons.toml')
    try {
        if(await fs.pathExists(tomlPath)) {
            const content = await fs.readFile(tomlPath, 'utf8')
            if(/renderingEngine\s*=\s*"OPEN_GL"/.test(content)) return result // ya está
            const replaced = content.replace(/renderingEngine\s*=\s*"[^"]*"/, 'renderingEngine = "OPEN_GL"')
            if(replaced !== content) {
                await fs.writeFile(tomlPath, replaced, 'utf8')
                result.applied = true
                logger.info('Distant Horizons: renderingEngine forzado a OPEN_GL.')
            }
        } else {
            await fs.ensureDir(path.dirname(tomlPath))
            await fs.writeFile(tomlPath, STUB, 'utf8')
            result.applied = true
            logger.info('Distant Horizons: config pre-sembrada con OPEN_GL (primer arranque).')
        }
    } catch(err) {
        logger.warn('No se pudo ajustar la config de Distant Horizons (no fatal):', err)
    }
    return result
}
