const { execSync } = require('child_process');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * List all beebro containers (without size for speed)
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
 * Get container size
 */
function getContainerSize(containerName) {
  try {
    const sizeRaw = execSync(`du -sb /mnt/lxd-storage/containers/${containerName}/rootfs 2>/dev/null || echo "0"`).toString().trim();
    return parseInt(sizeRaw.split('\t')[0]) || 0;
  } catch {
    return 0;
  }
}

/**
 * Execute command in container
 */
function exec(containerName, command) {
  return execSync(`lxc exec ${containerName} -- bash -c '${command}'`);
}

/**
 * Create a new container from template
 */
async function createContainer(containerName) {
  logger.info(`Creating container ${containerName} from ${config.lxc.template}`);
  
  try {
    execSync(`lxc copy ${config.lxc.template} ${containerName}`);
    execSync(`lxc start ${containerName}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
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
function deleteContainer(containerName) {
  logger.info(`Deleting container ${containerName}`);
  try {
    try { execSync(`lxc stop ${containerName} --force`); } catch {}
    execSync(`lxc delete ${containerName}`);
    logger.info(`Container ${containerName} deleted`);
  } catch (err) {
    logger.error(`Failed to delete container ${containerName}:`, err.message);
    throw new Error(`Failed to delete container: ${err.message}`);
  }
}

/**
 * Get container IP address
 */
function getContainerIP(containerName) {
  try {
    const raw = execSync(`lxc list ${containerName} --format json`).toString();
    const containers = JSON.parse(raw);
    if (containers.length === 0) return null;
    return containers[0].state?.network?.eth0?.addresses?.find(a => a.family === 'inet')?.address || null;
  } catch {
    return null;
  }
}

/**
 * Ensure container is running
 */
async function ensureContainerRunning(containerName) {
  try {
    const raw = execSync(`lxc list ${containerName} --format json`).toString();
    const containers = JSON.parse(raw);
    if (containers.length === 0) throw new Error(`Container ${containerName} not found`);
    if (containers[0].status !== 'Running') {
      logger.info(`Starting container ${containerName}`);
      execSync(`lxc start ${containerName}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (err) {
    logger.error(`Failed to ensure container running:`, err.message);
    throw err;
  }
}

module.exports = {
  listContainers,
  getContainerSize,
  exec,
  createContainer,
  deleteContainer,
  getContainerIP,
  ensureContainerRunning,
};
