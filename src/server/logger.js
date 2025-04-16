// logger.js - Simple logging module
const fs = require('fs');
const path = require('path');

// Log levels
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

// Default configuration
const DEFAULT_CONFIG = {
    level: LOG_LEVELS.INFO,
    logToConsole: true,
    logToFile: true,
    logDir: path.join(__dirname, 'logs'),
    maxLogSize: 10 * 1024 * 1024, // 10MB
    maxLogFiles: 5
};

// Create a logger instance
function createLogger(module) {
    // Ensure log directory exists
    if (DEFAULT_CONFIG.logToFile && !fs.existsSync(DEFAULT_CONFIG.logDir)) {
        fs.mkdirSync(DEFAULT_CONFIG.logDir, { recursive: true });
    }

    // Generate filename based on date
    const getLogFilePath = () => {
        const date = new Date();
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return path.join(DEFAULT_CONFIG.logDir, `fotobox-${dateStr}.log`);
    };

    // Format log message
    const formatLogMessage = (level, message) => {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] [${module}] ${message}`;
    };

    // Write to log file
    const writeToFile = (message) => {
        if (!DEFAULT_CONFIG.logToFile) return;

        const logPath = getLogFilePath();

        try {
            // Append to log file
            fs.appendFileSync(logPath, message + '\n');

            // Check file size
            const stats = fs.statSync(logPath);
            if (stats.size > DEFAULT_CONFIG.maxLogSize) {
                rotateLogFiles();
            }
        } catch (error) {
            console.error(`Error writing to log file: ${error.message}`);
        }
    };

    // Rotate log files when they get too big
    const rotateLogFiles = () => {
        try {
            const logPath = getLogFilePath();

            // Rename current log file
            const extension = path.extname(logPath);
            const basePath = logPath.substr(0, logPath.length - extension.length);

            // Shift existing rotated logs
            for (let i = DEFAULT_CONFIG.maxLogFiles - 1; i >= 1; i--) {
                const oldFile = `${basePath}.${i}${extension}`;
                const newFile = `${basePath}.${i + 1}${extension}`;

                if (fs.existsSync(oldFile)) {
                    fs.renameSync(oldFile, newFile);
                }
            }

            // Rename current log to .1
            fs.renameSync(logPath, `${basePath}.1${extension}`);
        } catch (error) {
            console.error(`Error rotating log files: ${error.message}`);
        }
    };

    // Log method for each level
    const log = (level, message) => {
        if (level > DEFAULT_CONFIG.level) return;

        const levels = Object.entries(LOG_LEVELS).find(([_, value]) => value === level);
        const levelName = levels ? levels[0] : 'UNKNOWN';

        const formattedMessage = formatLogMessage(levelName, message);

        // Log to console
        if (DEFAULT_CONFIG.logToConsole) {
            switch (level) {
                case LOG_LEVELS.ERROR:
                    console.error(formattedMessage);
                    break;
                case LOG_LEVELS.WARN:
                    console.warn(formattedMessage);
                    break;
                case LOG_LEVELS.INFO:
                    console.info(formattedMessage);
                    break;
                case LOG_LEVELS.DEBUG:
                    console.debug(formattedMessage);
                    break;
                default:
                    console.log(formattedMessage);
            }
        }

        // Write to file
        writeToFile(formattedMessage);
    };

    // Return logger object
    return {
        error: (message) => log(LOG_LEVELS.ERROR, message),
        warn: (message) => log(LOG_LEVELS.WARN, message),
        info: (message) => log(LOG_LEVELS.INFO, message),
        debug: (message) => log(LOG_LEVELS.DEBUG, message),
        log: (level, message) => log(level, message)
    };
}

module.exports = {
    createLogger,
    LOG_LEVELS
};