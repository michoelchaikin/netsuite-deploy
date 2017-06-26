const nconf = require('nconf');
const fetch = require('node-fetch');

const NETSUITE_REST_ROLES_SERVICE_URLS = {
  production: 'https://rest.netsuite.com/rest/roles',
  sandbox: 'https://rest.sandbox.netsuite.com/rest/roles',
  beta: 'https://rest.beta.netsuite.com/rest/roles',
  eu: 'https://rest.eu1.netsuite.com/rest/roles',
};

/**
 * @param {Config} config The configuration options
 * @param {'systemDomain'|'webservicesDomain'|'restDomain'} domain The requested domain type
 * @returns {Promise.<string>} Promise resolving to the requested domain
 */
module.exports = async function getNetsuiteDomain(config, domain) {
  let url = nconf.get(`${config.environment}:${domain}`);

  if (url) {
    return url;
  }

  let restURL = NETSUITE_REST_ROLES_SERVICE_URLS[config.environment];

  if (!restURL) {
    throw new Error(`Invalid environment '${config.environment}'`);
  }

  let response = await fetch(restURL, {
    headers: {
      Authorization: `NLAuth nlauth_account=${config.account}, nlauth_email=${config.email}, nlauth_signature=${config.password}`,
    },
  });

  // Not using response.json() because I have come across cases where non-JSON data was returned
  let data = await response.text();

  try {
    data = JSON.parse(data);
  } catch (error) {
    data = { error: { message: 'Response was not valid JSON data' } };
  }

  if (response.status !== 200) {
    throw new Error(
      `Error ${response.status} (${response.statusText}) while retrieving domains: ${data.error.message}`
    );
  }

  data = data.filter(
    elem => elem.role.internalId.toString() === config.role.toString()
  );

  if (data.length < 1) {
    throw new Error('Unable to find a matching data center');
  }

  url = data[0]['dataCenterURLs'][domain];
  nconf.set(`${config.environment}:${domain}`, url);

  return url;
};
