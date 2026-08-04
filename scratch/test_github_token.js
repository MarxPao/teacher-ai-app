const https = require('https');

const token = process.argv[2] || process.env.GITHUB_TOKEN || '';

if (!token) {
  console.error('Nenhum token fornecido.');
  process.exit(1);
}

const options = {
  hostname: 'api.github.com',
  path: '/user',
  method: 'GET',
  headers: {
    'User-Agent': 'TeacherAI-App',
    'Authorization': `token ${token}`
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    if (res.statusCode === 200) {
      const user = JSON.parse(data);
      console.log('✅ Token VÁLIDO! Usuário:', user.login);
    } else {
      console.log('❌ Token INVÁLIDO ou EXPIRADO:', data);
    }
  });
});

req.on('error', (err) => {
  console.error('Erro de conexão:', err.message);
});

req.end();
