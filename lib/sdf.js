const spawn = require('cross-spawn');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * @param {Config} config The configuration object
 * @return {Promise} Promise that will resolve after the SDF deployment is complete
 */
module.exports = async function doSDFUpload(config) {
    return new Promise((resolve, reject) => {
    let sdfcli = spawn(
      'sdfcli',
      [
        'deploy',
        '-url',
        `${config.account}.suitetalk.api.netsuite.com`,
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

    let output;
    
    sdfcli.stdout.on('data', data => {
      process.stdout.write(data);

      output = output + data.toString();

      if (output.includes('Enter password')) {
        console.log('******');
        sdfcli.stdin.write(config.password + '\n');
        output = "";
      }

      // Not using -np paramater because that will just fail silently if there are problems
      if (output.includes('Type YES to proceed with deploy.')) {
        sdfcli.stdin.write('YES\n');
        output = "";
      }

      if (output.includes('You are deploying to a Production account')) {
        readline.question('', answer => sdfcli.stdin.write(answer + '\n'));
        output = "";
      }
    });
  });
};
