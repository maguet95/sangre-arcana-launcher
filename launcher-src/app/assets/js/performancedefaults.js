/**
 * PerformanceDefaults — Escribe UNA sola vez una configuración de video
 * optimizada en options.txt para que cada jugador arranque con buen
 * rendimiento (sin lag) sin tener que configurar nada. Usa un archivo
 * marcador para NO volver a tocar los ajustes del jugador después de la
 * primera vez (si luego él sube/baja calidad, se respeta).
 *
 * El gameplay corre en el servidor; con estos defaults + Distant Horizons
 * (vista amplia barata) el cliente apunta a ~60 FPS en equipos modestos.
 */
const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('PerformanceDefaults')

// Ajustes base (equilibrio rendimiento/estética). Distant Horizons da la
// vista amplia, así que el render distance real de MC puede ir bajo.
const DEFAULTS = {
    'renderDistance': '8',
    'simulationDistance': '8',
    'renderClouds': '"false"',
    'entityShadows': 'false',
    'biomeBlendRadius': '1',
    'particles': '1',
    'maxFps': '120'
}

/**
 * Aplica los defaults de rendimiento una sola vez por instancia.
 * @param {Object} server HeliosServer
 * @param {string} instanceDirectory ConfigManager.getInstanceDirectory()
 * @returns {Promise<{applied: boolean}>}
 */
exports.applyPerformanceDefaults = async function(server, instanceDirectory) {
    const result = { applied: false }
    if(server == null) return result

    const serverDir = path.join(instanceDirectory, server.rawServer.id)
    const marker = path.join(serverDir, '.sa_perf_applied')

    // Ya se aplicó una vez: respetar lo que el jugador haya configurado.
    if(await fs.pathExists(marker)) return result

    const optionsPath = path.join(serverDir, 'options.txt')

    let lines = []
    if(await fs.pathExists(optionsPath)) {
        const content = await fs.readFile(optionsPath, 'utf8')
        lines = content.split(/\r?\n/)
    }

    // Aplicar/sobrescribir cada clave por defecto.
    for(const [key, val] of Object.entries(DEFAULTS)) {
        const idx = lines.findIndex(l => l.startsWith(key + ':'))
        const newLine = `${key}:${val}`
        if(idx !== -1) {
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
        await fs.writeFile(marker, new Date().toISOString(), 'utf8')
        result.applied = true
        logger.info('Ajustes de rendimiento por defecto aplicados (primera vez).')
    } catch(err) {
        logger.warn('No se pudieron aplicar los ajustes de rendimiento (no fatal):', err)
    }
    return result
}
