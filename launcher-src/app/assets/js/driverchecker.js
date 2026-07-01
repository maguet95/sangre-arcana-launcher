/**
 * DriverChecker — Detecta drivers de GPU Intel realmente desactualizados
 * (rewrite OpenGL de finales 2021/2022) que causan FPS muy bajos (1-3 FPS)
 * en Minecraft. Avisa al jugador para que actualice.
 *
 * Solo aplica en Windows. En otras plataformas devuelve { outdated: false }.
 * NUNCA lanza: cualquier error se traga y devuelve outdated:false para no
 * bloquear jamás el arranque del launcher.
 *
 * FIX falso positivo (TASK-96): antes usábamos Win32_PnPSignedDriver, que lista
 * TODOS los paquetes de driver instalados —incluidos fantasmas viejos que Windows
 * conserva tras actualizar— y cuya DriverDate a veces es una fecha base antigua
 * aunque el driver esté al día. Resultado: avisaba "driver viejo" a gente con el
 * driver actualizado. Ahora:
 *   1) Consultamos Win32_VideoController = el/los controladores ACTIVOS (sin
 *      fantasmas duplicados).
 *   2) La señal primaria es la VERSIÓN, no la fecha: Intel reescribió su driver
 *      en 2022 y las versiones modernas usan rama >= 30 (30.0.101.x, 31.0.101.x,
 *      32.0.101.x...). Si la rama es >= 30 => moderno => NO se avisa, aunque WMI
 *      reporte una fecha antigua.
 *   3) Solo si la versión es antigua (rama < 30) o no se puede parsear, caemos a
 *      la fecha (< 2022 => desactualizado).
 */
const { exec } = require('child_process')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('DriverChecker')

// Intel reescribió por completo su driver OpenGL a finales de 2021/2022.
// Drivers anteriores rinden pésimo en versiones nuevas de Minecraft.
const INTEL_MIN_DATE = new Date('2022-01-01')
// Rama de versión Intel a partir de la cual el driver es "moderno" (post-rewrite).
const INTEL_MODERN_BRANCH = 30
const INTEL_UPDATE_URL = 'https://www.intel.com/content/www/us/en/support/detect.html'

/**
 * Extrae el primer segmento numérico (la "rama") de una versión de driver Intel.
 * Ej: "31.0.101.5333" -> 31 ; "27.20.100.9664" -> 27. Devuelve NaN si no se puede.
 * @param {string} version
 * @returns {number}
 */
function parseIntelBranch(version) {
    if (typeof version !== 'string') return NaN
    const m = version.match(/^(\d+)\./)
    return m ? parseInt(m[1], 10) : NaN
}

/**
 * Revisa el driver de la GPU activa.
 * @returns {Promise<{outdated:boolean, vendor?:string, name?:string, version?:string, date?:string, url?:string}>}
 */
exports.checkGpuDriver = function () {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve({ outdated: false })
        }
        // Controladores de video ACTIVOS (no paquetes de driver fantasma).
        const psScript = "Get-CimInstance Win32_VideoController | ForEach-Object { [PSCustomObject]@{ Name=$_.Name; Version=$_.DriverVersion; Date=$(if($_.DriverDate){$_.DriverDate.ToString('yyyy-MM-dd')}else{''}) } } | ConvertTo-Json -Compress"
        const cmd = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${psScript}"`
        exec(cmd, { timeout: 10000, windowsHide: true }, (err, stdout) => {
            if (err || !stdout || !stdout.trim()) {
                logger.warn('No se pudo leer el driver de la GPU (no fatal).')
                return resolve({ outdated: false })
            }
            try {
                let data = JSON.parse(stdout.trim())
                if (!Array.isArray(data)) data = [data]
                for (const gpu of data) {
                    const name = (gpu.Name || '').toLowerCase()
                    if (!name.includes('intel')) continue

                    const branch = parseIntelBranch(gpu.Version)
                    // Señal primaria: versión. Rama moderna (>= 30) => al día, no avisar.
                    if (!isNaN(branch) && branch >= INTEL_MODERN_BRANCH) {
                        logger.info(`Driver Intel moderno (rama ${branch}): ${gpu.Name} v${gpu.Version} — al día.`)
                        continue
                    }

                    // Versión antigua o no parseable: caemos a la fecha.
                    const date = gpu.Date ? new Date(gpu.Date) : null
                    const dateOld = date && !isNaN(date.getTime()) && date < INTEL_MIN_DATE
                    const branchOld = !isNaN(branch) && branch < INTEL_MODERN_BRANCH

                    if (branchOld || dateOld) {
                        logger.info(`Driver Intel desactualizado: ${gpu.Name} v${gpu.Version} (${gpu.Date || 'sin fecha'})`)
                        return resolve({
                            outdated: true,
                            vendor: 'Intel',
                            name: gpu.Name,
                            version: gpu.Version,
                            date: gpu.Date,
                            url: INTEL_UPDATE_URL
                        })
                    }
                }
                resolve({ outdated: false })
            } catch (e) {
                logger.warn('Error parseando info de GPU (no fatal):', e)
                resolve({ outdated: false })
            }
        })
    })
}

exports.INTEL_UPDATE_URL = INTEL_UPDATE_URL
