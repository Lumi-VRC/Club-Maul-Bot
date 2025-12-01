const LEVELS = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG'
};

function log(level, message, error) {
  const timestamp = new Date().toISOString();
  if (error) {
    console[level === 'error' ? 'error' : 'log'](`[${timestamp}] ${LEVELS[level]}: ${message}`, error);
  } else {
    console[level === 'error' ? 'error' : 'log'](`[${timestamp}] ${LEVELS[level]}: ${message}`);
  }
}

module.exports = {
  info: (message) => log('info', message),
  warn: (message, error) => log('warn', message, error),
  error: (message, error) => log('error', message, error),
  debug: (message) => log('debug', message)
};

