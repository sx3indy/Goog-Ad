const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const buildEnvironment = {...process.env};
for (const [name, file] of [['HTTPS_PROXY', 'cloud_https_proxy'], ['HTTP_PROXY', 'cloud_http_proxy']]) {
  const path = `/run/secrets/${file}`;
  if (fs.existsSync(path)) buildEnvironment[name] = fs.readFileSync(path, 'utf8').trim();
}
if (fs.existsSync('/run/secrets/cloud_ca')) buildEnvironment.NODE_EXTRA_CA_CERTS = '/run/secrets/cloud_ca';
const result = spawnSync('npm', ['ci', '--no-audit', '--no-fund', ...process.argv.slice(2)], {env: buildEnvironment, stdio: 'inherit'});
if (result.error) console.error('Container dependency installation could not start');
process.exit(result.status ?? 1);
