/**
 * DriverChecker — Detecta drivers de GPU desactualizados (sobre todo Intel)
 * que causan FPS muy bajos (1-3 FPS) en Minecraft 26.1.x, y permite avisar
 * al jugador para que actualice. El gameplay corre en el servidor, así que
 * el único cuello de botella del cliente suele ser un driver de video viejo.
 *
 * Solo aplica en Windows. En otras plataformas devuelve { outdated: false }.
 * NUNCA lanza: cualquier error se traga y devuelve outdated:false para no
 * bloquear jamás el arranque del launcher.
 */
const { exec } = require('child_process')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('DriverChecker')

// Intel reescribió por completo su driver OpenGL a finales de 2021/2022.
// Drivers anteriores rinden pésimo en versiones nuevas de Minecraft.
const INTEL_MIN_DATE = new Date('2022-01-01')
const INTEL_UPDATE_URL = 'https://www.intel.com/content/www/us/en/support/detect.html'

/**
 * Revisa el driver de la GPU activa.
 * @returns {Promise<{outdated:boolean, vendor?:string, name?:string, version?:string, date?:string, url?:string}>}
 */
exports.checkGpuDriver = function () {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve({ outdated: false })
        }
        // Listamos los drivers de clase DISPLAY con fecha en formato ISO limpio.
        const psScript = "Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceClass -eq 'DISPLAY' } | ForEach-Object { [PSCustomObject]@{ Name=$_.DeviceName; Version=$_.DriverVersion; Date=$_.DriverDate.ToString('yyyy-MM-dd') } } | ConvertTo-Json -Compress"
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
                    const date = gpu.Date ? new Date(gpu.Date) : null
                    if (name.includes('intel') && date && !isNaN(date.getTime()) && date < INTEL_MIN_DATE) {
                        logger.info(`Driver Intel desactualizado: ${gpu.Name} v${gpu.Version} (${gpu.Date})`)
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
