const {ipcRenderer}  = require('electron')
const fs             = require('fs-extra')
const os             = require('os')
const path           = require('path')

const ConfigManager  = require('./configmanager')
const { DistroAPI }  = require('./distromanager')
const LangLoader     = require('./langloader')
const { LoggerUtil } = require('helios-core')
// eslint-disable-next-line no-unused-vars
const { HeliosDistribution } = require('helios-core/common')

const logger = LoggerUtil.getLogger('Preloader')

logger.info('Loading..')

// Load ConfigManager
ConfigManager.load()

// Yuck!
// TODO Fix this
DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()

// Load Strings
LangLoader.setupLanguage()

/**
 * 
 * @param {HeliosDistribution} data 
 */
function onDistroLoad(data){
    if(data != null){
        
        // Resolve the selected server if its value has yet to be set.
        if(ConfigManager.getSelectedServer() == null || data.getServerById(ConfigManager.getSelectedServer()) == null){
            logger.info('Determining default selected server..')
            ConfigManager.setSelectedServer(data.getMainServer().rawServer.id)
            ConfigManager.save()
        }
    }
    ipcRenderer.send('distributionIndexDone', data != null)
}

/**
 * Carga el distribution con REINTENTOS (TASK-98): si GitHub raw parpadea
 * (microcaída) y aún no hay cache válida, un solo intento fallaba con error
 * fatal 'la aplicación no puede ejecutarse'. Reintentamos con backoff antes de
 * rendirnos; helios-core ya cae a la cache local cuando ésta existe y es válida.
 * @param {number} attempts Número máximo de intentos.
 * @param {number} baseDelayMs Retardo base entre intentos (crece linealmente).
 */
async function getDistributionWithRetry(attempts, baseDelayMs){
    let lastErr
    for(let i = 1; i <= attempts; i++){
        try {
            return await DistroAPI.getDistribution()
        } catch(err) {
            lastErr = err
            logger.warn(`Intento ${i}/${attempts} de cargar el distribution falló:`, err?.message || err)
            if(i < attempts){
                await new Promise(res => setTimeout(res, baseDelayMs * i))
            }
        }
    }
    throw lastErr
}

/**
 * Carga resiliente del distribution: reintentos y, si aún falla, trata la cache
 * local como posiblemente corrupta (la respalda como .corrupt y fuerza una
 * descarga limpia). Devuelve null solo si todo se agota.
 */
async function loadDistributionResilient(){
    try {
        return await getDistributionWithRetry(3, 1500)
    } catch(err) {
        logger.warn('Reintentos agotados al cargar el distribution.', err?.message || err)
    }
    // Posible cache malformada: respaldarla y forzar una descarga limpia.
    try {
        const cachePath = path.join(ConfigManager.getLauncherDirectory(), 'distribution.json')
        if(await fs.pathExists(cachePath)){
            const backup = cachePath + '.corrupt'
            await fs.move(cachePath, backup, { overwrite: true })
            logger.warn(`Cache de distribution posiblemente corrupta; respaldada en ${backup}. Reintentando descarga limpia.`)
            return await getDistributionWithRetry(2, 1500)
        }
    } catch(err2) {
        logger.error('Falló la recuperación de la cache del distribution:', err2?.message || err2)
    }
    return null
}

// Ensure Distribution is downloaded and cached.
loadDistributionResilient()
    .then(heliosDistro => {
        if(heliosDistro != null){
            logger.info('Loaded distribution index.')
        } else {
            logger.info('No se pudo cargar el índice de distribución tras reintentos.')
            logger.info('Application cannot run.')
        }
        onDistroLoad(heliosDistro)
    })
    .catch(err => {
        logger.info('Failed to load an older version of the distribution index.')
        logger.info('Application cannot run.')
        logger.error(err)

        onDistroLoad(null)
    })

// Clean up temp dir incase previous launches ended unexpectedly. 
fs.remove(path.join(os.tmpdir(), ConfigManager.getTempNativeFolder()), (err) => {
    if(err){
        logger.warn('Error while cleaning natives directory', err)
    } else {
        logger.info('Cleaned natives directory.')
    }
})