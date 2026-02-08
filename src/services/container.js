const { execSync } = require('child_process');
const config = require('../config');
const logger = require('../utils/logger');

const TIMEOUT = { timeout: 120000 };

/**
 * Create a new container from template
 */
async function createContainer(name) {
  const containerName = `${config.lxc.containerPrefix}${name}`;
  
  logger.info(`Creating container ${containerName}...`);
  
  try {
    execSync(`lxc launch ${config.lxc.template} ${containerName}`, TIMEOUT);
    
    // Wait for container to be ready
    await new Promise(r => setTimeout(r, 3000));
    
    logger.info(`Container ${containerName} created and started`);
    return containerName;
  } catch (err) {
    logger.error(`Failed to create container ${containerName}:`, err.message);
    throw new Error(`Failed to create container: ${err.message}`);
  }
}

/**
 * Delete a container
 */
async function deleteContainer(containerName) {
  logger.info(`Deleting container ${containerName}...`);
  
  try {
    execSync(`lxc delete ${containerName} --force`, { timeout: 30000 });
    logger.info(`Container ${containerName} deleted`);
  } catch (err) {
    logger.error(`Failed to delete container ${containerName}:`, err.message);
    // Don't throw - container might already be deleted
  }
}

/**
 * Check if container is running
 */
function isContainerRunning(containerName) {
  try {
    const state = execSync(`lxc list ${containerName} --format csv -c s`).toString().trim();
    return state === 'RUNNING';
  } catch {
    return false;
  }
}

/**
 * Start container if not running
 */
async function ensureContainerRunning(containerName) {
  if (!isContainerRunning(containerName)) {
    logger.info(`Starting container ${containerName}...`);
    execSync(`lxc start ${containerName}`, { timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
  }
}

/**
 * Check if container exists
 */
function containerExists(containerName) {
  try {
    const list = execSync(`lxc list --format csv -c n`).toString();
    return list.includes(containerName);
  } catch {
    return false;
  }
}

/**
 * List all containers (excluding base/template)
 */
function listContainers() {
  try {
    const raw = execSync('lxc list --format json').toString();
    const containers = JSON.parse(raw);
    
    return containers
      .filter(c => !c.name.includes('base') && !c.name.includes('template'))
      .map(c => ({
        name: c.name,
        status: c.status,
        ip: c.state?.network?.eth0?.addresses?.find(a => a.family === 'inet')?.address || null,
      }));
  } catch (err) {
    logger.error('Failed to list containers:', err.message);
    return [];
  }
}

/**
 * Execute command in container
 */
function exec(containerName, command, options = {}) {
  return execSync(`lxc exec ${containerName} -- ${command}`, {
    timeout: options.timeout || 10000,
    ...options,
  });
}

module.exports = {
  createContainer,
  deleteContainer,
  isContainerRunning,
  ensureContainerRunning,
  containerExists,
  listContainers,
  exec,
};
