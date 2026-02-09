const config = require('../config');
const logger = require('../utils/logger');

/**
 * Create API key on LLM proxy for user
 * @param {string} username - Username for the key
 * @returns {Promise<{id: string, key: string}>} - Key ID and raw key
 */
async function createProxyKey(username) {
  const url = `${config.proxy.url}/keys/generate`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.proxy.masterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `beebro-${username}`,
      // Default quotas - can be adjusted
      quota4hInput: 500000,
      quota4hOutput: 200000,
      quotaWeekInput: 2000000,
      quotaWeekOutput: 800000,
      serviceQuotas: {
        exa: { '4h': 100, week: 500 },
        context7: { '4h': 200, week: 1000 },
      },
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create proxy key: ${error}`);
  }
  
  const data = await response.json();
  logger.info(`Created proxy key for ${username}: ${data.id}`);
  
  return {
    id: data.id,
    key: data.key,
  };
}

/**
 * Delete API key from LLM proxy
 * @param {string} keyId - Key ID to delete
 */
async function deleteProxyKey(keyId) {
  if (!keyId) return;
  
  const url = `${config.proxy.url}/keys/delete`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.proxy.masterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: keyId }),
    });
    
    if (response.ok) {
      logger.info(`Deleted proxy key: ${keyId}`);
    }
  } catch (err) {
    logger.error(`Failed to delete proxy key ${keyId}:`, err.message);
  }
}

/**
 * Get key usage stats
 * @param {string} apiKey - User's API key
 * @returns {Promise<object>} - Usage stats
 */
async function getKeyUsage(apiKey) {
  const url = `${config.proxy.url}/keys/usage`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to get usage');
  }
  
  return response.json();
}

module.exports = {
  createProxyKey,
  deleteProxyKey,
  getKeyUsage,
};
