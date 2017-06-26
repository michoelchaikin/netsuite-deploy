const nconf = require('nconf');
const soap = require('soap-as-promised');
const wsdl = require('netsuite-suitetalk-wsdl-v2016-2.0');
const fs = require('fs');
const path = require('path');

const getNetsuiteDomain = require('./rest.js');

let client;

/**
 * Upload a single file to Netsuite using SuiteTalk (Web Services)
 * @param {Object} config The configuration object
 * @returns {Promise} A promise that will be resolved once file(s) have been uploaded
 */
module.exports = async function uploadToNetsuite(config) {
  if (!client) {
    client = await createSoapClient(config);
  }

  let folder;
  let folderID;
  let files = config.file instanceof Array ? config.file : [config.file];

  for (const file of files) {
    try {
      if (fs.lstatSync(file).isDirectory()) {
        continue;
      }
      console.log(`Uploading file ${file}`);

      folder = `${config.path}/${path.relative(config.base, path.dirname(file))}`;
      folderID = await getNetsuiteFolderID(config, folder);
      await uploadFile(file, folderID);
    } catch (error) {
      // It's possible that the cached id of the folder is invalid if the folder was deleted
      if (error.message === `Invalid folder reference key ${folderID}.`) {
        folderID = await getNetsuiteFolderID(config, folder, true);
        await uploadFile(config, folderID);
      } else {
        throw error;
      }
    }
  }
};

/**
 * @param {Config} config The configuration object
 * @returns {Promise.<Object>} The SOAP client object
 */
async function createSoapClient(config) {
  let client = await soap.createClient(wsdl.file);
  let domain = await getNetsuiteDomain(config, 'webservicesDomain');

  client.setEndpoint(domain + '/services/NetSuitePort_2016_2');

  client.addSoapHeader({
    passport: {
      account: config.account,
      email: config.email,
      password: config.password,
      role: {
        attributes: {
          internalId: config.role,
        },
      },
    },
    applicationInfo: {
      // copied from https://github.com/Topher84/NetSuite-Tools-For-WebStorm/blob/master/src/netsuite/NSClient.java
      // TODO: register my own one :-P
      applicationId: '79927DCC-D1D8-4884-A7C5-F2B155FA00F3',
    },
  });

  return client;
}

/**
 * Get the ID of a folder in the Netsuite File Cabinet, creating it (and it's parent folders) if required
 * @param {Config} config The configuration object
 * @param {string} folder The path to search for
 * @param {boolean} [ignoreCache=false] Ignore cached IDs
 * @returns {Promise.<number>} The Internal ID of the folder
 */
async function getNetsuiteFolderID(config, folder, ignoreCache = false) {
  folder = folder
    .replace('\\', '/') // use forward slashes only
    .replace(/(^[/\s]+)|([/\s]+$)/g, ''); // strip leading and trailing spaces and slashes

  let folderID = ignoreCache
    ? ''
    : parseInt(nconf.get(`${config.environment}:folderIDs:${folder}`));

  if (folderID) {
    return folderID;
  }

  let pathParts = folder.split('/').filter(elem => elem);

  for (let part of pathParts) {
    let id = await searchFolder(part, folderID);

    if (id) {
      folderID = id;
    } else {
      folderID = await createFolder(part, folderID);
    }
  }

  nconf.set(`${config.environment}:folderIDs:${folder}`, folderID);

  return folderID;
}

/**
 * @param {string} name Name of folder to search for
 * @param {number} [parent] The parent folder. If undefined, will search in the top level
 * @returns {Promise.<number>} The Internal ID of the folder if found, otherwise null
 */
async function searchFolder(name, parent) {
  let results = await client.search({
    ':searchRecord': {
      attributes: {
        'xmlns:platformCommon': 'urn:common_2016_2.platform.webservices.netsuite.com',
        'xmlns:platformCore': 'urn:core_2016_2.platform.webservices.netsuite.com',
        'xsi:type': 'platformCommon:FolderSearchBasic',
      },
      'platformCommon:name': {
        attributes: {
          'xsi:type': 'platformCore:SearchStringField',
          operator: 'is',
        },
        'platformCore:searchValue': {
          attributes: {
            'xsi:type': 'xsd:string',
          },
          $value: name,
        },
      },
      'platformCommon:parent': {
        attributes: {
          'xsi:type': 'platformCore:SearchMultiSelectField',
          operator: 'anyOf',
        },
        'platformCore:searchValue': {
          attributes: {
            'xsi:type': 'platformCore:RecordRef',
            internalId: parent ? parent : '@NONE@',
          },
        },
      },
    },
  });

  if (results['searchResult']['totalRecords']) {
    return results['searchResult']['recordList']['record'][0].attributes
      .internalId;
  }

  return null;
}

/**
 * @param {string} name Name of folder to create
 * @param {number} [parent] The parent folder. If undefined, will create it in the top level
 * @returns {Promise.<number>} The Internal ID of the created folder
 */
async function createFolder(name, parent) {
  let data = {
    ':record': {
      attributes: {
        'xmlns:platformFileCabinet': 'urn:filecabinet_2016_2.documents.webservices.netsuite.com',
        'xmlns:platformCore': 'urn:core_2016_2.platform.webservices.netsuite.com',
        'xsi:type': 'platformFileCabinet:Folder',
      },
      'platformFileCabinet:name': {
        attributes: {
          'xsi:type': 'xsd:string',
        },
        $value: name,
      },
    },
  };

  if (parent) {
    data[':record']['platformFileCabinet:parent'] = {
      attributes: {
        'xsi:type': 'platformCore:RecordRef',
        internalId: parent,
      },
    };
  }

  let results = await client.add(data);

  let status = results['writeResponse']['status'];
  let baseRef = results['writeResponse']['baseRef'];

  if (status.attributes['isSuccess'] !== 'true') {
    throw new Error(
      status['statusDetail'][0]['message'],
      status['statusDetail'].code
    );
  }

  return baseRef.attributes.internalId;
}

/**
 * @param {string} file Path to the file to upload
 * @param {number} folderID The Internal ID of the destination folder in the File Cabinet
 * @returns {Promise.<number>} Internal ID of the uploaded file
 */
async function uploadFile(file, folderID) {
  let content = fs.readFileSync(file, { encoding: 'base64' });

  let results = await client.add({
    ':record': {
      attributes: {
        'xmlns:platformFileCabinet': 'urn:filecabinet_2016_2.documents.webservices.netsuite.com',
        'xmlns:platformTypes': 'urn:types.filecabinet_2016_2.documents.webservices.netsuite.com',
        'xmlns:platformCore': 'urn:core_2016_2.platform.webservices.netsuite.com',
        'xsi:type': 'platformFileCabinet:File',
      },
      'platformFileCabinet:name': {
        attributes: {
          'xsi:type': 'xsd:string',
        },
        $value: path.basename(file),
      },
      'platformFileCabinet:attachFrom': {
        attributes: {
          'xsi:type': 'platformTypes:FileAttachFrom',
        },
        $value: '_computer',
      },
      'platformFileCabinet:fileType': {
        attributes: {
          'xsi:type': 'platformTypes:MediaType',
        },
        $value: '_JAVASCRIPT',
      },
      'platformFileCabinet:content': {
        $value: content,
      },
      'platformFileCabinet:folder': {
        attributes: {
          'xsi:type': 'platformCore:RecordRef',
          internalId: folderID,
        },
      },
    },
  });

  let status = results['writeResponse']['status'];
  let baseRef = results['writeResponse']['baseRef'];

  if (status.attributes['isSuccess'] !== 'true') {
    throw new Error(
      status['statusDetail'][0]['message'],
      status['statusDetail'].code
    );
  }

  return baseRef.attributes.internalId;
}
