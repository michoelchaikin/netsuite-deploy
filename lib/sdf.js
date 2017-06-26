const spawn = require('cross-spawn');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

const getNetsuiteDomain = require('./rest.js');

/**
 * @param {Config} config The configuration object
 * @return {Promise} Promise that will resolve after the SDF deployment is complete
 */
module.exports = async function doSDFUpload(config) {
  let url = await getNetsuiteDomain(config, 'systemDomain');

  return new Promise((resolve, reject) => {
    let sdfcli = spawn(
      'sdfcli',
      [
        'deploy',
        '-url',
        url,
        '-account',
        config.account,
        '-email',
        config.email,
        '-role',
        config.role,
        '-project',
        config.file,
      ],
      { stdio: ['pipe'] }
    )
      .on('error', reject)
      .on('close', () => {
        readline.close();
        resolve();
      });

    sdfcli.stdout.on('data', data => {
      process.stdout.write(data);

      let output = data.toString();

      if (output.includes('Enter password')) {
        console.log('******');
        sdfcli.stdin.write(config.password + '\n');
      }

      // Not using -np paramater because that will just fail silently if there are problems
      if (output.includes('Type YES to proceed with deploy.')) {
        sdfcli.stdin.write('YES\n');
      }

      if (output.includes('You are deploying to a Production account')) {
        readline.question('', answer => sdfcli.stdin.write(answer + '\n'));
      }
    });
  });
};
