const nconf = require('nconf');

const doUploadSoap = require('./soap.js');
const doUploadSDF = require('./sdf.js');

/**
 * @typedef {Object} Config Configuration options
 * @property {'sdf'|'suitetalk'} method The method to use for uploading
 * @property {'production'|'sandbox'|'beta'|'eu'} environment The Netsuite environment (e.g. 'production', 'sandbox')
 * @property {string} email User's email address
 * @property {string} password User's password
 * @property {string} account The Netsuite account number
 * @property {string} role Internal ID of the Netsuite role used to login (e.g. '3' for Administrator)
 * @property {string|string[]} file For SDF deployment - the path to the project folder. For SuiteTalk deployments - 
 *  an array of files to upload
 * @property {string} base The base directory from which the files are relative to (Only for SuiteTalk deployments)
 * @property {string} path Destination path in the Netsuite File Cabinet to save the file (e.g. /SuiteScripts/Folder/)
 *  (Only for SuiteTalk deployments)
 */

/**
 * Upload a file or project to Netsuite
 * @param {Config} config Configuration object
 * @returns {Promise.<number>} Internal ID of the uploaded file (for SuiteTalk)
 */
module.exports = async function(config) {
  let result;

  nconf.file({ file: '.deploycache' });

  switch (config.method) {
    case 'suitetalk':
      result = await doUploadSoap(config);
      break;

    case 'sdf':
      result = await doUploadSDF(config);
      break;

    default:
      throw new Error(`Invalid method ${config.method}`);
  }

  nconf.save();
  return result;
};
